import test from 'node:test';
import assert from 'node:assert/strict';

const {
  RIG_TIERS, RIG_WORKLOAD, RIG_REFERENCES, rigPoints, referenceStamp,
} = await import('../src/lib/rigScore.ts');
const { rigRunRequest, tierAvailability, tiersToRun, assembleTierResult, rigHeadline } = await import('../src/lib/rigScoreRun.ts');
const { formatDay } = await import('../src/lib/format.ts');
const { RIG_PASSAGE, rigPrompt } = await import('../src/lib/rigScorePassage.ts');

const tier = (id) => RIG_TIERS.find((entry) => entry.id === id);
const timed = (decodeTps, prefillTps) => ({
  promptEvalCount: 1486, promptEvalSeconds: 1486 / prefillTps,
  evalCount: 256, evalSeconds: 256 / decodeTps, loadSeconds: 0.02,
});
const machine = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, driverVersion: '610.88', appVersion: '0.9.9' };
const done = (runs, extra = {}) => ({
  status: 'done', runs, coldLoadSeconds: 1.2, gpuShare: 1, ollamaVersion: '0.35.1',
  modelDigest: 'sha256-aaa', quantization: 'Q4_K_M', machine, ...extra,
});

test('the passage is fixed plain text, and every run opens with its own line', () => {
  assert.match(RIG_PASSAGE, /^[\x20-\x7e\n]+$/, 'plain ASCII, so every tokenizer splits it the same way');
  const words = RIG_PASSAGE.split(/\s+/).length;
  // Measured at 1,486 tokens (llama3.2) and 1,495 (qwen3) with these words; a
  // big edit has to be measured again, and the workload version moved.
  assert.ok(words > 1230 && words < 1300, `${words} words`);
  assert.equal(RIG_WORKLOAD.promptTokensTarget, 1500);
  assert.notEqual(rigPrompt(1).slice(0, 12), rigPrompt(2).slice(0, 12));
  assert.ok(rigPrompt(3).includes(RIG_PASSAGE));
});

test('a request carries the fixed workload: one prompt per run, the warm-up first', () => {
  const request = rigRunRequest(tier('standard'), 'rig-1');
  assert.equal(request.model, 'qwen3:8b');
  assert.equal(request.minVramGb, 8);
  assert.equal(request.prompts.length, RIG_WORKLOAD.warmupRuns + RIG_WORKLOAD.measuredRuns);
  assert.equal(new Set(request.prompts).size, request.prompts.length);
  assert.deepEqual(request.options, {
    num_ctx: RIG_WORKLOAD.numCtx, num_predict: RIG_WORKLOAD.numPredict,
    temperature: RIG_WORKLOAD.temperature, seed: RIG_WORKLOAD.seed,
  });
});

test('each tier says what it needs: ready, a download with its size, or not run on a small card', () => {
  const twelve = { vramGb: 12 };
  const installed = ['llama3.2:3b', 'gemma3:4b'];
  assert.deepEqual(tierAvailability(tier('light'), twelve, installed), { kind: 'ready' });
  assert.deepEqual(tierAvailability(tier('standard'), twelve, installed), { kind: 'needs-download', sizeGb: 5.2 });
  assert.deepEqual(tierAvailability(tier('heavy'), twelve, installed), { kind: 'needs-download', sizeGb: 9.3 });
  assert.deepEqual(tierAvailability(tier('extreme'), twelve, [...installed, 'qwen3:30b-a3b']), { kind: 'too-big', needGb: 24, haveGb: 12 },
    'too big even when installed');
  assert.deepEqual(tierAvailability(tier('standard'), { vramGb: 6 }, ['qwen3:8b']), { kind: 'too-big', needGb: 8, haveGb: 6 });
  assert.equal(tierAvailability(tier('extreme'), { vramGb: 0, isUnifiedMemory: true }, ['qwen3:30b-a3b']).kind, 'ready');
  // "qwen3:latest" is not the fixed tag the test names.
  assert.equal(tierAvailability(tier('standard'), twelve, ['qwen3:latest']).kind, 'needs-download');
});

test('"Run the speed test" runs only the tiers this PC can hold and already has', () => {
  assert.deepEqual(tiersToRun({ vramGb: 12 }, ['llama3.2:3b', 'qwen3:14b', 'qwen3:30b-a3b']).map((entry) => entry.id), ['light', 'heavy']);
  assert.deepEqual(tiersToRun({ vramGb: 2 }, ['llama3.2:3b']), []);
});

