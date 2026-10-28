// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fakeOllama, simulatedModel as simulate, tokensFor } from './support/fakeOllama.mjs';

const require = createRequire(import.meta.url);
const {
  SIZE_TOLERANCE, buildEndurancePrompt, calibrateLines, promptSizeOk, normalizeEnduranceRequest, runEndurance,
} = require('../electron/enduranceRunner.cjs');
const { unloadOllamaModel } = require('../electron/rigScoreRunner.cjs');
const { fetchJson } = await import('../cli/ollamaHttp.ts');
const {
  ENDURANCE_STAGES, ENDURANCE_NUM_PREDICT, ENDURANCE_SPEED_KEPT_MIN, ENDURANCE_ON_CARD_MIN,
  enduranceRequest, enduranceVerdict, assembleEnduranceResult, describeBaseline, contextLabel,
  estimateEnduranceSeconds, describeEnduranceTime,
} = await import('../src/lib/contextEndurance.ts');

const machine = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, driverVersion: '610.88', isUnifiedMemory: false, appVersion: 'rigmatch-fit test' };
const MODEL = 'qwen3:14b';

// ---- The experiment's real numbers (2026-10-26, RTX 4070 12 GB, Ollama 0.35.1) ----

/** [prompt tokens, reading tok/s, writing tok/s, load s, share on the card, context reported] per stage. */
const REAL = {
  'llama3.2:3b': [[294, 3642, 167, 2.63, 1, 2048], [5947, 7842.1, 130.7, 2.65, 1, 8192], [13817, 6516.4, 102.2, 2.66, 1, 16384]],
  'qwen3:8b': [[287, 1937.2, 74, 2.86, 1, 2048], [6114, 3693.5, 61, 2.98, 1, 8192], [14390, 3211.8, 49.9, 3.18, 1, 16384]],
  'qwen3:14b': [[288, 1345.3, 42.5, 3.67, 1, 2048], [6121, 2021.3, 38, 3.98, 1, 8192], [14390, 394, 13, 4.69, 0.868, 16384]],
};

const readingOf = (def, [promptTokens, readingTps, writingTps, loadSeconds, gpuShare, contextReported], extra = {}) => ({
  id: def.id,
  numCtx: def.numCtx,
  targetTokens: def.targetTokens,
  status: 'ok',
  promptTokens,
  readingTps,
  writingTps,
  loadSeconds,
  gpuShare,
  contextReported,
  passkeyKept: true,
  sizeOk: promptSizeOk(promptTokens, def.targetTokens),
  ...extra,
});

const doneReply = (stages) => ({ status: 'done', stages, tokensPerLine: 33, numPredict: ENDURANCE_NUM_PREDICT, machine });
const resultOf = (stages) => {
  const outcome = assembleEnduranceResult(MODEL, doneReply(stages), null, '2026-10-27T10:00:00.000Z');
  assert.equal(outcome.kind, 'measured');
  return outcome.result;
};
const realStages = (model) => REAL[model].map((numbers, index) => readingOf(ENDURANCE_STAGES[index], numbers));

// ---- The prompt ----------------------------------------------------------------------

test('the prompt starts with a fresh line, hides the passkey 55% of the way in, and asks for JSON only', () => {
  const a = buildEndurancePrompt({ lines: 200, passkey: 'RM-4242', nonce: 'nonce-a' });
  const b = buildEndurancePrompt({ lines: 200, passkey: 'RM-4242', nonce: 'nonce-b' });
  assert.equal(a.split('\n')[0], '[SESSION_NONCE: nonce-a]', 'a fresh first line, so no cached prefix can be reused');
  assert.notEqual(a.split('\n')[0], b.split('\n')[0]);
  assert.equal(a.split('\n').slice(1).join('\n'), b.split('\n').slice(1).join('\n'), 'only the nonce differs');
  const logLines = a.split('\n').filter((line) => line.startsWith('[LOG_SEQ_'));
  assert.equal(logLines.length, 200);
  const at = logLines.findIndex((line) => line.includes('RM-4242'));
  assert.equal(at, 110, 'line 110 of 200');
  assert.equal(a.match(/RM-4242/g).length, 1, 'said once');
  assert.match(a, /Reply with valid JSON containing ONLY two keys/);
  assert.doesNotMatch(a, /[^\x09\x0a\x20-\x7e]/, 'plain ASCII, whatever the tokenizer');
});

