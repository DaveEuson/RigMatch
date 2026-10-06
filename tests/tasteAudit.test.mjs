// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * A design-taste audit (2026-10) of what made the app read as generated.
 * Each fix brings an older screen in line with DESIGN.md: the accent is for
 * what is chosen or in progress, and a panel never holds another panel.
 */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const advanced = read('src/styles/advanced.css');

test('section labels are muted, not pink or gold', () => {
  const block = advanced.slice(advanced.indexOf('Call sheet for the older screens'));
  for (const selector of ['.speed-date-transcript-head span', '.setup-doctor-head span', '.task-pick-card em', '.queue-status-copy span', '.profile-qa-block span']) {
    assert.ok(block.indexOf(selector) > 0 && block.indexOf(selector) < block.indexOf('color: var(--muted);'), `${selector} is in the muted-label rule`);
  }
});

test('Comparison is one panel of rows, with tabs and each answer once', () => {
  assert.match(advanced, /\.speed-date-transcript-tabs button \{\s*flex: 0 1 auto;[\s\S]*?border-bottom: 2px solid transparent;/);
  assert.match(advanced, /:is\(\.speed-date-qa-list li, \.profile-question-list li\) \{\s*border: 0;\s*border-top: 1px solid var\(--line\);/);
  assert.match(advanced, /\.speed-date-view-toggle button\.active \{\s*border: 2px solid var\(--accent\);/, 'the toggle uses the accent, not gold');
  const panel = read('src/components/SpeedDateTranscriptPanel.tsx');
  assert.doesNotMatch(panel, /speed-date-answer-preview/);
});

test('a note inside a panel is part of it, not a box of its own', () => {
  assert.match(advanced, /\.utility-empty\.compact \{\s*padding: var\(--s3\) 0 0;\s*border: 0;\s*border-top: 1px solid var\(--line\);/);
});

test('rows open the model instead of repeating one button down the list', () => {
  const whatsNew = read('src/components/WhatsNewPanel.tsx');
  assert.doesNotMatch(whatsNew, />\s*Details\s*</);
  assert.match(whatsNew, /className="model-news-open"/);
  assert.match(read('src/lib/modelGroups.ts'), /export const MIN_VARIANTS_TO_GROUP = 2;/);
});

test('My PC says each thing once, and says what is true', () => {
  const prep = read('src/components/OllamaPrep.tsx');
  assert.match(prep, /if \(ready \|\| !isDesktopRuntime\) return null;/, 'no second Check again beside the page\'s own');
  const doctor = read('src/components/SetupDoctor.tsx');
  assert.doesNotMatch(doctor, /detail: 'Remote systems are parked/);
  assert.match(doctor, /RigMatch tests only this one/);
});

test('Simple Mode\'s setup sits on the host\'s line', () => {
  const css = read('src/components/SimpleWizard.css');
  const rule = css.slice(css.indexOf('.sw-setup {'), css.indexOf('}', css.indexOf('.sw-setup {')));
  assert.match(rule, /align-items: flex-start;/);
  assert.match(rule, /text-align: left;/);
});
