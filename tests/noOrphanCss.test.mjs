// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { findOrphanClasses } from '../scripts/find-orphan-css.mjs';

const at = (path) => fileURLToPath(new URL(path, import.meta.url));

test('no stylesheet styles a class nothing renders', () => {
  // The redesign left 5,500 lines of App.css for elements gone from every
  // screen. Remove what this lists with scripts/prune-orphan-css.mjs.
  assert.deepEqual(findOrphanClasses(at('../src'), [at('../index.html')]), {});
});

test('nor does Chat', () => {
  assert.deepEqual(findOrphanClasses(at('../rigmatch-chat/src'), [at('../rigmatch-chat/index.html')]), {});
});

test('a class built from a prefix, or left only in a comment, is told apart', async () => {
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'orphans-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.css'), '.grade-good {} .live {} .gone {} /* .ghost {} */ @media (x) { .gone2 {} }');
  // Whole-line comments only, so a "//" inside a URL string is not cut.
  writeFileSync(join(dir, 'src', 'a.tsx'), 'const c = `grade-${tone}`; <div className="live" />\n// gone\n/* gone2 */');
  const report = Object.values(findOrphanClasses(join(dir, 'src')))[0];
  assert.deepEqual(report, ['gone', 'gone2']);
});