test('a prompt sized from two measured samples hits the target, whatever the tokenizer costs a line', () => {
  for (const perLine of [22, 30.5, 37.5, 55]) {
    const fixed = 90;
    const sample = (lines) => ({ lines, tokens: tokensFor(buildEndurancePrompt({ lines, passkey: 'RM-0000', nonce: 'x' }), perLine, fixed) });
    const sizing = calibrateLines(sample(8), sample(24));
    assert.ok(Math.abs(sizing.tokensPerLine - perLine) < 0.2, `${perLine}: measured ${sizing.tokensPerLine}`);
    for (const stage of ENDURANCE_STAGES) {
      const tokens = tokensFor(buildEndurancePrompt({ lines: sizing.linesFor(stage.targetTokens), passkey: 'RM-1111', nonce: 'y' }), perLine, fixed);
      assert.ok(promptSizeOk(tokens, stage.targetTokens), `${perLine} tokens a line, ${stage.label}: ${tokens} for ${stage.targetTokens}`);
    }
  }
  // Two samples that do not slope up say nothing, so there is no guess.
  assert.equal(calibrateLines({ lines: 8, tokens: 400 }, { lines: 24, tokens: 400 }), null);
  assert.equal(calibrateLines({ lines: 8, tokens: 0 }, { lines: 24, tokens: 0 }), null);
});

test('the size check holds a stage to 15% of its target, and rejects a cut-down prompt', () => {
  assert.equal(SIZE_TOLERANCE, 0.15);
  assert.equal(promptSizeOk(14336, 14336), true);
  assert.equal(promptSizeOk(14336 * 0.86, 14336), true);
  assert.equal(promptSizeOk(14336 * 0.84, 14336), false);
  assert.equal(promptSizeOk(14336 * 1.16, 14336), false);
  // Ollama cuts a prompt longer than the context to about half of it: the limits it logged.
  for (const [numCtx, cutTo] of [[4096, 2050], [8192, 4098], [16384, 8194]]) assert.equal(promptSizeOk(cutTo, numCtx * 0.875), false, `${numCtx} cut to ${cutTo}`);
  assert.equal(promptSizeOk(undefined, 300), false);
  assert.equal(promptSizeOk(0, 300), false);
});

test('the request is checked: a model Ollama could hold, stages that fit their own context', () => {
  const ok = normalizeEnduranceRequest(enduranceRequest(MODEL, 'p1'));
  assert.equal(ok.model, MODEL);
  assert.deepEqual(ok.stages.map((stage) => [stage.id, stage.numCtx]), [['quick', 2048], ['page', 8192], ['project', 16384]]);
  assert.equal(ok.numPredict, 128);
  assert.throws(() => normalizeEnduranceRequest({ ...enduranceRequest(MODEL, 'p'), model: 'bad name; rm' }));
  assert.throws(() => normalizeEnduranceRequest({ ...enduranceRequest(MODEL, 'p'), stages: [] }), /one to 4 stages/);
  // A prompt as long as its context is the one thing this test must not send.
  assert.throws(() => normalizeEnduranceRequest({ ...enduranceRequest(MODEL, 'p'), stages: [{ id: 'a', numCtx: 4096, targetTokens: 4096 }] }), /a prompt size under its context/);
  assert.throws(() => normalizeEnduranceRequest({ ...enduranceRequest(MODEL, 'p'), stages: [{ id: 'a', numCtx: 100, targetTokens: 90 }] }), /a context size/);
  assert.throws(() => normalizeEnduranceRequest({ ...enduranceRequest(MODEL, 'p'), stages: [{ id: 'a', numCtx: 2048, targetTokens: 300 }, { id: 'a', numCtx: 4096, targetTokens: 900 }] }), /different ids/);
});

// ---- The verdict, on the real numbers ------------------------------------------------

