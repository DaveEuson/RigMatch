// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { leaseDevServer, COLD_START_MS } from './dev-server-lease.mjs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Both modes, at every window size a real machine actually has.
 *
 * visual-smoke checks two sizes and screen-tour checks one. Every layout bug
 * found so far has lived at a size nobody looked at — the nav rail dropped
 * Activity and Settings at 1440x820 and had done so for as long as there have
 * been eight nav items. This sweeps the range and reports, per size:
 *
 *   overflow   — the page scrolls sideways, or an element sticks out past it
 *   clipped    — an element sits outside its own scroll container's box
 *   broken     — an <img> that resolved to nothing
 *   tiny       — interactive targets under 24px (WCAG 2.2 minimum)
 *   unreadable — text under 11px
 *
 * Usage:  node scripts/responsive-sweep.mjs [--shots]
 */

const url = process.env.RIGMATCH_TOUR_URL || 'http://127.0.0.1:5173/';
const wantShots = process.argv.includes('--shots');
const outDir = process.env.RIGMATCH_TOUR_OUT || path.join(tmpdir(), 'rigmatch-responsive');
mkdirSync(outDir, { recursive: true });

/** Real hardware, not round numbers: the two laptops are the common ones. */
const SIZES = [
  { w: 360, h: 740, note: 'phone' },
  { w: 768, h: 1024, note: 'tablet' },
  { w: 1024, h: 640, note: 'small laptop, short' },
  // The packaged window sets minWidth 1280 / minHeight 820, so this exact size
  // is the smallest the desktop app can ever be — the reachable worst case.
  { w: 1280, h: 820, note: "the app's own minimum window" },
  { w: 1366, h: 768, note: 'the most common laptop' },
  { w: 1440, h: 820, note: 'macbook air' },
  { w: 1920, h: 1080, note: 'desktop' },
  { w: 2560, h: 1440, note: 'wide desktop' },
];

const lease = await leaseDevServer(url, { timeoutMs: 180_000 });
const stop = () => lease.stop();

const browser = await chromium.launch({ headless: true });
const findings = [];

