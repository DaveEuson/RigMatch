#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Pointing at a word must not move the page.
 *
 * Simple Mode explains its vocabulary by swapping the host's speech bubble for
 * the definition. An explanation runs to three paragraphs where the narration
 * is two lines, so the bubble grew by ~33px and every element beneath it
 * jumped down — each time the pointer crossed a term. "The whole screen
 * dances", which is exactly right and made the feature feel broken.
 *
 * Measured from the strip's own top, not the viewport: hovering scrolls an
 * element into view, and a viewport-relative measurement reports that scroll
 * as a 224px "shift" — a false alarm that hides the real 33px one.
 *
 * Usage:  node scripts/gate-no-dance.mjs
 */

import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const url = process.env.RIGMATCH_TOUR_URL || 'http://127.0.0.1:5173/';
/** More than a rounding wobble, less than a line of text. */
const TOLERANCE_PX = 2;

let dev = null;
const reachable = async () => {
  try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
};
if (!(await reachable())) {
  dev = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const began = Date.now();
  while (Date.now() - began < 40000 && !(await reachable())) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ headless: true });
const results = [];

for (const step of ['setup', 'pick']) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 980 } })).newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('rigmatch:ui-mode:v1', 'beginner');
    localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
    localStorage.setItem('rigmatch:mode-splash:v1', 'chosen');
    localStorage.setItem('rigmatch:goals-offered:v1', 'yes');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sw-shell');
  if (step === 'pick') {
    await page.locator('.sw-footer-right button:not([disabled])').last().click();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(400);

  /** Distance from the host strip to the first thing under it — scroll-proof. */
  const gap = () => page.evaluate(() => {
    const strip = document.querySelector('.sw-host-strip');
    const content = document.querySelector('.sw-content');
    if (!strip || !content) return null;
    const after = [...content.children].find((node) => !node.classList.contains('sw-host-strip'));
    if (!after) return null;
    return {
      stripHeight: Math.round(strip.getBoundingClientRect().height),
      offset: Math.round(after.getBoundingClientRect().top - strip.getBoundingClientRect().top),
    };
  });

  const rest = await gap();
  if (!rest) { results.push({ step, term: '(layout)', shift: null, note: 'could not find the strip' }); continue; }

  const terms = await page.locator('.sw-explain-term').allTextContents();
  for (const [i, term] of terms.entries()) {
    await page.locator('.sw-explain-term').nth(i).hover();
    await page.waitForTimeout(200);
    const on = await gap();
    results.push({
      step,
      term,
      shift: Math.abs(on.offset - rest.offset),
      grew: on.stripHeight - rest.stripHeight,
    });
    await page.mouse.move(4, 4);
    await page.waitForTimeout(140);
  }
  await page.context().close();
}

console.log('Pointing at a term must not move the page\n');
let worst = 0;
for (const row of results) {
  const bad = row.shift === null || row.shift > TOLERANCE_PX;
  if (row.shift !== null && row.shift > worst) worst = row.shift;
  console.log(`  ${bad ? 'FAIL' : 'pass'}  ${row.step.padEnd(6)} "${row.term}"`.padEnd(46)
    + (row.shift === null ? row.note : `content moved ${row.shift}px, strip grew ${row.grew}px`));
}

const failed = results.filter((r) => r.shift === null || r.shift > TOLERANCE_PX);
console.log(failed.length === 0
  ? `\nGate closed: ${results.length} terms, worst movement ${worst}px.`
  : `\nGate OPEN: ${failed.length} of ${results.length} terms move the page.`);

await browser.close();
if (dev) spawnSync('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' });
process.exitCode = failed.length === 0 ? 0 : 1;