test('the three real result sets: the 3B and the 8B hold to 16K, the 14B slows down past 8K', () => {
  const small = resultOf(realStages('llama3.2:3b')).verdict;
  assert.equal(small.kind, 'holds');
  assert.equal(small.headline, 'Holds up to 16K on your card');
  assert.match(small.detail, /At 16K it writes at 102 tok\/s, 61% of its 2K speed\. The whole model stays on the graphics card\. The passkey hidden in the prompt came back at every size\./);

  const middle = resultOf(realStages('qwen3:8b')).verdict;
  assert.equal(middle.kind, 'holds');
  assert.match(middle.detail, /50 tok\/s, 67% of its 2K speed/);

  const big = resultOf(realStages('qwen3:14b')).verdict;
  assert.equal(big.kind, 'slows');
  assert.equal(big.problemStage, 'project');
  assert.equal(big.heldTo, 8192);
  assert.equal(big.headline, 'Slows down past 8K: part of the model moves to system memory');
  assert.match(big.detail, /At 16K it writes at 13 tok\/s, 31% of its 2K speed\. Only 87% of the model fits on the graphics card there; the rest runs from system memory\./);
});

test('the thresholds are 55% of the 2K speed and 92% on the card, and a stage is flagged only under them', () => {
  assert.equal(ENDURANCE_SPEED_KEPT_MIN, 0.55);
  assert.equal(ENDURANCE_ON_CARD_MIN, 0.92);
  const with16k = (writing, share) => {
    const stages = realStages('qwen3:8b');
    stages[2] = readingOf(ENDURANCE_STAGES[2], [14390, 3211, writing, 3, share, 16384]);
    return enduranceVerdict(resultOf(stages).stages);
  };
  assert.equal(with16k(74 * 0.56, 1).kind, 'holds', 'just over 55% is the ordinary cost of a longer context');
  assert.equal(with16k(74 * 0.54, 1).kind, 'slows');
  assert.equal(with16k(74 * 0.54, 1).headline, 'Slows down past 8K', 'no spill, so no cause is claimed');
  assert.equal(with16k(74 * 0.9, 0.92).kind, 'holds', '92% on the card is not flagged');
  const spill = with16k(74 * 0.9, 0.91);
  assert.equal(spill.kind, 'spills', 'under 92% on the card, with the speed still fine');
  assert.equal(spill.headline, 'Part of the model moves to system memory past 8K');
});

test('a lost passkey is "loses the middle", and a wrongly sized stage is never held against the model', () => {
  const lost = realStages('qwen3:8b');
  lost[2] = readingOf(ENDURANCE_STAGES[2], REAL['qwen3:8b'][2], { passkeyKept: false });
  const verdict = enduranceVerdict(resultOf(lost).stages);
  assert.equal(verdict.kind, 'loses');
  assert.equal(verdict.headline, 'Loses the middle of long inputs past 8K');
  assert.match(verdict.detail, /did not come back at 16K/);

  // The first run's failure: Ollama cut the prompt to half the context, and the passkey went with it.
  const cut = realStages('qwen3:8b');
  cut[2] = readingOf(ENDURANCE_STAGES[2], [8194, 3000, 49, 3, 1, 16384], { passkeyKept: false });
  const fair = enduranceVerdict(resultOf(cut).stages);
  assert.equal(fair.kind, 'holds', 'not a failure of the model');
  assert.equal(fair.headline, 'Holds up to 8K on your card, 16K not checked');
  assert.match(fair.notes.join(' '), /Whole project \(16K\) is left out: the prompt came out at 8194 tokens instead of about 14336\. Ollama most likely cut it/);

  // If the 2K prompt is the wrong size there is nothing to compare with.
  const nothing = enduranceVerdict(resultOf([readingOf(ENDURANCE_STAGES[0], [900, 1000, 70, 3, 1, 2048]), ...realStages('qwen3:8b').slice(1)]).stages);
  assert.equal(nothing.kind, 'unchecked');
  assert.match(nothing.detail, /says nothing about the model/);
});

