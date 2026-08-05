import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:5173/';
const targetUrl = process.env.RIGMATCH_SMOKE_URL || DEFAULT_URL;
const outDir = process.env.RIGMATCH_SMOKE_OUT || path.join(tmpdir(), 'rigmatch-visual-smoke');
const screenshots = {
  simple: path.join(outDir, 'simple-desktop.png'),
  advanced: path.join(outDir, 'advanced-desktop.png'),
  mobile: path.join(outDir, 'simple-mobile.png'),
};

mkdirSync(outDir, { recursive: true });

let devServer = null;

// On Windows the dev server is spawned through a shell, so child.kill() only
// reaches the shell wrapper and the Vite process keeps the port (and this
// script's stdio) alive forever. Kill the whole process tree instead.
function stopDevServer() {
  if (!devServer || devServer.killed) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(devServer.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    devServer.kill();
  }
  devServer = null;
}

async function main() {
  const serverWasRunning = await isReachable(targetUrl);
  if (!serverWasRunning) {
    devServer = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1'], {
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForUrl(targetUrl, 30000);
  }

  const result = await runBrowserChecks(targetUrl);
  stopDevServer();

  process.stdout.write(`${JSON.stringify({
    ...result,
    serverWasRunning,
    screenshots,
    screenshotBytes: Object.fromEntries(
      Object.entries(screenshots).map(([key, file]) => [key, statSync(file).size]),
    ),
  }, null, 2)}\n`);
}

async function runBrowserChecks(url) {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  const consoleIssues = collectConsoleIssues(page);

  await page.goto(url, { waitUntil: 'networkidle' });
  await forceSimpleMode(page);
  await page.waitForSelector('.sw-shell', { timeout: 10000 });

  const title = await page.title();
  const simpleText = await page.locator('body').innerText();
  // Simple Mode is the five-step wizard: its shell is present, the step pills
  // are the navigation, and none of the Advanced chrome renders.
  const simpleWizardVisible = await page.locator('.sw-shell').isVisible();
  const simpleStepCount = await page.locator('.sw-steps .sw-step').count();
  const simpleMenuHidden = !(await page.locator('.side-menu').isVisible().catch(() => false));
  const simpleNoAdvancedChrome = (await page.locator('.top-deck, .advanced-host-bar, .ticker').count()) === 0;
  const desktopOverflowX = await hasHorizontalOverflow(page);
  const overlayCount = await page.locator('.vite-error-overlay, vite-error-overlay').count();
  await page.screenshot({ path: screenshots.simple, fullPage: false });

  await page.getByLabel('Advanced Mode').click();
  await page.waitForSelector('.advanced-host-bar', { timeout: 10000 });
  const advancedText = await page.locator('.advanced-host-bar').innerText();
  const wizardGoneInAdvanced = !(await page.locator('.sw-shell').isVisible().catch(() => false));
  const advancedMenuVisible = await page.locator('.side-menu').isVisible();
  await page.screenshot({ path: screenshots.advanced, fullPage: false });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true });
  const mobilePage = await mobile.newPage();
  const mobileConsoleIssues = collectConsoleIssues(mobilePage);
  await mobilePage.goto(url, { waitUntil: 'networkidle' });
  await forceSimpleMode(mobilePage);
  await mobilePage.waitForSelector('.sw-shell', { timeout: 10000 });
  const mobileText = await mobilePage.locator('body').innerText();
  const mobileOverflowX = await hasHorizontalOverflow(mobilePage);
  const mobileWizardVisible = await mobilePage.locator('.sw-shell').isVisible();
  await mobilePage.screenshot({ path: screenshots.mobile, fullPage: false });

  await browser.close();

  const issues = [...consoleIssues, ...mobileConsoleIssues].filter((line) => !line.includes('frame-ancestors'));
  const checks = {
    title: title === 'RigMatch',
    simpleWizardVisible,
    simpleStepPills: simpleStepCount === 5,
    simpleMenuHidden,
    simpleNoAdvancedChrome,
    advancedControlRoom: advancedText.includes('Advanced Control Room'),
    wizardGoneInAdvanced,
    advancedMenuVisible,
    desktopNoOverflow: !desktopOverflowX,
    mobileNoOverflow: !mobileOverflowX,
    mobileWizardVisible,
    noFrameworkOverlay: overlayCount === 0,
    noConsoleIssues: issues.length === 0,
    noOldSobrietyCopy: !simpleText.includes('Sobriety') && !mobileText.includes('Sobriety'),
  };
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);

  if (failed.length > 0) {
    throw new Error(`Visual smoke failed: ${failed.join(', ')}${issues.length ? `; console: ${issues.join(' | ')}` : ''}`);
  }

  return {
    url,
    checks,
    consoleIssues: issues,
  };
}

function collectConsoleIssues(page) {
  const issues = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`);
  });
  return issues;
}

async function forceSimpleMode(page) {
  await page.evaluate(() => {
    localStorage.setItem('rigmatch:ui-mode:v1', 'beginner');
    localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

process.on('exit', () => {
  stopDevServer();
});

main().catch((error) => {
  stopDevServer();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
