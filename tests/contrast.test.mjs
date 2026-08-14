import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Every theme must keep its text readable — measured, not eyeballed.
 *
 * The audit's finding: 201 hardcoded colors and no contrast checks meant a
 * theme could quietly ship unreadable pairings. This suite parses the theme
 * token blocks out of index.css and holds every theme to WCAG 2.1: 4.5:1 for
 * text tokens on every surface they sit on, 3:1 for the accent colors that
 * carry emphasis and verdicts. A new theme, or a tweak to an old one, fails
 * here before a user ever squints at it.
 */

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/index.css'),
  'utf-8',
);

/** Pull a token block's declarations into a map. */
function tokensFrom(block) {
  const map = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    map[name] = value.trim();
  }
  return map;
}

const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const rootTokens = tokensFrom(rootBlock);

const themeBlocks = [...css.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([\s\S]*?)\}/g)]
  .map(([, name, block]) => ({ name, tokens: { ...rootTokens, ...tokensFrom(block) } }));

const THEMES = [{ name: 'default', tokens: rootTokens }, ...themeBlocks];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const lin = (channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(foreground, background) {
  const [l1, l2] = [luminance(hexToRgb(foreground)), luminance(hexToRgb(background))];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['bg', 'panel', 'panel-2'];
/** Body-size text: WCAG AA wants 4.5:1. */
const TEXT_TOKENS = ['text', 'text-strong', 'muted'];
/** Accents carry emphasis, verdicts, and badges: hold them to 3:1. */
const ACCENT_TOKENS = ['gold', 'green', 'red', 'blue', 'pink'];

test('the theme parser actually found the themes', () => {
  // Stage Plum is the :root default; the other four are named blocks.
  assert.equal(THEMES.length, 4 + 1, 'the default plus the four named themes');
  for (const theme of THEMES) {
    for (const token of [...SURFACES, ...TEXT_TOKENS, ...ACCENT_TOKENS]) {
      assert.match(theme.tokens[token] ?? '', /^#[0-9a-fA-F]{6}$/,
        `${theme.name} --${token} should be a hex color, got "${theme.tokens[token]}"`);
    }
  }
});

for (const theme of THEMES) {
  test(`theme "${theme.name}": text meets WCAG AA on every surface`, () => {
    for (const textToken of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        const ratio = contrast(theme.tokens[textToken], theme.tokens[surface]);
        assert.ok(ratio >= 4.5,
          `--${textToken} (${theme.tokens[textToken]}) on --${surface} (${theme.tokens[surface]}) is ${ratio.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  });

  test(`theme "${theme.name}": accents hold 3:1 where they carry meaning`, () => {
    for (const accent of ACCENT_TOKENS) {
      for (const surface of SURFACES) {
        const ratio = contrast(theme.tokens[accent], theme.tokens[surface]);
        assert.ok(ratio >= 3,
          `--${accent} (${theme.tokens[accent]}) on --${surface} (${theme.tokens[surface]}) is ${ratio.toFixed(2)}:1, needs 3:1`);
      }
    }
  });
}

test('verdict colors are never the only signal — green and red are twins to colorblind eyes', () => {
  // Under red-green colorblindness the app's green and red collapse toward
  // the same brownish tone, and their lightness is nearly identical (~0.40 vs
  // ~0.43 relative luminance), so hue genuinely cannot carry a verdict alone.
  // This is a designed-in fact, pinned here so nobody "fixes" a verdict by
  // coloring a dot: every tone-colored element must also say its verdict in
  // words ("A good match for your rig", the grade letter, the badge text).
  const deltaL = Math.abs(
    luminance(hexToRgb(rootTokens.green)) - luminance(hexToRgb(rootTokens.red)),
  );
  assert.ok(deltaL < 0.1, 'if this fails, the palette changed enough to revisit this note');
});