test('a stage that spills or loses the passkey at the first size is said so, and a failed stage is a finding', () => {
  const spillAtTwoK = realStages('qwen3:14b');
  spillAtTwoK[0] = readingOf(ENDURANCE_STAGES[0], [288, 900, 8, 9, 0.5, 2048]);
  assert.equal(enduranceVerdict(resultOf(spillAtTwoK).stages).headline, 'Part of the model runs from system memory even at 2K');

  const failed = realStages('qwen3:14b').slice(0, 2);
  failed.push({ id: 'project', numCtx: 16384, targetTokens: 14336, status: 'failed', error: 'model requires more system memory', outOfMemory: true });
  const stops = enduranceVerdict(resultOf(failed).stages);
  assert.equal(stops.kind, 'stops');
  assert.equal(stops.headline, 'Runs out of memory past 8K');

  // OLLAMA_NUM_PARALLEL above 1 hands the model less context than was asked for.
  const split = realStages('qwen3:8b');
  split[2] = readingOf(ENDURANCE_STAGES[2], [8194, 3000, 49, 3, 1, 8192], { passkeyKept: false });
  const noted = enduranceVerdict(resultOf(split).stages);
  assert.match(noted.notes.join(' '), /gave the model a context of 8K\. Ollama splits the context between slots when OLLAMA_NUM_PARALLEL is above 1/);
});

test('each stage gets the Speed score\'s word for its writing speed, and the baseline is named', () => {
  assert.deepEqual(resultOf(realStages('qwen3:14b')).stages.map((stage) => stage.feels), ['Fast', 'Fast', 'Usable']);
  assert.deepEqual(resultOf(realStages('llama3.2:3b')).stages.map((stage) => stage.feels), ['Excellent', 'Excellent', 'Excellent']);
  assert.equal(describeBaseline({ level: 'clear', vramUsedPercent: 14, utilizationPercent: 29, message: '' }),
    'Before the check the graphics card had 14% of its memory in use and 29% busy. The point where a model slows down moves with what else is using the card.');
  assert.equal(describeBaseline(null), '');
  assert.equal(describeBaseline({ level: 'unknown', vramUsedPercent: null, utilizationPercent: null, message: '' }), '');
  assert.deepEqual(ENDURANCE_STAGES.map((stage) => [stage.label, contextLabel(stage.numCtx)]), [['Quick chat', '2K'], ['Long page', '8K'], ['Whole project', '16K']]);
});

test('it says how long before it starts: minutes, and more for a bigger, slower model', () => {
  const small = estimateEnduranceSeconds({ sizeGb: 2, estimateTps: 158 });
  const big = estimateEnduranceSeconds({ sizeGb: 9.3, estimateTps: 35 });
  assert.ok(small > 10 && small < 60, `${small} s`);
  assert.ok(big > 50 && big < 180, `${big} s`);
  assert.equal(describeEnduranceTime(small), 'about a minute');
  assert.equal(describeEnduranceTime(big), `about ${Math.ceil(big / 60)} minutes`);
  // No estimate: the speed is guessed from the size, so a bigger model is taken as slower.
  assert.ok(estimateEnduranceSeconds({ sizeGb: 14, estimateTps: null }) > estimateEnduranceSeconds({ sizeGb: 14, estimateTps: 60 }));
  assert.ok(estimateEnduranceSeconds({ sizeGb: 9.3, estimateTps: null }) > estimateEnduranceSeconds({ sizeGb: 2, estimateTps: null }));
  assert.equal(describeEnduranceTime(estimateEnduranceSeconds({ sizeGb: 2, estimateTps: null })), 'about a minute');
});

// ---- The runner, against a stand-in Ollama -------------------------------------------

async function run({ fake, request = enduranceRequest(MODEL, 'run-1'), signal, progress = [] } = {}) {
  let nonce = 0;
  let key = 1000;
  return runEndurance({
    request,
    baseUrl: fake.url,
    fetchJson,
    readMachine: async () => machine,
    unloadModel: (baseUrl, model) => unloadOllamaModel({ fetchJson, baseUrl, model, settleMs: 1000, pollMs: 20 }),
    signal,
    onProgress: (update) => progress.push(update),
    makeNonce: () => `nonce-${(nonce += 1)}`,
    makePasskey: () => `RM-${(key += 1)}`,
  });
}

