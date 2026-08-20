// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };

const { comfyBusyCount } = await import('../src/lib/videoGen.ts');
const { comfyQueueDepth, describeComfyBusy } = await import('../src/lib/comfyTransport.ts');
const { agentArcadeApi } = await import('../src/api.ts');

/** Point the bridge at a ComfyUI with the given queue depth. */
function withQueue(remaining) {
  agentArcadeApi.getComfyStatus = async () => ({
    reachable: true, checkpoints: [], textEncoders: [],
    execInfo: remaining === null ? null : { exec_info: { queue_remaining: remaining } },
  });
}

test('an idle ComfyUI does not block a run', async () => {
  withQueue(0);
  assert.equal(await comfyQueueDepth(), 0);
  assert.equal(await describeComfyBusy(), null);
});

test('a busy ComfyUI produces a message that says why, not just "busy"', async () => {
  // Queuing behind a render does not fail — both jobs then share one GPU and
  // the time describes neither. The refusal has to explain that, or it reads
  // as RigMatch being broken.
  withQueue(2);
  const message = await describeComfyBusy();
  assert.match(message, /already working on 2 jobs/);
  assert.match(message, /measure the queue rather than this computer/);
});

test('one job is singular', async () => {
  withQueue(1);
  assert.match(await describeComfyBusy(), /1 job\./);
});

test('an unreadable queue counts as idle rather than blocking every run', async () => {
  // Failing to ask must not become a reason never to run.
  withQueue(null);
  assert.equal(await describeComfyBusy(), null);

  agentArcadeApi.getComfyStatus = async () => { throw new Error('bridge down'); };
  assert.equal(await comfyQueueDepth(), 0);
  assert.equal(await describeComfyBusy(), null);
});

test('a build with no bridge does not block on a question it cannot ask', async () => {
  const saved = agentArcadeApi.getComfyStatus;
  agentArcadeApi.getComfyStatus = undefined;
  assert.equal(await comfyQueueDepth(), 0);
  agentArcadeApi.getComfyStatus = saved;
});

test('comfyBusyCount reads the shape ComfyUI actually returns', async () => {
  // GET /prompt answers {"exec_info": {"queue_remaining": 0}} — verified live.
  assert.equal(comfyBusyCount({ exec_info: { queue_remaining: 3 } }), 3);
});
