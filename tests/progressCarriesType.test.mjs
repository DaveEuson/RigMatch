// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildBenchmarkPromptPlan } = require('../electron/benchmarkSuite.cjs');

/**
 * The question's type has to reach the screen, or the screen guesses.
 *
 * It used to guess, from a chain of regexes over the label, defaulting to
 * "Everyday questions" — so a live Tiananmen Square question was captioned as
 * everyday chat. The type was on the question the whole time and the progress
 * updates simply dropped it.
 *
 * Two things keep that fixed, and neither is covered by a unit test of the
 * mapping: the runner has to send the type, and the plan has to carry one.
 */

const EMITTERS = ['electron/main.cjs', 'src/api.ts'];

test('every progress update that names a question also names its type', () => {
  // Pinning them together is the point: the label alone is what the screen was
  // reduced to guessing from.
  for (const file of EMITTERS) {
    const source = readFileSync(file, 'utf-8');
    const lines = source.split('\n');
    const labelLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^\s*promptLabel: prompt\.label,\s*$/.test(line));

    assert.ok(labelLines.length > 0, `${file} no longer emits promptLabel — has the shape changed?`);

    for (const { index } of labelLines) {
      const neighbourhood = lines.slice(Math.max(0, index - 6), index + 7).join('\n');
      assert.match(neighbourhood, /promptType: prompt\.type,/,
        `${file}:${index + 1} sends a question's label without its type`);
    }
  }
});

test('the type survives the trip through the renderer', () => {
  const app = readFileSync('src/App.tsx', 'utf-8');
  assert.match(app, /questionType: update\.promptType/,
    'App builds RunProgress without carrying promptType across');
});

test('the shipped plan carries a type on every question, at every length', () => {
  // main.cjs reads prompt.type directly. If the plan could produce a prompt
  // without one, the caption would quietly fall back to saying nothing.
  for (const count of [10, 20, 50, 100]) {
    const plan = buildBenchmarkPromptPlan(count);
    assert.ok(plan.length > 0, `a plan of ${count} came back empty`);
    const untyped = plan.filter((prompt) => !prompt.type);
    assert.equal(untyped.length, 0,
      `${untyped.length} of ${plan.length} questions in a ${count}-question plan have no type`);
  }
});

test('the CJS plan and the caption table agree on the type vocabulary', () => {
  const { ROUND_LABELS } = require('../src/lib/roundLabels.ts');
  const known = new Set(Object.keys(ROUND_LABELS));
  const used = new Set(buildBenchmarkPromptPlan(100).map((prompt) => prompt.type));
  for (const type of used) {
    assert.ok(known.has(type), `the runner emits "${type}", which has no caption`);
  }
});