test('it calibrates at the first size, runs the three sizes, reads speeds from Ollama, and unloads what it loaded', async () => {
  const bodies = [];
  const fake = await fakeOllama({ installed: [MODEL], onGenerate: simulate({ onStage: (_ctx, body) => bodies.push(body) }) });
  try {
    const progress = [];
    const reply = await run({ fake, progress });
    assert.equal(reply.status, 'done');
    assert.equal(reply.tokensPerLine, 33);
    assert.deepEqual(reply.stages.map((stage) => stage.id), ['quick', 'page', 'project']);
    assert.deepEqual(reply.stages.map((stage) => stage.sizeOk), [true, true, true]);
    assert.deepEqual(reply.stages.map((stage) => stage.passkeyKept), [true, true, true]);
    for (const [index, stage] of reply.stages.entries()) {
      const want = ENDURANCE_STAGES[index].targetTokens;
      assert.ok(Math.abs(stage.promptTokens - want) / want <= SIZE_TOLERANCE, `${stage.id}: ${stage.promptTokens} for ${want}`);
    }
    assert.deepEqual(reply.stages.map((stage) => Math.round(stage.writingTps)), [100, 80, 60]);
    assert.deepEqual(reply.stages.map((stage) => Math.round(stage.readingTps)), [2000, 3000, 2800]);
    assert.deepEqual(reply.stages.map((stage) => stage.contextReported), [2048, 8192, 16384]);
    assert.deepEqual(reply.stages.map((stage) => stage.gpuShare), [1, 1, 1]);
    // The cold load happened during calibration, so it is the first stage's; the others reloaded for their own size.
    assert.deepEqual(reply.stages.map((stage) => stage.loadSeconds), [6, 2, 2]);

    // What was sent: the context per request, thinking off, no cached prefix, the passkey asked for as JSON.
    assert.deepEqual(bodies.map((body) => body.options.num_ctx), [2048, 2048, 2048, 8192, 16384]);
    assert.deepEqual(bodies.map((body) => body.options.num_predict), [1, 1, 128, 128, 128]);
    assert.ok(bodies.every((body) => body.think === false && body.options.temperature === 0 && body.stream === false && body.keep_alive === '2m'));
    assert.equal(new Set(bodies.map((body) => body.prompt.split('\n')[0])).size, 5, 'a fresh first line every time');
    assert.ok(bodies.slice(2).every((body) => body.prompt.includes('Reply with valid JSON containing ONLY two keys')));

    assert.deepEqual(fake.unloads(), [MODEL], 'unloaded what it loaded');
    assert.equal(fake.state.loaded.length, 0);
    assert.deepEqual(progress.map((update) => update.phase), ['checking', 'calibrating', 'stage', 'stage', 'stage', 'unloading']);
    assert.deepEqual(progress.filter((update) => update.phase === 'stage').map((update) => [update.stage, update.index, update.of]), [['quick', 1, 3], ['page', 2, 3], ['project', 3, 3]]);
  } finally {
    await fake.close();
  }
});

test('it sizes from the model\'s own tokenizer: the same stages at 22 and at 55 tokens a line', async () => {
  for (const perLine of [22, 55]) {
    const fake = await fakeOllama({ installed: [MODEL], onGenerate: simulate({ perLine }) });
    try {
      const reply = await run({ fake });
      assert.equal(reply.status, 'done');
      assert.ok(Math.abs(reply.tokensPerLine - perLine) < 0.2);
      assert.deepEqual(reply.stages.map((stage) => stage.sizeOk), [true, true, true], `${perLine} tokens a line`);
    } finally {
      await fake.close();
    }
  }
});

