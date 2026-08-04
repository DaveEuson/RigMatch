import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_RUNS_PER_MODEL,
  appendRuns,
  describeElapsed,
  emptyRunHistory,
  formatRunDelta,
  getAllRunDeltas,
  getModelRuns,
  getRunDelta,
  getScoreTrend,
  pruneToTotal,
  removeRuns,
  sameHardware,
  seedFromBenchmarkResults,
  toRunHardware,
  toRunHistoryEntry,
} from '../src/lib/runHistory.ts';

const HW = { gpu: 'GeForce RTX 4070', vramGb: 12, ramGb: 32, cpu: 'Ryzen 7', os: 'Windows 11' };

function entry(model, completedAt, total, extra = {}) {
  return {
    model,
    completedAt,
    total,
    grade: 'B',
    speed: total,
    sobriety: total,
    stability: total,
    fit: total,
    questionCount: 8,
    elapsedMs: 1000,
    ...extra,
  };
}

test('runs append oldest-first and are keyed case-insensitively', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('Qwen3:8B', '2026-03-01T00:00:00Z', 84)]);
  history = appendRuns(history, [entry('qwen3:8b', '2026-04-01T00:00:00Z', 91)]);

  const runs = getModelRuns(history, 'QWEN3:8B');
  assert.equal(runs.length, 2, 'the same model in different casing must share one timeline');
  assert.deepEqual(runs.map((r) => r.total), [84, 91]);
});

test('malformed entries are skipped, not thrown on', () => {
  // appendRuns runs inside a state updater mid-benchmark; throwing there would
  // lose the entire run rather than one bad entry.
  let history = emptyRunHistory();
  assert.doesNotThrow(() => { history = appendRuns(history, [null, undefined, 0, 'nope', []]); });
  assert.deepEqual(history.runs, {});

  history = appendRuns(history, [null, entry('m', '2026-03-01T00:00:00Z', 84), undefined]);
  assert.equal(getModelRuns(history, 'm').length, 1, 'a good entry alongside bad ones still lands');
});

test('re-appending the same run is a no-op', () => {
  let history = emptyRunHistory();
  const run = entry('qwen3:8b', '2026-03-01T00:00:00Z', 84);
  history = appendRuns(history, [run]);
  history = appendRuns(history, [run]);
  history = appendRuns(history, [{ ...run }]);
  assert.equal(getModelRuns(history, 'qwen3:8b').length, 1);
});

test('out-of-order arrivals still sort oldest-first', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', '2026-05-01T00:00:00Z', 90)]);
  history = appendRuns(history, [entry('m', '2026-01-01T00:00:00Z', 70)]);
  assert.deepEqual(getModelRuns(history, 'm').map((r) => r.total), [70, 90]);
});

test('per-model history is capped, keeping the newest runs', () => {
  let history = emptyRunHistory();
  for (let i = 0; i < MAX_RUNS_PER_MODEL + 10; i += 1) {
    history = appendRuns(history, [entry('m', `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`, i)]);
  }
  const runs = getModelRuns(history, 'm');
  assert.equal(runs.length, MAX_RUNS_PER_MODEL);
  assert.equal(runs[runs.length - 1].total, MAX_RUNS_PER_MODEL + 9, 'newest run must survive');
});

test('global pruning never drops a model’s most recent run', () => {
  let history = emptyRunHistory();
  // One model with a long history, plus a second model tested once, long ago.
  for (let i = 0; i < 20; i += 1) {
    history = appendRuns(history, [entry('busy', `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00Z`, i)]);
  }
  history = appendRuns(history, [entry('rare', '2026-01-01T00:00:00Z', 55)]);

  const pruned = pruneToTotal(history, 5);
  assert.equal(getModelRuns(pruned, 'rare').length, 1, 'the rarely-tested model must not vanish');
  assert.ok(getModelRuns(pruned, 'busy').length >= 1);
  const total = Object.values(pruned.runs).reduce((n, runs) => n + runs.length, 0);
  assert.ok(total <= 6, `expected near the cap, got ${total}`);
});

test('a delta reports the change and whether the rig changed', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', '2026-03-01T00:00:00Z', 84, { hardware: HW })]);
  history = appendRuns(history, [entry('m', '2026-04-01T00:00:00Z', 91, { hardware: HW })]);

  const delta = getRunDelta(history, 'm');
  assert.equal(delta.points, 7);
  assert.equal(delta.hardwareChanged, false);
  assert.equal(delta.previous.total, 84);
  assert.equal(delta.latest.total, 91);
});

test('a GPU swap is flagged as a hardware change', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', '2026-03-01T00:00:00Z', 70, { hardware: { ...HW, gpu: 'GeForce RTX 3070', vramGb: 8 } })]);
  history = appendRuns(history, [entry('m', '2026-04-01T00:00:00Z', 88, { hardware: HW })]);

  assert.equal(getRunDelta(history, 'm').hardwareChanged, true);
});

