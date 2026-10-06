// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Small things a regression review found after 0.9.4.
 */
const topBar = readFileSync(new URL('../src/components/TopBar.tsx', import.meta.url), 'utf8');
const cabinet = readFileSync(new URL('../src/components/ModelCabinet.tsx', import.meta.url), 'utf8');

test('each service in the top bar can be told apart without its name', () => {
  // Below 1600px the names are hidden, and Ollama and LM Studio were the same plug.
  assert.match(topBar, /<UiIcon name="plug" size=\{16\} \/>\s*<span className="top-bar-service-name">Ollama/);
  assert.match(topBar, /<UiIcon name="models" size=\{16\} \/>\s*<span className="top-bar-service-name">LM Studio/);
  for (const name of ['Ollama', 'LM Studio', 'ComfyUI']) {
    assert.match(topBar, new RegExp(`title=\\{\`${name}: \\$\\{CONNECTION_WORDS`), `${name} has a tooltip`);
  }
});

test('the family button\'s spoken name starts with the words on it', () => {
  assert.match(cabinet, /aria-label=\{`\$\{open \? 'Hide versions' : `Show \$\{versionCount\}`\} of \$\{family\}`\}/);
  assert.match(cabinet, /\{open \? 'Hide versions' : `Show \$\{versionCount\}`\}/);
});