test('a finished run becomes a measure and a stamp', () => {
  const outcome = assembleTierResult(tier('light'), done([timed(140, 3000), timed(150, 3100), timed(30, 2900)]), '2026-10-24T21:00:00.000Z');
  assert.equal(outcome.kind, 'measured');
  const { result } = outcome;
  assert.equal(result.tier, 'light');
  assert.equal(result.completedAt, '2026-10-24T21:00:00.000Z');
  assert.equal(Math.round(result.measure.decodeTps), 140, 'the median, so the slow run does not move it');
  assert.equal(Math.round(result.measure.prefillTps), 3000);
  assert.equal(result.measure.runs, 3);
  assert.equal(result.stamp.workloadVersion, RIG_WORKLOAD.version);
  assert.equal(result.stamp.numCtx, RIG_WORKLOAD.numCtx);
  assert.equal(result.stamp.modelDigest, 'sha256-aaa');
  assert.equal(result.stamp.driverVersion, '610.88');
  assert.equal(result.measure.loadSeconds, 1.2, 'the cold load from the warm-up, not the 0.02 s of the timed runs');
});

test('too few usable runs is a failure with no score, never a zero', () => {
  const outcome = assembleTierResult(tier('light'), done([timed(140, 3000), timed(150, 3100), { ...timed(150, 3100), evalCount: 3 }]), 'x');
  assert.equal(outcome.kind, 'failed');
  assert.match(outcome.message, /no score/);
});

