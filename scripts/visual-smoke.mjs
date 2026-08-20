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

// Navigations wait for `domcontentloaded`, never `networkidle`. The app polls
// Ollama and the local providers on a timer, so with those services actually
// running the network never goes idle and every goto times out at 30s — the
// script failed hardest exactly when the machine was most fully set up. What the
// screenshots depend on is the selector waits and settleImages() below, both of
// which wait for the app rather than for silence.
async function runBrowserChecks(url) {
  const browser = await chromium.launch({ headless: true });
  /**
   * Hold until every image on the page has actually decoded.
   *
   * Navigation waits only cover the first load. Switching to
   * Advanced mounts panels whose avatars start loading after that, so the
   * screenshot raced them: the same commit produced a shot with 24 robot
   * avatars or with 24 empty boxes depending on timing, a 74KB swing in the PNG.
   *
   * That cost an investigation. A screenshot is the evidence this script exists
   * to produce, and one that silently omits content is worse than no screenshot
   * — it was read as a CSS regression, and the CSS was innocent.
   */
  const settleImages = async (target, label) => {
    await target.waitForFunction(() => {
      const images = [...document.images];
      return images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0);
    }, null, { timeout: 15000 }).catch(() => {
      throw new Error(`${label}: images never finished loading — the screenshot would be missing content`);
    });
    await target.evaluate(() => document.fonts.ready);
  };

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  const consoleIssues = collectConsoleIssues(page);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await forceSimpleMode(page);
  await page.waitForSelector('.sw-shell', { timeout: 10000 });
  await assertNoBlockingDialog(page);

  const title = await page.title();
  const simpleText = await page.locator('body').innerText();
  // Simple Mode is the guided wizard: its shell is present, the step pills are
  // the navigation, and none of the Advanced chrome renders.
  const simpleWizardVisible = await page.locator('.sw-shell').isVisible();
  // textContent, not innerText: the labels are display:none below 1280px, and
  // innerText would come back empty there.
  const simpleStepLabels = (await page.locator('.sw-steps .sw-step-label').allTextContents())
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
  const simpleMenuHidden = !(await page.locator('.side-menu').isVisible().catch(() => false));
  const simpleNoAdvancedChrome = (await page.locator('.top-deck, .advanced-host-bar, .ticker').count()) === 0;
  const desktopOverflowX = await hasHorizontalOverflow(page);
  const overlayCount = await page.locator('.vite-error-overlay, vite-error-overlay').count();
  await settleImages(page, 'simple');
  await page.screenshot({ path: screenshots.simple, fullPage: false });

  await page.getByLabel('Advanced Mode').click();
  await page.waitForSelector('.advanced-host-bar', { timeout: 10000 });
  const advancedText = await page.locator('.advanced-host-bar').innerText();
  const wizardGoneInAdvanced = !(await page.locator('.sw-shell').isVisible().catch(() => false));
  const advancedMenuVisible = await page.locator('.side-menu').isVisible();
  await settleImages(page, 'advanced');
  await page.screenshot({ path: screenshots.advanced, fullPage: false });

  /**
   * A chat round trip, which lives here rather than in the desktop gate.
   *
   * The dock is unreachable in a cold desktop profile — no scan, so no scored
   * model and no "Talk to Model" — and the ticker's Chat button launches the
   * separate RigChat companion there, raising a blocking alert when it is not
   * packaged. Preview has demo data and stubs sendChat below the callback, so
   * this exercises the real composer, the real transcript keyed by model, and
   * the real draft-clearing. The reply text is a stub; everything above it is not.
   */
  let chatRoundTrip = false;
  let chatDraftCleared = false;
  try {
    await page.locator('.ticker-chat-link').click();
    await page.waitForSelector('.chat-dock', { timeout: 10000 });
    // The composer carries no type attribute, so `input[type=text]` misses it.
    const composer = page.locator('.chat-form input:not([type=file])').first();
    const beforeChat = await page.locator('.chat-stream').innerText();
    await composer.fill('smoke check: are you there?');
    await page.locator('.chat-form button[type=submit]').click();
    await page.waitForTimeout(2000);
    const afterChat = await page.locator('.chat-stream').innerText();
    chatRoundTrip = afterChat.includes('smoke check') && afterChat.length > beforeChat.length + 30;
    chatDraftCleared = (await composer.inputValue()) === '';
    await page.locator('.chat-dock').getByRole('button', { name: /close/i }).first().click().catch(() => {});
  } catch {
    // Left false, which fails the run below rather than passing quietly.
  }

  // The smallest window the packaged app allows: it sets minWidth 1280 and
  // minHeight 820, so this exact size is the reachable worst case rather than a
  // hypothetical one. The rail silently clipped Activity and Settings off the
  // end here — it scrolls, which is intended, but nothing said so, and the
  // primary navigation appeared to stop before Settings existed. Checking
  // 1440x820 instead missed it, because the wider rail keeps labels on one
  // line and the items shorter.
  const shortCtx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const shortPage = await shortCtx.newPage();
  await shortPage.goto(url, { waitUntil: 'domcontentloaded' });
  await forceSimpleMode(shortPage);
  await shortPage.getByLabel('Advanced Mode').click();
  await shortPage.waitForSelector('.side-menu-item', { timeout: 10000 });
  const clippedNav = await shortPage.evaluate(() => {
    const menu = document.querySelector('.side-menu');
    if (!menu) return ['side menu missing'];
    const box = menu.getBoundingClientRect();
    return [...menu.querySelectorAll('.side-menu-item')]
      .filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.bottom > box.bottom + 1 || rect.top < box.top - 1;
      })
      .map((item) => item.getAttribute('aria-label') || 'unnamed');
  });
  await shortCtx.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true });
  const mobilePage = await mobile.newPage();
  const mobileConsoleIssues = collectConsoleIssues(mobilePage);
  await mobilePage.goto(url, { waitUntil: 'domcontentloaded' });
  await forceSimpleMode(mobilePage);
  await mobilePage.waitForSelector('.sw-shell', { timeout: 10000 });
  const mobileText = await mobilePage.locator('body').innerText();
  const mobileOverflowX = await hasHorizontalOverflow(mobilePage);
  const mobileWizardVisible = await mobilePage.locator('.sw-shell').isVisible();
  await settleImages(mobilePage, 'mobile');
  await mobilePage.screenshot({ path: screenshots.mobile, fullPage: false });

  await browser.close();

  const issues = [...consoleIssues, ...mobileConsoleIssues].filter((line) => !line.includes('frame-ancestors'));
  const checks = {
    title: title === 'RigMatch',
    simpleWizardVisible,
    simpleStepPills: stepRailIsValid(simpleStepLabels),
    simpleMenuHidden,
    simpleNoAdvancedChrome,
    advancedControlRoom: advancedText.includes('Advanced Control Room'),
    chatRoundTrip,
    chatDraftCleared,
    wizardGoneInAdvanced,
    advancedMenuVisible,
    desktopNoOverflow: !desktopOverflowX,
    mobileNoOverflow: !mobileOverflowX,
    mobileWizardVisible,
    noFrameworkOverlay: overlayCount === 0,
    noConsoleIssues: issues.length === 0,
    noOldSobrietyCopy: !simpleText.includes('Sobriety') && !mobileText.includes('Sobriety'),
    navReachableOnShortScreen: clippedNav.length === 0,
  };
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);

  if (failed.length > 0) {
    const railDetail = failed.includes('simpleStepPills')
      ? `; step rail: [${simpleStepLabels.join(', ') || 'none'}]`
      : '';
    if (failed.includes('navReachableOnShortScreen')) {
      throw new Error(`Visual smoke failed: the nav rail clips [${clippedNav.join(', ')}] `
        + "at 1280x820, the app's own minimum window size");
    }
    throw new Error(`Visual smoke failed: ${failed.join(', ')}${railDetail}${issues.length ? `; console: ${issues.join(' | ')}` : ''}`);
  }

  return {
    url,
    checks,
    stepRail: simpleStepLabels,
    clippedNav,
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

/**
 * A modal left open here does not fail the run — it makes every later click
 * retry until the whole script times out, with the reason buried in Playwright
 * retry noise. Name it instead.
 */
async function assertNoBlockingDialog(page) {
  const blocker = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    return dialog ? (dialog.getAttribute('aria-label') || dialog.className) : null;
  });
  if (blocker) {
    throw new Error(`A modal dialog is blocking the page: "${blocker}". `
      + 'Seed whatever storage key dismisses it in forceSimpleMode().');
  }
}

