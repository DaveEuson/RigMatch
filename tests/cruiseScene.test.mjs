// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The "It's a match" cruise. The scene sits in the middle row of a grid that
 * shrinks to its minimum on short windows; a scene taller than that row spills
 * over the caption below it. It asked for 300px in a 260px row, and once the
 * sea became solid water "Romantic cruise launched" vanished under it.
 */

const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf-8');
const sound = readFileSync(new URL('../src/lib/sound.ts', import.meta.url), 'utf-8');

const px = (source, pattern) => {
  const match = source.match(pattern);
  assert.ok(match, `${pattern} not found`);
  return Number(match[1]);
};

test('the cruise scene fits the row the modal gives it', () => {
  const rowMin = px(css, /\.choice-cruise-modal \{[^}]*grid-template-rows: auto minmax\((\d+)px, 1fr\) auto;/);
  const sceneMin = px(css, /\.cruise-scene \{[^}]*min-height: (\d+)px;/);
  assert.ok(sceneMin <= rowMin, `the scene asks for ${sceneMin}px in a ${rowMin}px row and covers the caption`);
});

test('a match gets the romance, not the old arpeggio', () => {
  assert.match(sound, /if \(type === 'its-a-match'\) \{\s*showTheme\.romance\(\);\s*return;/);
});
