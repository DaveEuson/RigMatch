import test from 'node:test';
import assert from 'node:assert/strict';

const {
  RIG_TIERS, RIG_WORKLOAD, measureTier, tierPoints, compareStamps, tiersThatFit,
} = await import('../src/lib/rigScore.ts');

const run = (decodeTps, prefillTps) => ({
  promptEvalCount: 1500, promptEvalSeconds: 1500 / prefillTps,
  evalCount: 256, evalSeconds: 256 / decodeTps, loadSeconds: 1,
});

test('the tier models are the exact tags the catalog already carries, smallest first', () => {
  assert.deepEqual(RIG_TIERS.map((tier) => tier.id), ['light', 'standard', 'heavy', 'extreme']);
  const sizes = RIG_TIERS.map((tier) => tier.sizeGb);
  assert.deepEqual([...sizes].sort((a, b) => a - b), sizes);
});

test('a measure is the median of the usable runs, so one slow run does not move it', () => {
  const measure = measureTier([run(70, 2000), run(71, 2000), run(20, 2000)]);
  assert.equal(Math.round(measure.decodeTps), 70);
  assert.equal(measure.runs, 3);
});

test('a run that decoded almost nothing, or took no time, is not evidence', () => {
  const bad = { ...run(70, 2000), evalCount: 5 };
  assert.equal(measureTier([run(70, 2000), run(70, 2000), bad]), null, 'two usable runs are fewer than the three needed');
  assert.equal(measureTier([run(70, 2000), run(70, 2000), { ...run(70, 2000), evalSeconds: 0 }]), null);
});

test('points are 1000 at the reference and scale as the geometric mean of both speeds', () => {
  const reference = { decodeTps: 70, prefillTps: 2000 };
  const at = (decode, prefill) => tierPoints(measureTier([run(decode, prefill), run(decode, prefill), run(decode, prefill)]), reference);
  assert.equal(at(70, 2000), 1000);
  assert.equal(at(140, 4000), 2000);
  assert.equal(at(140, 2000), 1414, 'twice as fast at one half only is about 1414');
  assert.equal(at(35, 1000), 500);
});

test('results of different weights, workload or context are not set side by side', () => {
  const base = {
    tier: 'standard', model: 'qwen3:8b', modelDigest: 'sha256-aaa', quantization: 'Q4_K_M',
    workloadVersion: RIG_WORKLOAD.version, numCtx: RIG_WORKLOAD.numCtx, appVersion: '0.9.7',
  };
  assert.equal(compareStamps(base, { ...base }).comparable, true);
  assert.equal(compareStamps(base, { ...base, modelDigest: 'sha256-bbb' }).comparable, false);
  assert.equal(compareStamps(base, { ...base, workloadVersion: 2 }).comparable, false);
  assert.equal(compareStamps(base, { ...base, numCtx: 8192 }).comparable, false);
  assert.equal(compareStamps(base, { ...base, tier: 'heavy', model: 'qwen3:14b' }).comparable, false);
});

test('a different Ollama or driver is compared, with the difference named', () => {
  const base = {
    tier: 'standard', model: 'qwen3:8b', modelDigest: 'sha256-aaa', workloadVersion: 1, numCtx: 4096,
    appVersion: '0.9.7', ollamaVersion: '0.35.1', driverVersion: '595.104',
  };
  const verdict = compareStamps(base, { ...base, ollamaVersion: '0.40.1', driverVersion: '580.1' });
  assert.equal(verdict.comparable, true);
  assert.equal(verdict.notes.length, 2);
  assert.match(verdict.notes[0], /0\.35\.1 against 0\.40\.1/);
});

test('a card is offered only the tiers it can hold, and unified memory all of them', () => {
  assert.deepEqual(tiersThatFit(12).map((tier) => tier.id), ['light', 'standard', 'heavy']);
  assert.deepEqual(tiersThatFit(6).map((tier) => tier.id), ['light']);
  assert.deepEqual(tiersThatFit(0, true).map((tier) => tier.id), ['light', 'standard', 'heavy', 'extreme']);
});