async function forceSimpleMode(page) {
  await page.evaluate(() => {
    localStorage.setItem('rigmatch:ui-mode:v1', 'beginner');
    localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
    // The mode splash is a modal dialog that intercepts pointer events, so
    // without this the Advanced Mode click below never lands.
    localStorage.setItem('rigmatch:mode-splash:v1', 'chosen');
    // 0.6 added a second first-run dialog: someone who chose a mode before
    // goals existed is still asked the goal question, which is right for a
    // real upgrade and fatal for a screenshot run — it intercepts the same
    // pointer events and the script retried a click for sixty seconds.
    localStorage.setItem('rigmatch:goals-offered:v1', 'yes');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

// The wizard's canonical rail, from SimpleWizard.tsx's STEPS. It renders these
// in order and can drop exactly one: `download` is filtered out when every
// picked model is already installed, which is always true of the sample-data
// demo this smoke runs against. So assert the rail's shape rather than a fixed
// count — a bare `length >= 4` would pass on four wrong pills in any order.
const WIZARD_STEPS = ['setup', 'pick', 'download', 'compare', 'winner'];
const SKIPPABLE_STEPS = new Set(['download']);

function stepRailIsValid(labels) {
  if (labels.length === 0) return false;

  // Every step that cannot be skipped must be present.
  const required = WIZARD_STEPS.filter((step) => !SKIPPABLE_STEPS.has(step));
  if (!required.every((step) => labels.includes(step))) return false;

  // What rendered must be a subsequence of the canonical order: this rejects
  // unknown labels, duplicates, and any reordering.
  let cursor = 0;
  for (const label of labels) {
    const index = WIZARD_STEPS.indexOf(label, cursor);
    if (index === -1) return false;
    cursor = index + 1;
  }
  return true;
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
