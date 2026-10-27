// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { createRigSession, rigScoreBusy } = await import('../src/lib/rigScoreSession.ts');
const { RIG_TIERS } = await import('../src/lib/rigScore.ts');
const { parseEnduranceResults, addEnduranceResult, isEnduranceResult } = await import('../src/lib/enduranceHistory.ts');
const { ENDURANCE_STAGES, assembleEnduranceResult, baselineFromContention } = await import('../src/lib/contextEndurance.ts');
const { createRigScoreDemo } = await import('../src/lib/rigScoreDemo.ts');

const machine = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, appVersion: '0.10.0' };
const reading = (def, writingTps, gpuShare = 1) => ({
  id: def.id, numCtx: def.numCtx, targetTokens: def.targetTokens, status: 'ok', promptTokens: def.targetTokens, readingTps: 3000, writingTps,
  loadSeconds: 2, gpuShare, contextReported: def.numCtx, passkeyKept: true, sizeOk: true,
});
const done = { status: 'done', stages: ENDURANCE_STAGES.map((def, index) => reading(def, [100, 90, 80][index])), tokensPerLine: 33, numPredict: 128, machine };
const baseline = { level: 'clear', vramUsedPercent: 14, utilizationPercent: 29, message: '' };
/** The app's own reading of the card (GpuContention), which the session turns into the baseline. */
const cardReading = { ...baseline, reasons: [], apps: [], source: 'nvidia-smi' };

/** A bridge with scripted answers, recording what it was asked. */
function bridge(answer, { contention = async () => cardReading } = {}) {
  const asked = [];
  const canceled = [];
  let progress = null;
  return {
    asked,
    canceled,
    emit: (update) => progress?.(update),
    runEndurance: async (request) => { asked.push(request); return typeof answer === 'function' ? answer(request) : answer; },
    cancelRigScore: async (progressId) => { canceled.push(progressId); },
    onEnduranceProgress: (callback) => { progress = callback; return () => { progress = null; }; },
    getGpuContention: contention,
    runRigScore: async () => ({ status: 'stopped' }),
  };
}

const session = (fake, saved = []) => {
  const writes = [];
  const made = createRigSession(fake, {
    loadHistory: () => [],
    saveHistory: () => true,
    loadEndurance: () => saved,
    saveEndurance: (results) => { writes.push(results); return true; },
    now: () => '2026-10-27T10:00:00.000Z',
  });
  return { made, writes };
};

test('a context check names the card it ran on, keeps the result for that model, and replaces an older one', async () => {
  const fake = bridge(done);
  const { made, writes } = session(fake);
  await made.checkContext('qwen3:14b');
  const state = made.getState();
  assert.deepEqual(fake.asked.map((request) => [request.model, request.stages.map((stage) => stage.numCtx), request.numPredict]), [['qwen3:14b', [2048, 8192, 16384], 128]]);
  assert.equal(state.endurance, null);
  assert.equal(state.enduranceResults.length, 1);
  assert.equal(state.enduranceResults[0].model, 'qwen3:14b');
  assert.deepEqual(state.enduranceResults[0].baseline, baseline, 'the baseline is read before the run and kept with the result');
  assert.equal(state.enduranceResults[0].verdict.headline, 'Holds up to 16K on your card');
  assert.equal(writes.length, 1);

  await made.checkContext('qwen3:14b');
  await made.checkContext('llama3.2:3b');
  assert.deepEqual(made.getState().enduranceResults.map((result) => result.model).sort(), ['llama3.2:3b', 'qwen3:14b'], 'one per model');
});

test('while a check runs the card counts as taken: no speed test starts, progress is shown, Stop cancels it', async () => {
  let release;
  const fake = bridge((request) => new Promise((resolve) => { release = () => resolve({ status: 'stopped' }); fake.emit({ id: request.progressId, phase: 'stage', stage: 'page', index: 2, of: 3 }); }));
  const { made } = session(fake);
  const running = made.checkContext('qwen3:14b');
  await new Promise((resolve) => setImmediate(resolve));
  const live = made.getState();
  assert.equal(live.endurance.model, 'qwen3:14b');
  assert.equal(rigScoreBusy(live), true);
  assert.deepEqual(live.enduranceProgress, { id: live.endurance.progressId, phase: 'stage', stage: 'page', index: 2, of: 3 });
  assert.equal(live.running, null, 'a tier is not what is running');

  await made.runTiers([RIG_TIERS[0]]);
  await made.checkContext('llama3.2:3b');
  assert.equal(fake.asked.length, 1, 'nothing else starts beside it');

  made.stop();
  assert.deepEqual(fake.canceled, [live.endurance.progressId], 'Stop names the check');
  release();
  await running;
  const after = made.getState();
  assert.equal(after.endurance, null);
  assert.equal(rigScoreBusy(after), false);
  assert.equal(after.enduranceResults.length, 0, 'a stopped check saves nothing');
  assert.match(after.enduranceMessages['qwen3:14b'], /Stopped\. Nothing was saved for this check\./);
});