test('every way a tier can end without a result is said in words', () => {
  const said = (reply, id = 'standard') => assembleTierResult(tier(id), reply, 'x');
  const missing = said({ status: 'not-installed' });
  assert.equal(missing.kind, 'not-installed');
  assert.match(missing.message, /qwen3:8b is not installed\. It is a 5\.2 GB download\./);

  const small = said({ status: 'too-big', machine: { ...machine, vramGb: 12 } }, 'extreme');
  assert.equal(small.kind, 'too-big');
  assert.match(small.message, /^Not run: the Extreme tier needs 24 GB of graphics memory, and this PC has 12 GB\.$/);
  assert.doesNotMatch(small.message, /\b0\b/);
  assert.match(said({ status: 'too-big', error: 'requires more system memory' }).message, /did not fit in this PC's memory/);

  const busy = said({ status: 'busy', loadedModels: ['mistral:7b', 'gemma3:4b'] });
  assert.equal(busy.kind, 'busy');
  assert.match(busy.message, /Ollama has mistral:7b and gemma3:4b loaded by another program\./);

  assert.match(busy.message, /another program/);

  const shared = said({ status: 'shared', loadedModels: ['gemma3:4b'], sameModel: false });
  assert.equal(shared.kind, 'busy', 'treated as a busy card, so the queue stops');
  assert.match(shared.message, /^Not saved: gemma3:4b came to share the graphics card while the test ran/);
  assert.match(said({ status: 'shared', loadedModels: [], sameModel: true }).message, /another program's use of qwen3:8b/);

  assert.equal(said({ status: 'stopped' }).kind, 'stopped');
  const failed = said({ status: 'failed', error: 'connection refused' });
  assert.equal(failed.kind, 'failed');
  assert.match(failed.message, /connection refused/);
});

const reference = {
  prefillTps: 3000, decodeTps: 150, measuredOn: '2026-10-24', gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12,
  model: 'llama3.2:3b', modelDigest: 'sha256-aaa', quantization: 'Q4_K_M', ollamaVersion: '0.35.1',
  driverVersion: '610.88', appVersion: '0.9.9', workloadVersion: RIG_WORKLOAD.version, numCtx: RIG_WORKLOAD.numCtx, gpuShare: 1,
};
const references = { light: reference, standard: null, heavy: null, extreme: null };

test('points need a measured reference: a pending tier shows no number', () => {
  const { result } = assembleTierResult(tier('standard'), done([timed(80, 1500), timed(80, 1500), timed(80, 1500)]), 'x');
  assert.deepEqual(rigPoints(result.measure, result.stamp, references), { kind: 'pending' });
});

test('points are 1000 at the reference, and only for the same work', () => {
  const at = (decode, prefill, extra = {}) => {
    const { result } = assembleTierResult(tier('light'), done([timed(decode, prefill), timed(decode, prefill), timed(decode, prefill)], extra), 'x');
    return rigPoints(result.measure, result.stamp, references);
  };
  assert.deepEqual(at(150, 3000), { kind: 'points', points: 1000, notes: [] });
  assert.equal(at(300, 6000).points, 2000);
  const otherWeights = at(150, 3000, { modelDigest: 'sha256-bbb' });
  assert.equal(otherWeights.kind, 'not-comparable');
  assert.match(otherWeights.notes.join(' '), /model files differ/);
  const newerOllama = at(150, 3000, { ollamaVersion: '0.40.5' });
  assert.equal(newerOllama.kind, 'points');
  assert.deepEqual(newerOllama.notes, ['Ollama 0.35.1 against 0.40.5.']);
});

test("against the reference, another computer's card is not a caveat; a different driver on the same card is", () => {
  const at = (extra) => {
    const { result } = assembleTierResult(tier('light'), done([timed(150, 3000), timed(150, 3000), timed(150, 3000)], extra), 'x');
    return rigPoints(result.measure, result.stamp, references);
  };
  const otherCard = at({ machine: { ...machine, gpu: 'NVIDIA GeForce RTX 3060', driverVersion: '581.15' } });
  assert.deepEqual(otherCard.notes, [], 'no "Graphics card" or "Driver" note: the card is what points measure');
  const newDriver = at({ machine: { ...machine, driverVersion: '612.10' } });
  assert.deepEqual(newDriver.notes, ['Driver 610.88 against 612.10.']);
});

test('the headline and its speed band are the Standard tier; a Light result alone gets no band', () => {
  const measured = (id, decode) => assembleTierResult(tier(id), done([timed(decode, 3000), timed(decode, 3000), timed(decode, 3000)]), `2026-10-24T2${id.length}:00:00Z`).result;
  assert.deepEqual(rigHeadline({}), { result: null, isHeadlineTier: false, band: null });

  // A fast 3B model on a card that would make the 8B headline crawl.
  const lightOnly = rigHeadline({ light: measured('light', 96) });
  assert.equal(lightOnly.result.tier, 'light');
  assert.equal(lightOnly.isHeadlineTier, false);
  assert.equal(lightOnly.band, null, 'no "Excellent" for the headline from a 3B model');

  const both = rigHeadline({ light: measured('light', 96), standard: measured('standard', 30) });
  assert.equal(both.result.tier, 'standard');
  assert.equal(both.isHeadlineTier, true);
  assert.equal(both.band.id, 'fast');
});

test('the reference day is written as a day, and not moved a day west of Greenwich', () => {
  const zone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const written = formatDay('2026-10-24');
    assert.match(written, /24/);
    assert.match(written, /2026/);
    assert.doesNotMatch(written, /23/);
    assert.doesNotMatch(written, /:/, 'no time of day');
  } finally {
    if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone;
  }
  assert.equal(formatDay('not a day'), 'not a day');
});

test('the written-down references are complete where measured and pending where not', () => {
  for (const entry of RIG_TIERS) {
    const written = RIG_REFERENCES[entry.id];
    if (!written) continue;
    assert.equal(written.model, entry.model);
    assert.match(written.measuredOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(written.modelDigest, /^sha256-[0-9a-f]{64}$/);
    assert.ok(written.decodeTps > 0 && written.prefillTps > 0);
    assert.equal(written.workloadVersion, RIG_WORKLOAD.version);
    assert.equal(written.numCtx, RIG_WORKLOAD.numCtx);
    assert.equal(referenceStamp(entry.id, written).tier, entry.id);
    assert.equal(written.gpuShare, 1, `${entry.id} was measured with all of it on the card, not a spill`);
  }
  // One machine, one day, one Ollama: the three measured tiers share their stamp.
  for (const id of ['light', 'standard', 'heavy']) {
    assert.ok(RIG_REFERENCES[id], `${id} is measured`);
    assert.equal(RIG_REFERENCES[id].gpu, 'NVIDIA GeForce RTX 4070');
    assert.equal(RIG_REFERENCES[id].ollamaVersion, '0.35.1');
    assert.equal(RIG_REFERENCES[id].driverVersion, '610.88');
    assert.equal(RIG_REFERENCES[id].measuredOn, '2026-10-24');
  }
  assert.equal(new Set(['light', 'standard', 'heavy'].map((id) => RIG_REFERENCES[id].modelDigest)).size, 3, 'each tier its own weights');
  // The tiers get slower as they get bigger, as they must on one card.
  assert.ok(RIG_REFERENCES.light.decodeTps > RIG_REFERENCES.standard.decodeTps && RIG_REFERENCES.standard.decodeTps > RIG_REFERENCES.heavy.decodeTps);
  assert.equal(RIG_REFERENCES.extreme, null, 'the reference card has 12 GB; the Extreme tier needs 24');
});

test("a Standard result on the reference PC headlines with points and a speed band", () => {
  const standard = RIG_REFERENCES.standard;
  const runs = [timed(standard.decodeTps, standard.prefillTps), timed(standard.decodeTps, standard.prefillTps), timed(standard.decodeTps, standard.prefillTps)];
  const { result } = assembleTierResult(tier('standard'), done(runs, { modelDigest: standard.modelDigest }), '2026-10-24T22:00:00.000Z');
  const headline = rigHeadline({ standard: result });
  assert.equal(headline.isHeadlineTier, true);
  assert.equal(headline.band.id, 'excellent', '66 tok/s writing');
  assert.deepEqual(rigPoints(result.measure, result.stamp), { kind: 'points', points: 1000, notes: [] });

  // The same speeds on other weights (a moved tag) get no points.
  const { result: moved } = assembleTierResult(tier('standard'), done(runs, { modelDigest: 'sha256-other' }), 'x');
  assert.equal(rigPoints(moved.measure, moved.stamp).kind, 'not-comparable');
});