test('runs measured differently are not compared', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', '2026-03-01T00:00:00Z', 84, { questionCount: 4 })]);
  history = appendRuns(history, [entry('m', '2026-04-01T00:00:00Z', 91, { questionCount: 12 })]);
  assert.equal(getRunDelta(history, 'm'), null, 'different question counts are not comparable');

  let schema = emptyRunHistory();
  schema = appendRuns(schema, [entry('m', '2026-03-01T00:00:00Z', 84, { scoreSchemaVersion: 1 })]);
  schema = appendRuns(schema, [entry('m', '2026-04-01T00:00:00Z', 91, { scoreSchemaVersion: 2 })]);
  assert.equal(getRunDelta(schema, 'm'), null, 'a scoring change is not a model improvement');
});

test('an older comparable run is used when the immediate predecessor is not', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', '2026-01-01T00:00:00Z', 80)]);
  history = appendRuns(history, [entry('m', '2026-02-01T00:00:00Z', 99, { questionCount: 4 })]);
  history = appendRuns(history, [entry('m', '2026-03-01T00:00:00Z', 86)]);

  const delta = getRunDelta(history, 'm');
  assert.equal(delta.points, 6, 'should skip the 4-question run and compare against the 8-question one');
  assert.equal(delta.previous.completedAt, '2026-01-01T00:00:00Z');
});

test('a single run has no delta', () => {
  const history = appendRuns(emptyRunHistory(), [entry('m', '2026-03-01T00:00:00Z', 84)]);
  assert.equal(getRunDelta(history, 'm'), null);
});

test('deltas prefer precise totals when both runs carry them', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', '2026-03-01T00:00:00Z', 84, { preciseTotal: 84.4 })]);
  history = appendRuns(history, [entry('m', '2026-04-01T00:00:00Z', 85, { preciseTotal: 84.9 })]);
  assert.equal(getRunDelta(history, 'm').points, 0.5, 'integer totals would have said +1');
});

test('unknown hardware never claims a rig change', () => {
  assert.equal(sameHardware(undefined, HW), true);
  assert.equal(sameHardware(HW, undefined), true);
  assert.equal(sameHardware(undefined, undefined), true);
});

test('an unscanned system produces no hardware stamp', () => {
  assert.equal(toRunHardware(null), undefined);
  assert.equal(toRunHardware(undefined), undefined);
  assert.equal(
    toRunHardware({ gpu: { model: '', vramGb: 0 }, cpu: { brand: '' }, memory: { totalGb: 0 }, os: {} }),
    undefined,
    'a blank profile must not be recorded as real hardware',
  );

  const stamped = toRunHardware({
    gpu: { model: 'GeForce RTX 4070', vramGb: 12 },
    cpu: { brand: 'Ryzen 7' },
    memory: { totalGb: 32 },
    os: { distro: 'Windows', release: '11' },
  });
  assert.equal(stamped.gpu, 'GeForce RTX 4070');
  assert.equal(stamped.os, 'Windows 11');
});

test('the score trend reads oldest to newest', () => {
  let history = emptyRunHistory();
  for (const [i, total] of [70, 75, 82].entries()) {
    history = appendRuns(history, [entry('qwen3:8b', `2026-0${i + 1}-01T00:00:00Z`, total)]);
  }
  assert.deepEqual(getScoreTrend(history)['qwen3:8b'], [70, 75, 82]);
});

test('upgrading users keep their existing results as the first data point', () => {
  const benchmarkByModel = {
    'qwen3:8b': {
      model: 'qwen3:8b',
      completedAt: '2026-02-01T00:00:00Z',
      questionCount: 8,
      elapsedMs: 4000,
      prompts: [],
      baseUrl: '',
      scores: { speed: 90, sobriety: 88, stability: 92, fit: 80, total: 88, grade: 'A' },
    },
  };
  const seeded = seedFromBenchmarkResults(emptyRunHistory(), benchmarkByModel, {
    'qwen3:8b': { preciseTotal: 87.6, suiteName: 'Standard', scoreSchemaVersion: 2 },
  });

  const runs = getModelRuns(seeded, 'qwen3:8b');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].total, 88);
  assert.equal(runs[0].preciseTotal, 87.6);
  assert.equal(runs[0].suiteName, 'Standard');

  // Seeding twice (two launches before the next run) must not duplicate.
  const again = seedFromBenchmarkResults(seeded, benchmarkByModel, {});
  assert.equal(getModelRuns(again, 'qwen3:8b').length, 1);
});

test('clearing a model drops its runs and leaves others alone', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('qwen3:8b', '2026-03-01T00:00:00Z', 84)]);
  history = appendRuns(history, [entry('llama3.2:3b', '2026-03-01T00:00:00Z', 77)]);

  // Aliases: the same model can be referred to by several names, in any casing.
  const cleared = removeRuns(history, ['QWEN3:8B', 'qwen3']);
  assert.equal(getModelRuns(cleared, 'qwen3:8b').length, 0);
  assert.equal(getModelRuns(cleared, 'llama3.2:3b').length, 1);

  // A no-op removal must not churn the object identity.
  assert.equal(removeRuns(cleared, ['nothing-here']), cleared);
  assert.equal(removeRuns(cleared, []), cleared);
});

