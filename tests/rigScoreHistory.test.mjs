import test from 'node:test';
import assert from 'node:assert/strict';

const {
  parseRigHistory, addRigResult, latestByTier, historyRows, speedChange, describeChange, RIG_HISTORY_KEY,
} = await import('../src/lib/rigScoreHistory.ts');
const { APP_STORAGE_PREFIX } = await import('../src/lib/safeStorage.ts');

const stamp = (extra = {}) => ({
  tier: 'light', model: 'llama3.2:3b', modelDigest: 'sha256-aaa', quantization: 'Q4_K_M',
  workloadVersion: 1, numCtx: 4096, ollamaVersion: '0.35.1', driverVersion: '610.88',
  gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, appVersion: '0.9.9', ...extra,
});
const result = (id, completedAt, decodeTps, prefillTps, extra = {}) => ({
  id, completedAt, tier: extra.tier ?? 'light',
  measure: { decodeTps, prefillTps, loadSeconds: 1.5, runs: 3 },
  stamp: stamp(extra), gpuShare: 1,
});

test('the history lives under the app namespace, so Clear Data removes it', () => {
  assert.ok(RIG_HISTORY_KEY.startsWith(APP_STORAGE_PREFIX));
});

test('a saved history keeps its good entries, newest first, and drops bad ones', () => {
  const good = result('a', '2026-10-20T10:00:00Z', 140, 3000);
  const newer = result('b', '2026-10-24T10:00:00Z', 150, 3100);
  const parsed = parseRigHistory([
    good,
    { ...good, id: 'zero', measure: { ...good.measure, decodeTps: 0 } },
    { ...good, id: 'tierless', tier: 'ultra' },
    { ...good, id: 'mismatch', tier: 'heavy' },
    null,
    'nonsense',
    newer,
  ]);
  assert.deepEqual(parsed.map((entry) => entry.id), ['b', 'a']);
  assert.deepEqual(parseRigHistory({ not: 'a list' }), []);
});

test('a new result goes on top, replaces its own id, and the oldest go past the cap', () => {
  let history = [];
  for (let day = 1; day <= 5; day += 1) history = addRigResult(history, result(`r${day}`, `2026-10-0${day}T10:00:00Z`, 100, 2000), 3);
  assert.deepEqual(history.map((entry) => entry.id), ['r5', 'r4', 'r3']);
  history = addRigResult(history, result('r5', '2026-10-05T10:00:00Z', 120, 2000), 3);
  assert.equal(history.length, 3);
  assert.equal(history[0].measure.decodeTps, 120);
});

test('the latest result of each tier is the one the screen shows', () => {
  const history = [
    result('old', '2026-10-01T10:00:00Z', 100, 2000),
    result('std', '2026-10-02T10:00:00Z', 60, 1200, { tier: 'standard', model: 'qwen3:8b' }),
    result('new', '2026-10-03T10:00:00Z', 110, 2000),
  ];
  const latest = latestByTier(history);
  assert.equal(latest.light.id, 'new');
  assert.equal(latest.standard.id, 'std');
  assert.equal(latest.heavy, undefined);
});

test('a speed change combines both halves, as points do', () => {
  const from = { decodeTps: 100, prefillTps: 2000 };
  assert.ok(Math.abs(speedChange(from, { decodeTps: 200, prefillTps: 4000 }) - 100) < 1e-9);
  assert.ok(Math.abs(speedChange(from, { decodeTps: 200, prefillTps: 2000 }) - 41.42) < 0.01);
  assert.equal(describeChange(4.4), '4% faster');
  assert.equal(describeChange(-2.6), '3% slower');
  assert.equal(describeChange(0.3), 'No change');
});

