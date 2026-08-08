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

/** Read a `--token: value;` block out of index.css. */
function themeVars(css, selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\}`);
  const match = css.match(re);
  assert.ok(match, `no ${selector} block in src/index.css`);
  const vars = {};
  for (const line of match[1].split('\n')) {
    const found = line.match(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/);
    if (found) vars[found[1]] = found[2];
  }
  return vars;
}

const css = fs.readFileSync('src/index.css', 'utf8');
const root = themeVars(css, ':root');
const themes = {
  'Stage Plum': root,
  Avocado: { ...root, ...themeVars(css, '[data-theme="avocado"]') },
  Mustard: { ...root, ...themeVars(css, '[data-theme="mustard"]') },
  'Retro Teal': { ...root, ...themeVars(css, '[data-theme="teal"]') },
  Chocolate: { ...root, ...themeVars(css, '[data-theme="chocolate"]') },
};

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

test('the --*-rgb triplets match their hex tokens', () => {
  // `--gold-rgb` and `--red-rgb` exist so the pills can tint at an alpha, and
  // are declared once because those two colours are identical in every theme.
  // That makes them the one place the palette can drift against itself: the
  // pill tint stops being a tint of its own text and the ratio above is
  // measuring a pairing that no longer ships. A comment asked for them to be
  // kept in sync; this checks it.
  for (const name of ['gold', 'red']) {
    const triplet = css.match(new RegExp(`--${name}-rgb:\\s*([\\d\\s,]+);`));
    assert.ok(triplet, `no --${name}-rgb in src/index.css`);
    const actual = triplet[1].split(',').map((n) => Number(n.trim()));
    assert.deepEqual(actual, hex(root[`--${name}`]), `--${name}-rgb drifted from --${name}`);
  }
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