test('a prompt Ollama cut is marked as the wrong size, not as the model forgetting', async () => {
  // OLLAMA_NUM_PARALLEL=2: the 16K stage gets 8K, the 14K prompt is cut to about half of it, and the passkey goes.
  const fake = await fakeOllama({ installed: [MODEL], onGenerate: simulate({ contextCap: 8192 }) });
  try {
    const reply = await run({ fake });
    assert.equal(reply.status, 'done');
    const last = reply.stages[2];
    assert.equal(last.sizeOk, false);
    assert.equal(last.passkeyKept, false);
    assert.equal(last.contextReported, 8192);
    assert.ok(last.promptTokens < 8200);
    const outcome = assembleEnduranceResult(MODEL, reply, null, '2026-10-27T10:00:00.000Z');
    assert.equal(outcome.result.stages[2].contextShort, true);
    const verdict = outcome.result.verdict;
    assert.equal(verdict.kind, 'holds', 'never reported as the model losing its place');
    assert.match(verdict.notes.join(' '), /Ollama splits the context between slots/);
    assert.match(verdict.notes.join(' '), /left out/);
  } finally {
    await fake.close();
  }
});

test('the verdict from a full run: speed kept, spill and a forgotten passkey are each found', async () => {
  const fake = await fakeOllama({
    installed: [MODEL],
    onGenerate: simulate({ write: { 2048: 42.5, 8192: 38, 16384: 13 }, share: { 2048: 1, 8192: 1, 16384: 0.868 }, forget: [16384] }),
  });
  try {
    const outcome = assembleEnduranceResult(MODEL, await run({ fake }), null, '2026-10-27T10:00:00.000Z');
    assert.equal(outcome.result.verdict.kind, 'slows');
    assert.equal(outcome.result.verdict.headline, 'Slows down past 8K: part of the model moves to system memory');
    assert.match(outcome.result.verdict.detail, /passkey hidden in the prompt did not come back at 16K/);
  } finally {
    await fake.close();
  }
});

test('another program\'s model is never run beside: it refuses, loads nothing and unloads nothing', async () => {
  const fake = await fakeOllama({ installed: [MODEL, 'mistral:7b'], loaded: ['mistral:7b'], onGenerate: simulate() });
  try {
    const reply = await run({ fake });
    assert.deepEqual(reply, { status: 'busy', loadedModels: ['mistral:7b'] });
    assert.deepEqual(fake.loads(), []);
    assert.deepEqual(fake.unloads(), [], 'it never unloads what it did not load');
    const outcome = assembleEnduranceResult(MODEL, reply, null, 'now');
    assert.match(outcome.message, /Ollama has mistral:7b loaded by another program\. It shares the graphics card and would slow the check/);
    // Its own model loaded elsewhere is another program's too.
    const same = await fakeOllama({ installed: [MODEL], loaded: [MODEL], onGenerate: simulate() });
    try {
      assert.deepEqual(await run({ fake: same }), { status: 'busy', loadedModels: [MODEL] });
      assert.deepEqual(same.unloads(), []);
    } finally {
      await same.close();
    }
  } finally {
    await fake.close();
  }
});

test('a program that loads a model mid-run ends the check: nothing is kept, its model is left alone, ours is unloaded', async () => {
  let fake;
  fake = await fakeOllama({
    installed: [MODEL],
    onGenerate: simulate({ onStage: (numCtx) => { if (numCtx === 16384) fake.state.loaded.push({ name: 'mistral:7b', size: 100, size_vram: 100, expires_at: new Date(Date.now() + 300_000).toISOString() }); } }),
  });
  try {
    const reply = await run({ fake });
    assert.equal(reply.status, 'shared');
    assert.deepEqual(reply.loadedModels, ['mistral:7b']);
    assert.deepEqual(fake.unloads(), [MODEL]);
    assert.deepEqual(fake.state.loaded.map((entry) => entry.name), ['mistral:7b']);
  } finally {
    await fake.close();
  }
});

