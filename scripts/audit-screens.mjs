#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Drive every screen and answer the mechanical half of the screen audit.
 *
 * Categories 2, 6 and 7 — dead controls, missing affordance, size — are
 * checkable by a machine if it actually operates the app, and those are
 * exactly the ones a person's eye slides over on the twentieth pass. The
 * judgement calls (claims, agreement, honesty of score) still need reading;
 * this narrows where to read.
 *
 * Usage:  node scripts/audit-screens.mjs
 */

import { chromium } from 'playwright';
import { leaseDevServer, COLD_START_MS } from './dev-server-lease.mjs';

const url = process.env.RIGMATCH_TOUR_URL || 'http://127.0.0.1:5173/';
const lease = await leaseDevServer(url, { timeoutMs: 180_000 });

const browser = await chromium.launch({ headless: true });
const findings = [];

/** Everything a screen can tell us about its own controls. */
const AUDIT = () => {
  const visible = (node) => {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const label = (node) => (node.getAttribute('aria-label') || node.textContent || '')
    .replace(/\s+/g, ' ').trim().slice(0, 52) || node.className;

  const controls = [...document.querySelectorAll('button, a[href], select, input, textarea, [role="button"]')]
    .filter(visible);

  // 2. CONTROLS — disabled, and does anything nearby say why?
  const dead = controls
    .filter((node) => node.disabled || node.getAttribute('aria-disabled') === 'true')
    .map((node) => {
      // A reason counts if it is in the control, its title, or the block it sits in.
      const own = (node.textContent || '')
        + (node.getAttribute('title') || '')
        + (node.getAttribute('aria-label') || '');
      const container = node.closest('section, article, div, li, form');
      const near = container ? (container.textContent || '') : '';
      const REASON = /needs?|first|until|requires?|no |none|full|unavailable|not (yet|running|installed)|download|start|pick|choose|select|run the|set up|empty|managed (by|in|through)|nothing to|already/i;
      return {
        label: label(node),
        reasonInControl: REASON.test(own),
        reasonNearby: REASON.test(near.slice(0, 700)),
      };
    })
    .filter((entry) => !entry.reasonInControl && !entry.reasonNearby);

  // 7. SIZE — targets and text. Inline controls inside a sentence are exempt
  // from the target-size rule (WCAG 2.2), so they are not counted.
  const inSentence = (node) => {
    const parent = node.parentElement;
    if (!parent || !parent.matches('p, li, em, span, small, td, label, h1, h2, h3, h4')) return false;
    const own = (node.textContent || '').trim();
    return (parent.textContent || '').trim().length > own.length + 2;
  };
  const tiny = controls
    .filter((node) => !inSentence(node))
    .filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && (box.width < 24 || box.height < 24);
    })
    .map((node) => {
      const box = node.getBoundingClientRect();
      return `${label(node)} ${Math.round(box.width)}x${Math.round(box.height)}`;
    });

  const unreadable = [...document.querySelectorAll('body *')]
    .filter(visible)
    .filter((node) => node.children.length === 0 && (node.textContent || '').trim().length > 2)
    .filter((node) => {
      const size = parseFloat(getComputedStyle(node).fontSize);
      return node.closest('button, a[href], label') ? size < 10 : size < 9;
    })
    .map((node) => `${label(node)} @${getComputedStyle(node).fontSize}`);

  // 7. SIZE — anything past the right edge that is not inside a scroller.
  const vw = document.documentElement.clientWidth;
  const inScroller = (node) => {
    for (let p = node.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const overflowing = [...document.querySelectorAll('body *')]
    .filter(visible)
    .filter((node) => !inScroller(node) && node.getBoundingClientRect().right > vw + 1)
    .map(label);

  return {
    controlCount: controls.length,
    dead: [...new Set(dead.map((d) => d.label))],
    tiny: [...new Set(tiny)],
    unreadable: [...new Set(unreadable)],
    overflowing: [...new Set(overflowing)].slice(0, 5),
  };
};

/** 6. AFFORDANCE — does a pointer change anything? */
async function hoverCheck(page, selector, limit = 6) {
  const nodes = page.locator(selector);
  const count = Math.min(await nodes.count(), limit);
  const numb = [];
  for (let i = 0; i < count; i += 1) {
    const node = nodes.nth(i);
    if (!(await node.isVisible().catch(() => false))) continue;
    // A control that is already the selected one has nothing to indicate on
    // hover — flagging it produced a finding that would be wrong to "fix".
    const selected = await node.evaluate((el) => el.classList.contains('active')
      || el.getAttribute('aria-pressed') === 'true'
      || el.getAttribute('aria-current') === 'step');
    if (selected) continue;
    const read = () => node.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.backgroundColor}|${s.color}|${s.borderColor}|${s.opacity}|${s.transform}`;
    });
    const before = await read();
    await node.hover({ timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(140);
    const after = await read();
    if (before === after) {
      const name = await node.evaluate((el) => (el.getAttribute('aria-label') || el.textContent || el.className || '').replace(/\s+/g, ' ').trim().slice(0, 44));
      numb.push(name);
    }
    await page.mouse.move(3, 3);
  }
  return numb;
}

// The app's own minimum window: minWidth 1024 / minHeight 640. Audited at that
// size on purpose — it is the worst case a user can actually produce, and the
// number has to follow createWindow() or this audits a window nobody has.
const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: COLD_START_MS });
await page.evaluate(() => {
  localStorage.setItem('rigmatch:ui-mode:v1', 'advanced');
  localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
  localStorage.setItem('rigmatch:mode-splash:v1', 'chosen');
  localStorage.setItem('rigmatch:goals-offered:v1', 'yes');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.side-menu-item', { timeout: 20000 });

const navLabels = await page.locator('.side-menu-item').evaluateAll(
  (nodes) => nodes.map((n) => n.getAttribute('aria-label') || ''),
);

for (const [index, name] of navLabels.entries()) {
  await page.locator('.side-menu-item').nth(index).click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);

  const report = await page.evaluate(AUDIT);
  const numb = await hoverCheck(page, '.panel button:not([disabled]), .panel a[href]');

  const problems = [];
  if (report.dead.length) problems.push(`DEAD, no reason given: ${report.dead.join(' | ')}`);
  if (numb.length) problems.push(`no hover response: ${numb.join(' | ')}`);
  if (report.overflowing.length) problems.push(`overflows: ${report.overflowing.join(' | ')}`);
  if (report.tiny.length) problems.push(`under 24px: ${report.tiny.join(' | ')}`);
  if (report.unreadable.length) problems.push(`too small to read: ${report.unreadable.join(' | ')}`);

  console.log(`\n${name}  (${report.controlCount} controls)`);
  if (problems.length === 0) console.log('  clean');
  for (const problem of problems) console.log(`  · ${problem}`);
  if (problems.length) findings.push({ screen: name, problems });
}

if (pageErrors.length) {
  console.log(`\nPAGE ERRORS: ${pageErrors.slice(0, 3).join(' | ')}`);
  findings.push({ screen: '(runtime)', problems: pageErrors.slice(0, 3) });
}

console.log(`\n${findings.length === 0 ? 'No mechanical findings.' : `${findings.length} screen(s) with findings.`}`);
await browser.close();
lease.stop();
