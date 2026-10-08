import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

test('the Top Match chip names the model above its score', () => {
  const bar = read('../src/components/TopBar.tsx');
  assert.match(bar, /top-match-chip-text">\s*<span className="top-match-chip-name">\{topMatch\.name\}<\/span>\s*<span className="top-match-score">/);
  // The name used to disappear below 1920px, leaving an avatar and a number.
  const css = read('../src/styles/shell.css');
  assert.doesNotMatch(css, /\.top-match-chip-name\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /\.top-bar:where\(\.advanced\) \.top-match-chip-name,/);
});

test('the chip opens Results on the chat channel, which is where its winner was crowned', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /onOpenTopMatch=\{\(\) => \{\s*if \(workbenchInfo\.id !== 'all' && workbenchInfo\.id !== 'chat'\) chooseWorkbench\('chat'\);\s*selectNav\('history'\);/);
});

test('the download card lays out in a grid, not with absolutely placed buttons', () => {
  const css = read('../src/App.css');
  const block = css.slice(css.indexOf('.ticker-download-dock {'), css.indexOf('/* A model being tested with its panel closed'));
  assert.doesNotMatch(block, /position:\s*absolute/);
  assert.match(block, /\.ticker-download-actions\s*\{[^}]*display:\s*flex/);
});