test('a model Ollama unloaded mid-check, for another program\'s, ends the check: the numbers would be low', async () => {
  const fake = await fakeOllama({ installed: [MODEL], onGenerate: simulate({ evict: [16384] }) });
  try {
    const reply = await run({ fake });
    assert.deepEqual(reply, { status: 'shared', loadedModels: [], evicted: true });
    assert.match(assembleEnduranceResult(MODEL, reply, null, 'now').message, /^Not saved: Ollama unloaded qwen3:14b while the check ran, most likely to make room for another program's model/);
  } finally {
    await fake.close();
  }
});

test('a card that was busy before the check is said beside the verdict too', () => {
  const stages = realStages('qwen3:14b');
  const quiet = assembleEnduranceResult(MODEL, doneReply(stages), { level: 'clear', vramUsedPercent: 14, utilizationPercent: 29, message: '' }, 'now').result;
  assert.deepEqual(quiet.verdict.notes, []);
  const busy = assembleEnduranceResult(MODEL, doneReply(stages), { level: 'busy', vramUsedPercent: 49, utilizationPercent: 62, message: 'Before starting: the graphics card is 62% busy.' }, 'now').result;
  assert.match(busy.verdict.notes.join(' '), /The graphics card was busy before the check started, so a slow-down here may be something else's and not the model's/);
  assert.equal(busy.verdict.kind, 'slows', 'it does not change what was measured');
});

test('stopping cleans up: the model is unloaded and nothing is reported', async () => {
  const fake = await fakeOllama({ installed: [MODEL], stall: true });
  try {
    const controller = new AbortController();
    const running = run({ fake, signal: controller.signal });
    assert.equal(await fake.waitForStall(), true, 'the first request is being held');
    controller.abort();
    assert.deepEqual(await running, { status: 'stopped' });
    assert.deepEqual(fake.unloads(), [MODEL]);
    assert.equal(fake.state.loaded.length, 0);
    // Stopped before it began: nothing is asked of Ollama at all.
    const before = new AbortController();
    before.abort();
    const none = await fakeOllama({ installed: [MODEL] });
    try {
      assert.deepEqual(await run({ fake: none, signal: before.signal }), { status: 'stopped' });
      assert.deepEqual(none.calls, []);
    } finally {
      await none.close();
    }
  } finally {
    await fake.close();
  }
});

test('a model that is not installed is not pulled or run; one that does not fit says so; memory at 16K is a finding', async () => {
  const absent = await fakeOllama({ installed: ['llama3.2:3b'], onGenerate: simulate() });
  try {
    assert.deepEqual(await run({ fake: absent }), { status: 'not-installed' });
    assert.deepEqual(absent.loads(), []);
    assert.equal(absent.calls.some((call) => call.path === '/api/pull'), false);
  } finally {
    await absent.close();
  }

  const tooBig = await fakeOllama({ installed: [MODEL], onGenerate: () => { throw new Error('model requires more system memory (20.1 GiB) than is available (9.0 GiB)'); } });
  try {
    assert.equal((await run({ fake: tooBig })).status, 'too-big');
  } finally {
    await tooBig.close();
  }

  const late = await fakeOllama({ installed: [MODEL], onGenerate: (body) => {
    if (body.options.num_ctx === 16384) throw new Error('llama runner process has terminated: cudaMalloc failed: out of memory');
    return simulate()(body);
  } });
  try {
    const reply = await run({ fake: late });
    assert.equal(reply.status, 'done');
    assert.deepEqual(reply.stages.map((stage) => stage.status), ['ok', 'ok', 'failed']);
    assert.equal(reply.stages[2].outOfMemory, true);
    assert.equal(assembleEnduranceResult(MODEL, reply, null, 'now').result.verdict.headline, 'Runs out of memory past 8K');
    assert.deepEqual(late.unloads(), [MODEL]);
  } finally {
    await late.close();
  }
});

test('an Ollama that predates think:false is asked again without it', async () => {
  const bodies = [];
  const fake = await fakeOllama({ installed: [MODEL], onGenerate: (body) => {
    bodies.push(body);
    if ('think' in body) throw new Error('json: unknown field "think"');
    return simulate()(body);
  } });
  try {
    const reply = await run({ fake });
    assert.equal(reply.status, 'done');
    assert.equal(bodies.filter((body) => 'think' in body).length, 1, 'refused once, then left out');
    assert.ok(bodies.slice(1).every((body) => !('think' in body)));
  } finally {
    await fake.close();
  }
});
