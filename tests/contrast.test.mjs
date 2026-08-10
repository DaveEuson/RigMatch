import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * The status colours are used as text on two surfaces and on a tint of
 * themselves, in five themes. `--red` was identical in every theme and failed
 * 4.5:1 on `--panel-2` in all of them across 22 text sites, and every tinted
 * status pill failed too — the pattern being a colour at full strength on an
 * 8-25% tint of itself, where the tint darkens the surface by roughly as much
 * as the text needs to rise.
 *
 * Nothing catches this at build time, and a "small" palette tweak silently
 * reintroduces it, so assert the ratios.
 */

const AA = 4.5;
const TINT = 0.12; // the alpha the status pills composite at

const srgbToLin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = ([r, g, b]) => 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
};

/** The body of a `selector { … }` block in index.css. */
function themeBlock(css, selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\}`);
  const match = css.match(re);
  assert.ok(match, `no ${selector} block in src/index.css`);
  return match[1];
}

/** Read a `--token: #rrggbb;` block out of index.css. */
function themeVars(css, selector) {
  const vars = {};
  for (const line of themeBlock(css, selector).split('\n')) {
    const found = line.match(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/);
    if (found) vars[found[1]] = found[2];
  }
  return vars;
}

/** Read the `--token-rgb: r, g, b;` triplets out of the same block. */
function themeTriplets(css, selector) {
  const vars = {};
  for (const line of themeBlock(css, selector).split('\n')) {
    const found = line.match(/(--[\w-]+)-rgb:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+);/);
    if (found) vars[found[1]] = [Number(found[2]), Number(found[3]), Number(found[4])];
  }
  return vars;
}

const css = fs.readFileSync('src/index.css', 'utf8');
const SELECTORS = {
  'Stage Plum': ':root',
  Avocado: '[data-theme="avocado"]',
  Mustard: '[data-theme="mustard"]',
  'Retro Teal': '[data-theme="teal"]',
  Chocolate: '[data-theme="chocolate"]',
};
const root = themeVars(css, ':root');
const rootTriplets = themeTriplets(css, ':root');
const themes = {};
const triplets = {};
for (const [name, selector] of Object.entries(SELECTORS)) {
  themes[name] = name === 'Stage Plum' ? root : { ...root, ...themeVars(css, selector) };
  triplets[name] = name === 'Stage Plum'
    ? rootTriplets
    : { ...rootTriplets, ...themeTriplets(css, selector) };
}

test('status colours meet AA on both surfaces and on their own tint, in every theme', () => {
  const failures = [];

  for (const [themeName, vars] of Object.entries(themes)) {
    const panel = hex(vars['--panel']);
    const panel2 = hex(vars['--panel-2']);

    for (const token of ['--red', '--blue', '--green']) {
      const colour = vars[token];
      assert.ok(colour, `${themeName} has no ${token}`);
      const rgb = hex(colour);

      const pairs = {
        // Both surfaces: status text sits on a panel or on a card inside one.
        panel: contrast(rgb, panel),
        'panel-2': contrast(rgb, panel2),
        // The pill case: the colour on a tint of itself over the raised surface.
        chip: contrast(rgb, over(rgb, TINT, panel2)),
      };

      for (const [where, ratio] of Object.entries(pairs)) {
        if (ratio < AA) {
          failures.push(`${themeName} ${token} (${colour}) on ${where}: ${ratio.toFixed(2)}`);
        }
      }
    }
  }

  assert.deepEqual(failures, [], `below ${AA}:1`);
});

test('the --*-rgb triplets match their hex tokens, in every theme', () => {
  // The `-rgb` triplets exist so pills can tint at an alpha. They are the one
  // place the palette can drift against itself: the tint stops being a tint of
  // its own text, and the ratios above start measuring a pairing that does not
  // ship. Gold and red are declared once (identical in every theme); blue,
  // green and pink are declared per theme.
  // --primary-rgb is the one triplet with no hex twin: the accent is only ever
  // composited, never used flat, so there is no --primary to drift from. Pinned
  // rather than skipped, so a typo like --bleu-rgb still fails here.
  const NO_HEX_TWIN = ['--primary'];
  const failures = [];
  const orphans = new Set();

  for (const [themeName, vars] of Object.entries(themes)) {
    for (const [token, triplet] of Object.entries(triplets[themeName])) {
      const hexValue = vars[token];
      if (!hexValue) { orphans.add(token); continue; }
      if (String(triplet) !== String(hex(hexValue))) {
        failures.push(`${themeName} ${token}-rgb is ${triplet} but ${token} is ${hexValue}`);
      }
    }
  }

  assert.deepEqual(failures, [], 'triplet drifted from its hex token');
  assert.deepEqual([...orphans].sort(), NO_HEX_TWIN, 'unexpected --*-rgb with no matching hex token');
  // And the per-theme ones really are declared per theme — a single root
  // declaration would silently freeze four themes to the fifth's colour.
  for (const name of ['blue', 'green', 'pink']) {
    for (const [themeName, selector] of Object.entries(SELECTORS)) {
      assert.ok(
        themeTriplets(css, selector)[`--${name}`],
        `${themeName} must declare its own --${name}-rgb`,
      );
    }
  }
});

test('per-theme colours are not hardcoded as raw rgba() in App.css', () => {
  // A literal cannot follow the theme. `--blue` used to be exactly
  // rgb(105, 167, 183), the value hardcoded at 64 sites, so the two agreed by
  // accident until the palette moved and every one of them went stale — a
  // var(--blue) border drawn against an old-blue fill, in all five themes.
  // Green had the same problem at 47 sites.
  //
  // Gold and red are identical in every theme, so a literal of those cannot go
  // out of step with the theme and is only a tidiness matter. Pink is excluded
  // for a sharper reason: --primary-rgb holds the same triplet as --pink in the
  // default theme and a completely different colour in the other four, so a
  // bare rgba(227, 113, 133, x) is genuinely ambiguous about which it meant.
  const appCss = fs.readFileSync('src/App.css', 'utf8');
  const offenders = [];

  for (const name of ['blue', 'green']) {
    for (const [themeName, vars] of Object.entries(themes)) {
      const [r, g, b] = hex(vars[`--${name}`]);
      const literal = new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*[,)]`, 'g');
      const hits = appCss.match(literal);
      if (hits) {
        offenders.push(`--${name} (${themeName}) hardcoded ${hits.length}x — use rgba(var(--${name}-rgb), …)`);
      }
    }
  }

  assert.deepEqual(offenders, [], 'per-theme colour written as a literal');
});

test('the palette is actually being read (guard against a broken parser)', () => {
  // If the regex ever stops matching, every ratio silently becomes untested.
  assert.equal(Object.keys(themes).length, 5);
  for (const [name, vars] of Object.entries(themes)) {
    for (const token of ['--panel', '--panel-2', '--red', '--blue', '--green']) {
      assert.match(vars[token] ?? '', /^#[0-9a-fA-F]{6}$/, `${name} ${token} did not parse`);
    }
  }
});
