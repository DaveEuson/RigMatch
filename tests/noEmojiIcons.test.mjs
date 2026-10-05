// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No emoji from the pictograph planes in the interface. A Linux machine
 * without an emoji font, which includes many fresh installs and WSL, draws
 * them as empty boxes: the Models screen's "Start here" choices showed three
 * boxes where the icons should be. RigMatch has its own icons for that
 * (components/icons). Symbols from the basic range (♥ ⚡ ⚠ ☁) are in the
 * system fonts and are fine.
 *
 * Text people paste elsewhere is the exception: the site it lands on draws it.
 */

const PICTOGRAPH = /[\u{1F000}-\u{1FAFF}\u{2B50}]/u;
const PASTED_ELSEWHERE = [
  // The Markdown summary copied for a post or a README.
  ['src/lib/modelCatalog.ts', '## 🏆 My Local AI Results'],
];

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
));

test('the interface uses its own icons, not emoji that can render as boxes', () => {
  const offenders = [];
  for (const file of [...walk('src'), ...walk('rigmatch-chat/src')].filter((f) => /\.(tsx?|css)$/.test(f))) {
    const rel = file.split('\\').join('/');
    readFileSync(join(root, file), 'utf-8').split('\n').forEach((line, index) => {
      if (!PICTOGRAPH.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (PASTED_ELSEWHERE.some(([path, text]) => rel === path && line.includes(text))) return;
      offenders.push(`${rel}:${index + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, [], 'use UiIcon (components/icons) instead');
});