test('older runs are compared with the latest only when weights, test version and context match', () => {
  const latest = result('latest', '2026-10-24T10:00:00Z', 110, 2200);
  const rows = historyRows([
    result('same', '2026-10-20T10:00:00Z', 100, 2000),
    result('newOllama', '2026-10-19T10:00:00Z', 100, 2000, { ollamaVersion: '0.30.0' }),
    result('otherWeights', '2026-10-18T10:00:00Z', 100, 2000, { modelDigest: 'sha256-bbb' }),
    result('otherTest', '2026-10-17T10:00:00Z', 100, 2000, { workloadVersion: 0 }),
    result('otherContext', '2026-10-16T10:00:00Z', 100, 2000, { numCtx: 8192 }),
    latest,
  ]);
  const byId = Object.fromEntries(rows.map((row) => [row.result.id, row]));
  assert.equal(rows[0].result.id, 'latest');
  assert.equal(byId.latest.latest, true);
  assert.equal(byId.latest.sinceThen, null);

  assert.equal(byId.same.sinceThen.comparable, true);
  assert.equal(Math.round(byId.same.sinceThen.changePct), 10);
  assert.deepEqual(byId.same.sinceThen.notes, []);

  assert.equal(byId.newOllama.sinceThen.comparable, true, 'new software, same work: compared, with the difference named');
  assert.deepEqual(byId.newOllama.sinceThen.notes, ['Ollama 0.30.0 against 0.35.1.']);

  for (const id of ['otherWeights', 'otherTest', 'otherContext']) {
    assert.equal(byId[id].sinceThen.comparable, false, id);
    assert.equal('changePct' in byId[id].sinceThen, false, `${id} has no change to show`);
  }
  assert.match(byId.otherWeights.sinceThen.notes.join(' '), /model files differ/);
  assert.match(byId.otherTest.sinceThen.notes.join(' '), /different versions of the test/);
  assert.match(byId.otherContext.sinceThen.notes.join(' '), /context sizes/);
});

test('a new graphics card between two runs is compared, and named', () => {
  const rows = historyRows([
    result('before', '2026-10-20T10:00:00Z', 100, 2000, { gpu: 'NVIDIA GeForce RTX 3060', vramGb: 12 }),
    result('after', '2026-10-24T10:00:00Z', 140, 8500),
  ]);
  const before = rows.find((row) => row.result.id === 'before');
  assert.equal(before.sinceThen.comparable, true, 'the same work on new hardware is what the score is for');
  assert.deepEqual(before.sinceThen.notes, ['Graphics card NVIDIA GeForce RTX 3060 against NVIDIA GeForce RTX 4070.']);
});

test('a disturbed run is saved with its reasons and is not a score to compare; an old entry and a clean one are as they always were', () => {
  const clean = result('clean', '2026-10-20T10:00:00Z', 150, 3000);
  const disturbed = { ...result('d', '2026-10-24T10:00:00Z', 90, 1800), disturbed: true, disturbedBy: ['the graphics card was 91% busy between the runs'] };
  const parsed = parseRigHistory(JSON.parse(JSON.stringify([clean, disturbed])));
  assert.deepEqual(parsed.find((entry) => entry.id === 'clean'), clean, 'an entry saved before the field existed comes back unchanged');
  assert.equal('disturbed' in parsed.find((entry) => entry.id === 'clean'), false);
  assert.deepEqual(parsed.find((entry) => entry.id === 'd'), disturbed);

  // The newest clean run stands for the tier; the disturbed one only while there is none.
  assert.equal(latestByTier(parsed).light.id, 'clean');
  assert.equal(latestByTier([disturbed]).light.id, 'd');
  const rows = historyRows(parsed);
  const row = (id) => rows.find((entry) => entry.result.id === id);
  assert.equal(row('clean').latest, true);
  assert.equal(row('d').latest, false);
  assert.equal(row('d').sinceThen.comparable, false, 'never set beside a clean score as faster or slower');
  assert.match(row('d').sinceThen.notes[0], /disturbed is not compared/);
  // A later clean run is not compared with the disturbed one either.
  const later = result('later', '2026-10-25T10:00:00Z', 152, 3000);
  assert.equal(historyRows([clean, disturbed, later]).find((entry) => entry.result.id === 'd').sinceThen.comparable, false);
  assert.equal(historyRows([clean, disturbed, later]).find((entry) => entry.result.id === 'clean').sinceThen.comparable, true);

  // A bad field is dropped, not the entry.
  const odd = parseRigHistory([{ ...clean, disturbed: 'yes', disturbedBy: ['x'] }, { ...disturbed, id: 'e', disturbedBy: ['ok', 3, '', null] }]);
  assert.equal('disturbed' in odd.find((entry) => entry.id === 'clean'), false);
  assert.deepEqual(odd.find((entry) => entry.id === 'e').disturbedBy, ['ok']);
  // A history saved by this version reads back in the version before it: the extra fields are ignored there.
  const { disturbed: _flag, disturbedBy: _why, ...asBefore } = disturbed;
  assert.deepEqual(Object.keys(asBefore), Object.keys(clean));
});

test('runs of different tiers are never compared with each other', () => {
  const rows = historyRows([
    result('light', '2026-10-24T10:00:00Z', 150, 3000),
    result('standard', '2026-10-24T11:00:00Z', 80, 1500, { tier: 'standard', model: 'qwen3:8b' }),
  ]);
  assert.ok(rows.every((row) => row.latest && row.sinceThen === null));
});