for (const mode of ['beginner', 'advanced']) {
  for (const size of SIZES) {
    const context = await browser.newContext({
      viewport: { width: size.w, height: size.h },
      isMobile: size.w < 768,
      hasTouch: size.w < 768,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: COLD_START_MS });
    await page.evaluate((uiMode) => {
      localStorage.setItem('rigmatch:ui-mode:v1', uiMode);
      localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
      localStorage.setItem('rigmatch:mode-splash:v1', 'chosen');
      localStorage.setItem('rigmatch:goals-offered:v1', 'yes');
    }, mode);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(mode === 'beginner' ? '.sw-shell' : '.side-menu', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(700);

    const report = await page.evaluate(() => {
      const root = document.documentElement;
      const vw = root.clientWidth;
      const label = (node) => {
        const text = (node.getAttribute('aria-label') || node.textContent || '').replace(/\s+/g, ' ').trim();
        return `${String(node.className).split(' ')[0] || node.tagName.toLowerCase()}${text ? ` "${text.slice(0, 40)}"` : ''}`;
      };
      const visible = (node) => {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };

      const all = [...document.querySelectorAll('body *')].filter(visible);

      // Sticking out past the right edge. Ignore anything inside a container
      // that scrolls horizontally on purpose — that is a design, not a bug.
      const inScroller = (node) => {
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const overflowX = getComputedStyle(parent).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') return true;
        }
        return false;
      };
      const overflowing = all
        .filter((node) => !inScroller(node))
        .filter((node) => node.getBoundingClientRect().right > vw + 1)
        .map(label);

      // Broken images.
      const broken = [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => String(image.getAttribute('src')).slice(0, 70));

      // Interactive targets too small to hit. WCAG 2.2 exempts targets that sit
      // inside a sentence — the Host's explainable terms are exactly that — so
      // a control is only counted when it is not flowing inside running text.
      // Without this exemption the check flagged every screen and stopped being
      // worth reading.
      const inRunningText = (node) => {
        const parent = node.parentElement;
        if (!parent) return false;
        if (!parent.matches('p, li, em, span, small, td, label, h1, h2, h3, h4')) return false;
        // Something is running text if the parent holds words besides this control.
        const own = (node.textContent || '').trim();
        const around = (parent.textContent || '').trim();
        return around.length > own.length + 2;
      };
      const tiny = all
        .filter((node) => node.matches('button, a[href], input, select, [role="button"]'))
        .filter((node) => !inRunningText(node))
        .filter((node) => {
          const box = node.getBoundingClientRect();
          return (box.width < 24 || box.height < 24) && box.width > 0;
        })
        .map((node) => {
          const box = node.getBoundingClientRect();
          return `${label(node)} ${Math.round(box.width)}x${Math.round(box.height)}`;
        });

      // Text nobody can read. Controls are held to a higher bar than decorative
      // eyebrows: a label you must read to operate the thing is not the same as
      // a caption above it.
      const isControl = (node) => Boolean(node.closest('button, a[href], label, [role="button"]'));
      const unreadable = all
        .filter((node) => node.children.length === 0 && (node.textContent || '').trim().length > 2)
        .filter((node) => {
          const size = parseFloat(getComputedStyle(node).fontSize);
          return isControl(node) ? size < 10 : size < 9;
        })
        .map((node) => `${label(node)} @${getComputedStyle(node).fontSize}${isControl(node) ? ' (control)' : ''}`);

      // Anything sitting outside the box of its own scroll container.
      const clipped = [];
      for (const container of document.querySelectorAll('.side-menu, .sw-content, .panel')) {
        const box = container.getBoundingClientRect();
        for (const child of container.querySelectorAll('.side-menu-item, .sw-step, .sw-card')) {
          const childBox = child.getBoundingClientRect();
          if (childBox.bottom > box.bottom + 1 || childBox.right > box.right + 1) clipped.push(label(child));
        }
      }

      return {
        pageScrollsSideways: root.scrollWidth > vw + 1,
        overflowing: [...new Set(overflowing)].slice(0, 6),
        broken: [...new Set(broken)].slice(0, 6),
        tiny: [...new Set(tiny)].slice(0, 6),
        unreadable: [...new Set(unreadable)].slice(0, 6),
        clipped: [...new Set(clipped)].slice(0, 6),
      };
    });

    if (wantShots) {
      await page.evaluate(() => Promise.all([...document.images]
        .filter((image) => !image.complete)
        .map((image) => image.decode().catch(() => undefined)))).catch(() => undefined);
      await page.screenshot({ path: path.join(outDir, `${mode}-${size.w}x${size.h}.png`) });
    }

    const problems = [];
    if (report.pageScrollsSideways) problems.push('page scrolls sideways');
    if (report.overflowing.length) problems.push(`overflows: ${report.overflowing.join(' | ')}`);
    if (report.clipped.length) problems.push(`clipped: ${report.clipped.join(' | ')}`);
    if (report.broken.length) problems.push(`broken images: ${report.broken.join(' | ')}`);
    if (report.tiny.length) problems.push(`under 24px: ${report.tiny.join(' | ')}`);
    if (report.unreadable.length) problems.push(`under 11px: ${report.unreadable.join(' | ')}`);
    if (consoleErrors.length) problems.push(`page errors: ${consoleErrors.slice(0, 2).join(' | ')}`);

    const head = `${mode.padEnd(9)} ${String(size.w).padStart(4)}x${String(size.h).padEnd(5)} ${size.note}`;
    if (problems.length === 0) {
      console.log(`  ok   ${head}`);
    } else {
      console.log(`  FLAG ${head}`);
      for (const problem of problems) console.log(`         ${problem}`);
      findings.push({ mode, size: `${size.w}x${size.h}`, problems });
    }

    await context.close();
  }
}

await browser.close();
stop();

console.log(`\n${findings.length === 0
  ? `Clean across ${SIZES.length * 2} size/mode combinations.`
  : `${findings.length} of ${SIZES.length * 2} combinations flagged something.`}`);
if (wantShots) console.log(`Screenshots: ${outDir}`);
process.exit(0);
