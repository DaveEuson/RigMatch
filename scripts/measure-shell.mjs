// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { leaseDevServer, COLD_START_MS } from './dev-server-lease.mjs';
import { chromium } from 'playwright';

/**
 * Measure where the Advanced viewport actually goes.
 *
 * The panel — the part of the screen doing the work — looked squeezed, but
 * "looks squeezed" is not a number, and the chrome around it is several
 * separate elements. This prints the real height of each band at a few window
 * sizes so the fix targets whichever one is actually eating the space.
 *
 * Usage:  node scripts/measure-shell.mjs
 */

const url = process.env.RIGMATCH_TOUR_URL || 'http://127.0.0.1:5173/';
const SIZES = [
  { label: 'minimum 1280x820', width: 1280, height: 820 },
  { label: 'laptop  1440x820', width: 1440, height: 820 },
  { label: 'desktop 1440x980', width: 1440, height: 980 },
  { label: 'tall    1440x1200', width: 1440, height: 1200 },
];

const lease = await leaseDevServer(url, { timeoutMs: 180_000 });
const stop = () => lease.stop();

import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const outDir = process.env.RIGMATCH_TOUR_OUT || path.join(tmpdir(), 'rigmatch-screen-tour');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const size of SIZES) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: COLD_START_MS });
  await page.evaluate(() => {
    localStorage.setItem('rigmatch:ui-mode:v1', 'advanced');
    localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
    localStorage.setItem('rigmatch:mode-splash:v1', 'chosen');
    localStorage.setItem('rigmatch:goals-offered:v1', 'yes');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.side-menu', { timeout: 10000 }).catch(() => {});

  const bands = await page.evaluate(() => {
    const measure = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return Math.round(box.height);
    };
    const panel = document.querySelector('.panel');
    const shell = document.querySelector('.app-shell');
    const shellStyle = shell ? getComputedStyle(shell) : null;
    return {
      viewport: window.innerHeight,
      demoBanner: measure('.demo-data-banner'),
      topDeck: measure('.top-deck'),
      panel: measure('.panel'),
      panelScrollHeight: panel ? Math.round(panel.scrollHeight) : null,
      panelOverflows: panel ? panel.scrollHeight > panel.clientHeight + 2 : null,
      sideMenu: measure('.side-menu'),
      menuParts: (() => {
        const menu = document.querySelector('.side-menu');
        if (!menu) return [];
        return [...menu.children].filter((c) => getComputedStyle(c).display !== 'none').map((c) => ({
          className: String(c.className).split(' ')[0] || c.tagName.toLowerCase(),
          height: Math.round(c.getBoundingClientRect().height),
        }));
      })(),
      // Can every menu item actually be reached? A nav that silently clips is
      // worse than a cramped panel: the item is not merely small, it is gone.
      sideMenuNav: (() => {
        const nav = document.querySelector('.side-menu-nav');
        const menu = document.querySelector('.side-menu');
        if (!nav || !menu) return null;
        const items = [...nav.querySelectorAll('.side-menu-item')];
        const menuBox = menu.getBoundingClientRect();
        const clipped = items.filter((item) => {
          const box = item.getBoundingClientRect();
          return box.bottom > menuBox.bottom + 1 || box.top < menuBox.top - 1;
        }).map((item) => item.getAttribute('aria-label'));
        const scrollable = menu.scrollHeight > menu.clientHeight + 2
          || nav.scrollHeight > nav.clientHeight + 2;
        const style = getComputedStyle(menu);
        return { total: items.length, clipped, scrollable, overflowY: style.overflowY };
      })(),
      shellPadding: shellStyle ? `${shellStyle.paddingTop} / ${shellStyle.paddingBottom}` : null,
      shellGap: shellStyle ? shellStyle.rowGap : null,
      // Which child is actually setting the header's height. Guessing at this
      // once already produced a "fix" that made the header taller.
      topDeckChildren: (() => {
        const deck = document.querySelector('.top-deck');
        if (!deck) return [];
        return [...deck.children]
          .filter((child) => getComputedStyle(child).display !== 'none')
          .map((child) => ({
            className: String(child.className).split(' ')[0] || child.tagName.toLowerCase(),
            height: Math.round(child.getBoundingClientRect().height),
            intrinsic: Math.round(child.scrollHeight),
          }))
          .sort((a, b) => b.height - a.height);
      })(),
      // Whatever sits in the shell's last grid row.
      lastRow: (() => {
        const children = shell ? [...shell.children].filter((child) => getComputedStyle(child).position !== 'fixed') : [];
        const last = children[children.length - 1];
        return last ? { className: last.className, height: Math.round(last.getBoundingClientRect().height) } : null;
      })(),
    };
  });

  const usable = bands.panel ?? 0;
  console.log(`\n${size.label}`);
  console.log(`  viewport            ${bands.viewport}`);
  console.log(`  shell padding/gap   ${bands.shellPadding}  gap ${bands.shellGap}`);
  console.log(`  demo banner         ${bands.demoBanner ?? '-'}`);
  console.log(`  top deck            ${bands.topDeck ?? '-'}`);
  console.log(`  last row            ${bands.lastRow ? `${bands.lastRow.height}  (${bands.lastRow.className})` : '-'}`);
  console.log(`  PANEL               ${usable}   = ${Math.round((usable / bands.viewport) * 100)}% of viewport`);
  console.log(`  panel content       ${bands.panelScrollHeight}  overflows: ${bands.panelOverflows}`);
  console.log('  shot                ' + `${outDir}/shell-${size.width}x${size.height}.png`);
  const nav = bands.sideMenuNav;
  console.log(`  side menu           ${bands.sideMenu}  items ${nav?.total}  clipped: ${nav?.clipped.length ? nav.clipped.join(', ') : 'none'}  scrollable: ${nav?.scrollable}  overflow-y: ${nav?.overflowY}`);
  console.log('  menu parts          ' + (bands.menuParts || []).map((p) => `${p.className}:${p.height}`).join('  '));
  console.log('  deck children       ' + bands.topDeckChildren.map((c) => `${c.className}:${c.height}(${c.intrinsic})`).join('  '));
  await page.screenshot({ path: `${outDir}/shell-${size.width}x${size.height}.png`, fullPage: false });
  await context.close();
}

await browser.close();
stop();
process.exit(0);