test('a cleared model reports no delta on its next run', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', '2026-03-01T00:00:00Z', 40)]);
  history = removeRuns(history, ['m']);
  history = appendRuns(history, [entry('m', '2026-04-01T00:00:00Z', 90)]);
  assert.equal(getRunDelta(history, 'm'), null, 'must not compare against a score the user deleted');
});

test('elapsed time reads in plain language', () => {
  const now = Date.parse('2026-06-01T12:00:00Z');
  const ago = (days) => new Date(now - days * 86400000).toISOString();

  assert.equal(describeElapsed(ago(0), now), 'earlier today');
  assert.equal(describeElapsed(ago(1), now), 'yesterday');
  assert.equal(describeElapsed(ago(3), now), '3 days ago');
  assert.equal(describeElapsed(ago(9), now), 'a week ago');
  assert.equal(describeElapsed(ago(21), now), '3 weeks ago');
  assert.equal(describeElapsed(ago(40), now), 'a month ago');
  assert.equal(describeElapsed(ago(200), now), '6 months ago');
  assert.equal(describeElapsed(ago(400), now), 'a year ago');
  assert.equal(describeElapsed('', now), 'earlier', 'a missing timestamp must not render "NaN"');
  assert.equal(describeElapsed('not-a-date', now), 'earlier');
});

test('a delta label uses a real minus sign and never blames the hardware', () => {
  const now = Date.parse('2026-06-01T12:00:00Z');
  const older = new Date(now - 21 * 86400000).toISOString();

  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', older, 84, { hardware: HW })]);
  history = appendRuns(history, [entry('m', '2026-06-01T00:00:00Z', 91, { hardware: HW })]);

  const up = formatRunDelta(getRunDelta(history, 'm'), now);
  assert.equal(up.direction, 'up');
  assert.equal(up.points, '+7');
  assert.equal(up.detail, 'vs. 3 weeks ago');
  assert.equal(up.hardwareNote, undefined);

  let down = emptyRunHistory();
  down = appendRuns(down, [entry('m', older, 91)]);
  down = appendRuns(down, [entry('m', '2026-06-01T00:00:00Z', 84)]);
  const lower = formatRunDelta(getRunDelta(down, 'm'), now);
  assert.equal(lower.direction, 'down');
  assert.equal(lower.points, '−7', 'should read −7 with a true minus sign (U+2212)');
  assert.ok(!lower.points.includes('-'), 'a hyphen renders badly next to a number');

  let flat = emptyRunHistory();
  flat = appendRuns(flat, [entry('m', older, 84)]);
  flat = appendRuns(flat, [entry('m', '2026-06-01T00:00:00Z', 84)]);
  assert.equal(formatRunDelta(getRunDelta(flat, 'm'), now).points, '0');
  assert.equal(formatRunDelta(getRunDelta(flat, 'm'), now).direction, 'flat');
});

test('a hardware change is noted without claiming it caused the change', () => {
  const now = Date.parse('2026-06-01T12:00:00Z');
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('m', '2026-05-01T00:00:00Z', 70, { hardware: { ...HW, gpu: 'RTX 3070', vramGb: 8 } })]);
  history = appendRuns(history, [entry('m', '2026-06-01T00:00:00Z', 88, { hardware: HW })]);

  const label = formatRunDelta(getRunDelta(history, 'm'), now);
  assert.equal(label.hardwareNote, 'Different hardware since that run');
  assert.ok(!/because|caused|thanks to/i.test(label.hardwareNote), 'must not assert causation');
});

test('getAllRunDeltas only includes models with a comparable pair', () => {
  let history = emptyRunHistory();
  history = appendRuns(history, [entry('two-runs', '2026-03-01T00:00:00Z', 80)]);
  history = appendRuns(history, [entry('two-runs', '2026-04-01T00:00:00Z', 85)]);
  history = appendRuns(history, [entry('one-run', '2026-04-01T00:00:00Z', 90)]);

  const deltas = getAllRunDeltas(history);
  assert.deepEqual(Object.keys(deltas), ['two-runs']);
  assert.equal(deltas['two-runs'].points, 5);
});

test('toRunHistoryEntry carries scores and drops transcripts', () => {
  const built = toRunHistoryEntry(
    {
      model: 'm',
      completedAt: '2026-04-01T00:00:00Z',
      questionCount: 8,
      elapsedMs: 5000,
      avgTokensPerSecond: 42,
      baseUrl: 'http://localhost:11434',
      prompts: [{ id: 'q1', prompt: 'a very long prompt', response: 'a very long response' }],
      scores: { speed: 90, sobriety: 88, stability: 92, fit: 80, total: 88, grade: 'A' },
    },
    { suiteName: 'Standard' },
  );

  assert.equal(built.total, 88);
  assert.equal(built.avgTokensPerSecond, 42);
  assert.equal(built.suiteName, 'Standard');
  assert.ok(!('prompts' in built), 'transcripts must not be duplicated into the timeline');
  assert.ok(!('baseUrl' in built));
  assert.equal(built.hardware, undefined, 'no system profile means no hardware claim');
});
