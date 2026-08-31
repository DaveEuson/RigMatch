// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { leaseDevServer, COLD_START_MS } from './dev-server-lease.mjs';
import { chromium } from 'playwright';

/**
 * Every menu, on every screen.
 *
 * responsive-sweep loads one screen per mode and checks it at eight sizes. That
 * is why the Comparison screen's contestant menu ran at 413px of the 929px it
 * had, with the other half of the row blank, for as long as it existed: nothing
 * automated had ever opened that screen. Same for Scorecards, Settings and Top
 * Pick.
 *
 * This walks the nav instead, and looks at control groups specifically:
 *
 *   starved   — a menu squeezed into one grid track with an empty one beside it
 *   clipped   — an item outside its own menu's box, where the menu does not scroll
 *   tiny      — a target under 24px (WCAG 2.2)
 *   truncated — an item's own label ellipsised
 *
 * Fewer sizes than responsive-sweep, because the variable here is the screen.
 *
 * Usage:  node scripts/menu-sweep.mjs
 */

const url = process.env.RIGMATCH_TOUR_URL || 'http://127.0.0.1:5173/';

/** The app's own minimum, the most common laptop, and a roomy desktop. */
const SIZES = [
  { w: 1024, h: 640, note: "the app's own minimum" },
  { w: 1366, h: 768, note: 'the most common laptop' },
  { w: 1920, h: 1080, note: 'desktop' },
];

const SCREENS = ['Models', "What's New", 'Comparison', 'Scorecards', 'Top Pick', 'Your Rig', 'Activity', 'Settings'];

/**
 * Sidebars are not starved menus.
 *
 * A rail is meant to be narrow beside a wide content column, and the content
 * column is not an empty track. Naming them here rather than trying to tell
 * them apart by measurement, which is what an earlier version did badly.
 */
const RAILS = ['side-menu', 'comparison-rail', 'settings-rail', 'model-facets', 'cabinet-body'];

const auditScript = (rails) => {
  const SEL = ['[role="tablist"]', '[role="group"]', 'nav', '[class*="tabs"]', '[class*="-menu"]',
    '[class*="filters"]', '[class*="toggle"]', '[class*="picker"]', '[class*="rail"]'].join(',');
  const MENU_CONTROLS = 'button, a[href], [role="tab"]';
  const label = (node) => (node.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')
    || node.tagName.toLowerCase();
  const isRail = (node) => rails.some((name) => (node.className || '').toString().split(' ').includes(name));

  const findings = [];
  for (const menu of document.querySelectorAll(SEL)) {
    if (isRail(menu)) continue;
    const items = [...menu.querySelectorAll(MENU_CONTROLS)];
    if (items.length < 3) continue;
    const box = menu.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const flags = [];

    // Starved: the parent grid has a real track with nothing over its centre,
    // and this menu is not the thing filling the row.
    const parent = menu.parentElement;
    if (parent) {
      const style = getComputedStyle(parent);
      const pbox = parent.getBoundingClientRect();
      if (style.display.includes('grid') && pbox.width > 200) {
        const tracks = style.gridTemplateColumns.split(' ')
          .map((value) => parseFloat(value)).filter((value) => Number.isFinite(value) && value > 0);
        if (tracks.length >= 2) {
          // A child that spans the whole row tells you nothing about which
          // track is occupied — and in the bug this check exists for, the
          // spanning child was the very thing masking the empty track: the
          // view toggle carried `grid-column: 1 / -1`, so its rect sat over
          // both centres while the menu below it was stuck in track one.
          const rects = [...parent.children].map((kid) => kid.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .filter((rect) => rect.width < pbox.width * 0.95);
          const gap = parseFloat(style.columnGap) || 0;
          let x = pbox.left + (parseFloat(style.paddingLeft) || 0);
          let emptiest = 0;
          for (const width of tracks) {
            const centre = x + width / 2;
            if (!rects.some((rect) => rect.left <= centre && rect.right >= centre) && width > emptiest) emptiest = width;
            x += width + gap;
          }
          if (emptiest >= pbox.width * 0.3 && box.width < pbox.width * 0.6) {
            flags.push(`starved: ${Math.round(box.width)}px of ${Math.round(pbox.width)}px, beside a ${Math.round(emptiest)}px column nothing is in`);
          }
        }
      }
    }

    const fits = menu.scrollHeight <= menu.clientHeight + 1 && menu.scrollWidth <= menu.clientWidth + 1;
    const outside = items.filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.height > 0 && (rect.bottom > box.bottom + 2 || rect.right > box.right + 2) && fits;
    });
    if (outside.length) flags.push(`clipped: ${outside.map((i) => i.innerText.split('\n')[0].slice(0, 16)).join(', ')}`);

    const tiny = items.filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.height > 0 && (rect.height < 24 || rect.width < 24);
    });
    if (tiny.length) flags.push(`under 24px: ${tiny.map((i) => `${i.innerText.split('\n')[0].slice(0, 14) || '(icon)'}@${Math.round(i.getBoundingClientRect().height)}px`).join(', ')}`);

    const cut = items.filter((item) => [...item.querySelectorAll('*')]
      .some((node) => node.children.length === 0 && node.scrollWidth > node.clientWidth + 1));
    if (cut.length) flags.push(`truncated: ${cut.map((i) => i.innerText.split('\n')[0].slice(0, 16)).join(', ')}`);

    if (flags.length) findings.push({ menu: label(menu), items: items.length, flags });
  }
  return findings;
};

const lease = await leaseDevServer(url, { timeoutMs: 180_000 });
const browser = await chromium.launch({ headless: true });
const findings = [];

for (const size of SIZES) {
  const context = await browser.newContext({ viewport: { width: size.w, height: size.h } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: COLD_START_MS });
  await page.evaluate(() => {
    localStorage.setItem('rigmatch:ui-mode:v1', 'advanced');
    localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
    localStorage.setItem('rigmatch:mode-splash:v1', 'chosen');
    localStorage.setItem('rigmatch:goals-offered:v1', 'yes');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.side-menu', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);

  console.log(`\n  ${size.w}x${size.h}  ${size.note}`);
  for (const screen of SCREENS) {
    const went = await page.evaluate((name) => {
      const item = [...document.querySelectorAll('.side-menu-item')]
        .find((node) => node.querySelector('.side-menu-copy strong')?.textContent === name);
      item?.click();
      return Boolean(item);
    }, screen);
    if (!went) {
      console.log(`    --   ${screen.padEnd(11)} not in this menu`);
      continue;
    }
    await page.waitForTimeout(450);
    const result = await page.evaluate(auditScript, RAILS);
    if (result.length === 0) {
      console.log(`    ok   ${screen}`);
    } else {
      console.log(`    FLAG ${screen}`);
      for (const entry of result) {
        console.log(`           ${entry.menu} (${entry.items} items)`);
        for (const flag of entry.flags) console.log(`             ${flag}`);
      }
      findings.push({ size: `${size.w}x${size.h}`, screen, result });
    }
  }
  await context.close();
}

await browser.close();
lease.stop();

const checked = SIZES.length * SCREENS.length;
console.log(`\n${findings.length === 0
  ? `Clean across ${checked} screen/size combinations.`
  : `${findings.length} of ${checked} screen/size combinations flagged something.`}`);
if (findings.length > 0) process.exitCode = 1;
