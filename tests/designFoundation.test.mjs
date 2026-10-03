// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { UI_ICON_ART, UI_ICON_NAMES } from '../src/components/icons/uiIconArt.ts';
import { BADGE_ART } from '../src/components/badgeArt.ts';
import { ACHIEVEMENTS } from '../src/lib/achievements.ts';

/**
 * The redesign's foundation: three bundled typefaces, the token set, the 30
 * interface icons and the badge art. These pin what the rest of the build
 * leans on, so a missing font file or an icon still carrying a fixed color
 * fails here rather than as a fallback face or a cream icon on a light panel.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');

test('every font the stylesheet names ships with the app, with its licence', () => {
  const fonts = read('../src/fonts.css');
  const files = [...fonts.matchAll(/url\("\.\/assets\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
  assert.equal(files.length, 8, 'three families, Latin and Latin Extended, two weights of Atkinson');
  for (const file of files) assert.ok(existsSync(new URL(`../src/assets/fonts/${file}`, import.meta.url)), `${file} is missing`);
  for (const family of ['YoungSerif', 'AtkinsonHyperlegible', 'SplineSansMono']) {
    assert.match(read(`../public/licenses/fonts/${family}-OFL.txt`), /SIL Open Font License/);
  }
  // Loaded before the tokens that name them, and nothing fetched from the web.
  assert.match(read('../src/main.tsx'), /import '\.\/fonts\.css'\s*\nimport '\.\/index\.css'/);
  assert.doesNotMatch(fonts + read('../src/index.css'), /fonts\.googleapis|fonts\.gstatic/);
});

test('the tokens name the three faces and keep the old names working', () => {
  const css = read('../src/index.css');
  assert.match(css, /--display: "Young Serif"/);
  assert.match(css, /--ui: "Atkinson Hyperlegible"/);
  assert.match(css, /--figure: "Spline Sans Mono"/);
  for (const alias of ['--line-bright: var(--line-strong)', '--mono: var(--figure)', '--shadow: var(--shadow-float)']) {
    assert.ok(css.includes(alias), `${alias} is gone, and screens not yet rebuilt still use it`);
  }
  // Gold, green and red never change between themes.
  const themes = [...css.matchAll(/\[data-theme="[\w-]+"\]\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
  assert.equal(themes.length, 4);
  for (const block of themes) assert.doesNotMatch(block, /--(gold|green|red)(-rgb)?:/);
});

test('the interface icons follow the text color, not a fixed cream', () => {
  assert.equal(UI_ICON_NAMES.length, 30);
  for (const name of UI_ICON_NAMES) {
    const { body, strokeWidth } = UI_ICON_ART[name];
    assert.ok(strokeWidth > 0, name);
    assert.doesNotMatch(body, /#f0e7dc|c2pa|<metadata/i, `${name} still carries the design file's color or metadata`);
  }
});

test('every achievement has an earned pin and a socket, and the hidden one a "?"', () => {
  for (const a of ACHIEVEMENTS) {
    const art = BADGE_ART[a.id];
    assert.ok(art?.earned && art.socket, `${a.id} has no art`);
    if (a.hidden) assert.ok(art.hidden, `${a.id} is hidden with no "?" socket`);
    // Gradient ids are made unique per instance.
    for (const svg of Object.values(art)) assert.doesNotMatch(svg, /id="(?!__ID__-)/, `${a.id} has a fixed id`);
  }
});

test('both apps carry the redesign\'s icons, with "@" restored in the file names', () => {
  const icons = readdirSync(new URL('../rigmatch-chat/src-tauri/icons/ios', import.meta.url));
  assert.ok(icons.some((f) => f.includes('@2x')), 'the iOS set lost its @2x names');
  assert.ok(!icons.some((f) => /-[123]x\./.test(f)), 'an exported "-2x" name was not restored');
  for (const size of [16, 32, 256, 1024]) {
    assert.ok(existsSync(new URL(`../build/icons/${size}x${size}.png`, import.meta.url)), `${size}px app icon missing`);
  }
});
