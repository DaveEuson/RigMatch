import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

test('how we score does not claim there is no cloud judge, and says what marks open answers', () => {
  const section = read('../src/components/HowWeScoreSection.tsx');
  assert.doesNotMatch(section, /No cloud AI judge/);
  assert.match(section, /marked by a judge model: one on this computer unless you turn on a cloud judge/);
  const reference = read('../src/lib/scoreReference.ts');
  assert.doesNotMatch(reference, /No cloud AI judge/);
  assert.match(reference, /Open-ended answers are marked by a judge model, a local one unless you chose a cloud judge/);
});

test('the chat greets without asking for a test that may already have run, and says it is private and free', () => {
  const app = read('../src/App.tsx');
  assert.doesNotMatch(app, /Run a model test, then I can introduce you/);
  assert.match(app, /what you type stays here: it's free, and there's no account/);
  const dock = read('../src/components/ChatDock.tsx');
  assert.doesNotMatch(dock, /matched local agent/);
  assert.match(dock, /'Type your message\.\.\.'/);
});

test('a goal with no measured winner does not read as a contradiction of the Top Match above it', () => {
  const panel = read('../src/components/UtilityPanel.tsx');
  assert.doesNotMatch(panel, /<strong>No crown yet<\/strong>/);
  assert.match(panel, /<strong>Not crowned yet<\/strong>/);
  assert.match(read('../src/lib/goalMatches.ts'), /Your overall Top Match still stands/);
});

test('the mode-switch banner can be dismissed without leaving Advanced Mode', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /onClick=\{\(\) => setCameFromSimple\(false\)\}\n\s*aria-label="Dismiss this note and stay in Advanced Mode"/);
});

test('the Winner caption follows Rank by', () => {
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /notchAt\(balance\)\?\.id === 'accuracy'\n\s*\? <>The most accurate answers of the \{tested\}/);
  assert.match(wizard, /notchAt\(balance\)\?\.id === 'speed'\n\s*\? <>The fastest of the \{tested\}/);
});
