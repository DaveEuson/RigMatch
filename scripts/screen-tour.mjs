import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Walk Simple Mode one screen at a time and photograph each one.
 *
 * visual-smoke.mjs answers "is it broken?" — this answers "how does it read?".
 * It stops on every step of the wizard, captures the screen, and pulls out the
 * things a beginner actually meets there: what the Host says, which words are
 * offered for explanation, and every other piece of text on the page. The last
 * of those is the point — anything in `unexplained` is jargon the wizard uses
 * without defining, which is exactly the gap this pass is meant to close.
 *
 * Usage:  node scripts/screen-tour.mjs
 */

const DEFAULT_URL = 'http://127.0.0.1:5173/';
const targetUrl = process.env.RIGMATCH_TOUR_URL || DEFAULT_URL;
const outDir = process.env.RIGMATCH_TOUR_OUT || path.join(tmpdir(), 'rigmatch-screen-tour');

/**
 * Words a first-timer will not know, checked against whatever the screen says.
 * Deliberately spelled as they appear on screen — this is a reading test, not a
 * lookup against the glossary's own ids.
 */
const JARGON = [
  'VRAM', 'GPU', 'quantization', 'quantized', 'parameters', 'token', 'tokens',
  'tokens/sec', 'context window', 'inference', 'checkpoint', 'LLM', 'prompt',
  'benchmark', 'latency', 'throughput', 'weights', 'fine-tune', 'embedding',
  'ComfyUI', 'Ollama', 'digest', 'schema', 'sobriety',
];

mkdirSync(outDir, { recursive: true });
let devServer = null;

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
  const tour = await run(targetUrl);
  stopDevServer();
  process.stdout.write(`${JSON.stringify({ outDir, screens: tour }, null, 2)}\n`);
}

async function run(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('rigmatch:ui-mode:v1', 'beginner');
    localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
    localStorage.setItem('rigmatch:mode-splash:v1', 'chosen');
    localStorage.setItem('rigmatch:goals-offered:v1', 'yes');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.sw-shell', { timeout: 10000 });

  const screens = [];
  const seen = new Set();

  // Advance by the footer's own forward button rather than the step pills: the
  // pills allow jumps the wizard would not otherwise permit, which would
  // photograph states a real user cannot reach in this order.
  for (let guard = 0; guard < 8; guard += 1) {
    const step = await currentStep(page);
    if (!step || seen.has(step)) break;
    seen.add(step);
    screens.push(await capture(page, step));

    const next = page.locator('.sw-footer-right button:not([disabled])').last();
    if ((await next.count()) === 0) break;
    const before = step;
    await next.click().catch(() => {});
    await page.waitForFunction(
      (prev) => document.querySelector('.sw-step.active .sw-step-label')?.textContent?.trim().toLowerCase() !== prev,
      before,
      { timeout: 5000 },
    ).catch(() => {});
  }

  await browser.close();
  return screens;
}

async function currentStep(page) {
  return page.locator('.sw-step.active .sw-step-label').first().textContent()
    .then((text) => text?.trim().toLowerCase() || null)
    .catch(() => null);
}

async function capture(page, step) {
  const file = path.join(outDir, `${step}.png`);
  await page.screenshot({ path: file, fullPage: true });

  const host = await page.locator('.sw-host-bubble').innerText().catch(() => '');
  const explainable = await page.locator('.sw-explain-term').allTextContents();
  const body = await page.locator('.sw-content').innerText().catch(() => '');
  const buttons = (await page.locator('.sw-content button').allTextContents())
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Jargon the screen uses but does not offer to explain. The explainable
  // terms are subtracted so a word already wired to the Host is not reported.
  const offered = explainable.join(' ').toLowerCase();
  const page_text = `${host}\n${body}`;
  const unexplained = JARGON.filter((word) => {
    const onScreen = new RegExp(`\\b${word.replace(/[/]/g, '\\/')}\\b`, 'i').test(page_text);
    return onScreen && !offered.includes(word.toLowerCase());
  });

  return {
    step,
    file,
    host: host.replace(/\s+/g, ' ').trim(),
    explainable,
    unexplained,
    buttons: [...new Set(buttons)],
    words: body.split(/\s+/).filter(Boolean).length,
  };
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

process.on('exit', stopDevServer);
main().catch((error) => {
  stopDevServer();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
