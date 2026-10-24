import test from 'node:test';
import assert from 'node:assert/strict';

const { createRigSession } = await import('../src/lib/rigScoreSession.ts');
const { RIG_TIERS } = await import('../src/lib/rigScore.ts');

const tier = (id) => RIG_TIERS.find((entry) => entry.id === id);
const timed = (decodeTps) => ({ promptEvalCount: 1486, promptEvalSeconds: 0.5, evalCount: 256, evalSeconds: 256 / decodeTps, loadSeconds: 0.02 });
const done = { status: 'done', runs: [timed(150), timed(151), timed(149)], coldLoadSeconds: 1, gpuShare: 1, machine: { appVersion: '0.9.9' } };

/** A bridge whose answers are scripted per tier, recording what it was asked. */
function bridge(answers) {
  const asked = [];
  const canceled = [];
  let progress = null;
  return {
    asked,
    canceled,
    emit: (update) => progress?.(update),
    runRigScore: async (request) => {
      asked.push(request);
      const answer = answers[request.tier];
      return typeof answer === 'function' ? answer(request) : answer;
    },
    cancelRigScore: async (progressId) => { canceled.push(progressId); },
    onRigScoreProgress: (callback) => { progress = callback; return () => { progress = null; }; },
  };
}

const session = (fake, saved = []) => {
  const writes = [];
  const made = createRigSession(fake, {
    loadHistory: () => saved,
    saveHistory: (history) => { writes.push(history); return true; },
    now: () => '2026-10-24T21:00:00.000Z',
  });
  return { made, writes };
};

test('a run of several tiers saves each result and says why the others have none', async () => {
  const fake = bridge({ light: done, standard: { status: 'not-installed' }, heavy: done });
  const { made, writes } = session(fake);
  await made.runTiers([tier('light'), tier('standard'), tier('heavy')]);
  const state = made.getState();
  assert.deepEqual(fake.asked.map((request) => request.tier), ['light', 'standard', 'heavy'], 'a missing model does not stop the rest');
  assert.deepEqual(state.history.map((result) => result.tier).sort(), ['heavy', 'light']);
  assert.match(state.messages.standard, /qwen3:8b is not installed/);
  assert.equal(state.running, null);
  assert.equal(writes.length, 2);
});

test('a busy card or Stop ends the queue: the next tier would meet the same card', async () => {
  const busy = bridge({ light: { status: 'busy', loadedModels: ['mistral:7b'] }, standard: done });
  const first = session(busy).made;
  await first.runTiers([tier('light'), tier('standard')]);
  assert.deepEqual(busy.asked.map((request) => request.tier), ['light']);
  assert.match(first.getState().messages.light, /mistral:7b/);

  let release;
  const stopped = bridge({
    light: (request) => new Promise((resolve) => { release = () => resolve({ status: 'stopped' }); stopped.emit({ id: request.progressId, phase: 'run', run: 1, of: 3 }); }),
    standard: done,
  });
  const second = session(stopped).made;
  const running = second.runTiers([tier('light'), tier('standard')]);
  await new Promise((resolve) => setImmediate(resolve));
  const live = second.getState();
  assert.equal(live.running.tier, 'light');
  assert.deepEqual(live.running.queued, ['standard']);
  assert.deepEqual(live.progress, { id: live.running.progressId, phase: 'run', run: 1, of: 3 }, 'progress for the running tier is shown');
  second.stop();
  assert.deepEqual(stopped.canceled, [live.running.progressId], 'Stop names the run it stops');
  release();
  await running;
  assert.deepEqual(stopped.asked.map((request) => request.tier), ['light']);
  assert.equal(second.getState().history.length, 0, 'a stopped tier saves nothing');
  assert.match(second.getState().messages.light, /Stopped/);
});

test('progress from a run that is not this one is ignored', async () => {
  let release;
  const fake = bridge({ light: () => new Promise((resolve) => { release = () => resolve(done); }) });
  const { made } = session(fake);
  const running = made.runTiers([tier('light')]);
  await new Promise((resolve) => setImmediate(resolve));
  fake.emit({ id: 'someone-else', phase: 'run', run: 3, of: 3 });
  assert.equal(made.getState().progress, null);
  release();
  await running;
});

test('a second run while one is going is refused, and an error from the bridge is a failure in words', async () => {
  let release;
  const fake = bridge({
    light: () => new Promise((resolve) => { release = () => resolve(done); }),
    standard: () => { throw new Error("Error invoking remote method 'rigscore:run': Error: A test is running."); },
  });
  const { made } = session(fake);
  const first = made.runTiers([tier('light')]);
  await made.runTiers([tier('light')]);
  assert.equal(fake.asked.length, 1);
  release();
  await first;
  await made.runTiers([tier('standard')]);
  assert.equal(made.getState().messages.standard, 'The test did not finish: A test is running.');
});

test('a result that could not be saved is said so, and kept until the app closes', async () => {
  const fake = bridge({ light: done });
  const made = createRigSession(fake, { loadHistory: () => [], saveHistory: () => false, now: () => '2026-10-24T21:00:00.000Z' });
  await made.runTiers([tier('light')]);
  assert.equal(made.getState().saveFailed, true);
  assert.equal(made.getState().history.length, 1);
});

test('subscribers hear every change, and stop hearing when they leave', async () => {
  const { made } = session(bridge({ light: done }));
  let heard = 0;
  const leave = made.subscribe(() => { heard += 1; });
  await made.runTiers([tier('light')]);
  assert.ok(heard >= 3);
  const before = heard;
  leave();
  await made.runTiers([tier('light')]);
  assert.equal(heard, before);
});