test('Stop before the model is asked for ends the check without starting it', async () => {
  let started = false;
  let askedCard;
  const fake = bridge(() => { started = true; return done; }, { contention: () => new Promise((resolve) => { askedCard = () => resolve(cardReading); }) });
  const { made } = session(fake);
  const running = made.checkContext('qwen3:14b');
  await new Promise((resolve) => setImmediate(resolve));
  made.stop();
  askedCard();
  await running;
  assert.equal(started, false);
  assert.match(made.getState().enduranceMessages['qwen3:14b'], /Stopped/);
});

test('a busy card, a shared card and a failure each say so, and keep nothing', async () => {
  for (const [reply, message] of [
    [{ status: 'busy', loadedModels: ['mistral:7b'] }, /Ollama has mistral:7b loaded by another program/],
    [{ status: 'shared', loadedModels: ['mistral:7b'] }, /Not saved: mistral:7b came to share the graphics card/],
    [{ status: 'not-installed' }, /qwen3:14b is not installed/],
    [{ status: 'too-big' }, /did not fit in this PC's memory/],
    [{ status: 'failed', error: 'connection refused' }, /The check did not finish: connection refused/],
  ]) {
    const { made, writes } = session(bridge(reply));
    await made.checkContext('qwen3:14b');
    assert.match(made.getState().enduranceMessages['qwen3:14b'], message);
    assert.equal(made.getState().enduranceResults.length, 0);
    assert.equal(writes.length, 0);
  }
  // A bridge that throws is a failure, not a crash; a card that cannot be read is just no baseline.
  const thrown = session(bridge(() => { throw new Error('IPC closed'); }, { contention: async () => { throw new Error('no nvidia-smi'); } }));
  await thrown.made.checkContext('qwen3:14b');
  assert.match(thrown.made.getState().enduranceMessages['qwen3:14b'], /The check did not finish: IPC closed/);
  const blind = session(bridge(done, { contention: async () => { throw new Error('no nvidia-smi'); } }));
  await blind.made.checkContext('qwen3:14b');
  assert.equal(blind.made.getState().enduranceResults[0].baseline, null);
});

test('a program being open is not the card being busy, as in the command line; a reading that says busy is', () => {
  // The app calls the card busy when Steam is merely open, with nothing in the readings.
  const open = baselineFromContention({ level: 'busy', reasons: [], vramUsedPercent: 12, utilizationPercent: 18, message: 'Steam is open.' });
  assert.deepEqual(open, { level: 'clear', vramUsedPercent: 12, utilizationPercent: 18, message: '' });
  const busy = baselineFromContention({ level: 'busy', reasons: ['the graphics card is 62% busy'], vramUsedPercent: 49, utilizationPercent: 62, message: 'Before starting: the graphics card is 62% busy.' });
  assert.deepEqual([busy.level, busy.message], ['busy', 'Before starting: the graphics card is 62% busy.']);
  assert.equal(baselineFromContention({ level: 'unknown', reasons: [], vramUsedPercent: null, utilizationPercent: null, message: '' }).level, 'unknown');
});

test('saved checks are read back whole, a bad one is dropped, and each model keeps its newest', () => {
  const make = (model, completedAt) => assembleEnduranceResult(model, done, baseline, completedAt).result;
  const older = make('qwen3:14b', '2026-10-26T10:00:00.000Z');
  const newer = make('qwen3:14b', '2026-10-27T10:00:00.000Z');
  const other = make('llama3.2:3b', '2026-10-25T10:00:00.000Z');
  const parsed = parseEnduranceResults(JSON.parse(JSON.stringify([older, { nonsense: true }, other, newer, 'x', null])));
  assert.deepEqual(parsed.map((result) => result.completedAt), ['2026-10-27T10:00:00.000Z', '2026-10-25T10:00:00.000Z']);
  assert.deepEqual(parseEnduranceResults('not a list'), []);
  assert.equal(isEnduranceResult({ ...newer, stages: [] }), false);
  assert.equal(isEnduranceResult({ ...newer, verdict: null }), false);
  assert.equal(addEnduranceResult([older, other], newer).length, 2);
  assert.equal(addEnduranceResult([older, other], newer)[0], newer);
  const many = Array.from({ length: 20 }, (_, index) => make(`model-${index}`, `2026-10-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`));
  assert.equal(many.reduce((list, result) => addEnduranceResult(list, result), []).length, 12, 'the oldest go first');
});

test("the browser preview's stand-in answers like the runner and is stopped the same way", async () => {
  // The preview runs in a browser: its waits are window.setTimeout.
  globalThis.window = { setTimeout: (callback) => setTimeout(callback, 0) };
  const preview = createRigScoreDemo(() => ['llama3.2:3b'], 12);
  const { made } = session({ ...preview, getGpuContention: async () => cardReading });
  await made.checkContext('llama3.2:3b');
  const result = made.getState().enduranceResults[0];
  assert.equal(result.stamp.appVersion, 'preview');
  assert.equal(result.stages.length, 3);
  assert.equal(result.verdict.kind, 'holds');
  await made.checkContext('qwen3:14b');
  assert.match(made.getState().enduranceMessages['qwen3:14b'], /is not installed/);
});
