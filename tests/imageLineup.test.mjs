// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runImageLineup } from '../src/lib/imageLineup.ts';
import { judgeImageResult, runImageGeneration } from '../src/lib/imageGenRun.ts';
import { IMAGE_BENCHMARK_PROMPTS, customImagePrompt } from '../src/lib/imageGenScoring.ts';

/**
 * Several picture models on one prompt, side by side. These lock what makes
 * that a fair comparison rather than a list of separate runs: the same prompt
 * and seed for every model, a cold start for each when the person agreed, and
 * no checking until every model has drawn, so the checking model never sits on
 * the graphics card while another is being timed.
 */

const PROMPT = IMAGE_BENCHMARK_PROMPTS[0];
const IMAGE_REF = { filename: 'out.png', subfolder: '', type: 'output' };
const ENTRIES = [
  { checkpoint: 'sd15.safetensors', name: 'Stable Diffusion 1.5' },
  { checkpoint: 'sdxl-turbo.safetensors', name: 'SDXL Turbo' },
];

const nodes = (graph, type) => Object.values(graph).filter((entry) => entry.class_type === type);
const checkpointOf = (graph) => nodes(graph, 'CheckpointLoaderSimple')[0].inputs.ckpt_name;

/** A ComfyUI that draws whatever it is sent, logging what happened in order. */
function fakeComfy({ failOn = [] } = {}) {
  const events = [];
  const graphs = [];
  const sent = new Map();
  const transport = {
    free: async () => { events.push('free'); },
    submit: async (graph) => {
      const promptId = `p${graphs.length + 1}`;
      graphs.push(graph);
      sent.set(promptId, checkpointOf(graph));
      events.push(`draw ${checkpointOf(graph)}`);
      return { promptId };
    },
    history: async (promptId) => (failOn.includes(sent.get(promptId))
      ? {
        [promptId]: {
          outputs: {},
          status: {
            completed: false,
            status_str: 'error',
            messages: [['execution_error', { node_type: 'KSampler', exception_message: 'out of memory' }]],
          },
        },
      }
      : { [promptId]: { outputs: { 9: { images: [IMAGE_REF] } }, status: { completed: true, status_str: 'success' } } }),
    image: async () => 'data:image/png;base64,AAAA',
    interrupt: async () => { events.push('interrupt'); },
  };
  return { transport, events, graphs };
}

/** Clock that advances only when the run sleeps, so tests do not wait. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

const judgeInto = (events) => async () => { events.push('judge'); return 'Yes'; };

test('every model gets the same prompt and the same seed', async () => {
  const { transport, graphs } = fakeComfy();
  await runImageLineup({
    entries: ENTRIES, transport, imagePrompt: PROMPT, seed: 4242, unloadBetweenRuns: false, ...fakeClock(),
  });
  assert.equal(graphs.length, 2);
  for (const graph of graphs) {
    assert.equal(nodes(graph, 'KSampler')[0].inputs.seed, 4242);
    assert.ok(nodes(graph, 'CLIPTextEncode').some((node) => node.inputs.text === PROMPT.prompt));
  }
  // The checkpoint is the only thing that changes between them.
  assert.deepEqual(graphs.map(checkpointOf), ENTRIES.map((entry) => entry.checkpoint));
});

test('nothing is checked until every model has drawn', async () => {
  const { transport, events } = fakeComfy();
  const progress = [];
  await runImageLineup({
    entries: ENTRIES,
    transport,
    judge: judgeInto(events),
    imagePrompt: PROMPT,
    seed: 1,
    unloadBetweenRuns: false,
    onProgress: (step) => progress.push(`${step.phase} ${step.entry.name}`),
    ...fakeClock(),
  });
  assert.ok(events.indexOf('judge') > events.lastIndexOf(`draw ${ENTRIES[1].checkpoint}`), events.join(', '));
  assert.deepEqual(progress, [
    'rendering Stable Diffusion 1.5', 'done Stable Diffusion 1.5',
    'rendering SDXL Turbo', 'done SDXL Turbo',
    'judging Stable Diffusion 1.5', 'judged Stable Diffusion 1.5',
    'judging SDXL Turbo', 'judged SDXL Turbo',
  ]);
});

test('a picture checked afterwards scores exactly as one checked on the spot', async () => {
  const yes = async () => 'Yes';
  const inline = await runImageGeneration({
    transport: fakeComfy().transport, judge: yes, checkpoint: 'sd15.safetensors', imagePrompt: PROMPT, ...fakeClock(),
  });
  const drawn = await runImageGeneration({
    transport: fakeComfy().transport, checkpoint: 'sd15.safetensors', imagePrompt: PROMPT, ...fakeClock(),
  });
  assert.equal(drawn.judged, false);
  const later = await judgeImageResult(drawn, yes, PROMPT);
  for (const field of ['adherence', 'score', 'grade', 'judged', 'checks']) {
    assert.deepEqual(later[field], inline[field], field);
  }
});

test('ComfyUI is unloaded before every model when the person agreed, and never otherwise', async () => {
  const agreed = fakeComfy();
  await runImageLineup({
    entries: ENTRIES, transport: agreed.transport, imagePrompt: PROMPT, seed: 1, unloadBetweenRuns: true, ...fakeClock(),
  });
  assert.deepEqual(agreed.events, [
    'free', `draw ${ENTRIES[0].checkpoint}`,
    'free', `draw ${ENTRIES[1].checkpoint}`,
  ]);
  const shared = fakeComfy();
  await runImageLineup({
    entries: ENTRIES, transport: shared.transport, imagePrompt: PROMPT, seed: 1, unloadBetweenRuns: false, ...fakeClock(),
  });
  assert.ok(!shared.events.includes('free'));
});

test('a model that fails is recorded with its reason, and the rest carry on', async () => {
  const { transport, events } = fakeComfy({ failOn: [ENTRIES[0].checkpoint] });
  const outcomes = await runImageLineup({
    entries: ENTRIES, transport, judge: judgeInto(events), imagePrompt: PROMPT, seed: 1, unloadBetweenRuns: false, ...fakeClock(),
  });
  assert.match(outcomes[0].result.error, /out of memory/);
  assert.equal(outcomes[0].result.judged, false);
  // Only the picture that exists goes to the judge.
  assert.ok(outcomes[1].result.imageDataUrl);
  assert.equal(outcomes[1].result.judged, true);
});

test('Stop ends the comparison after the model in flight, and skips the checking', async () => {
  const { transport, events } = fakeComfy();
  const controller = new AbortController();
  const outcomes = await runImageLineup({
    entries: ENTRIES,
    transport,
    judge: judgeInto(events),
    imagePrompt: PROMPT,
    seed: 1,
    unloadBetweenRuns: false,
    signal: controller.signal,
    onProgress: (step) => { if (step.phase === 'done') controller.abort(); },
    ...fakeClock(),
  });
  assert.equal(outcomes.length, 1);
  assert.ok(!events.includes(`draw ${ENTRIES[1].checkpoint}`));
  assert.ok(!events.includes('judge'));
});

test('a prompt someone typed is drawn and timed, but never sent to the judge', async () => {
  const { transport, events } = fakeComfy();
  const phases = [];
  const outcomes = await runImageLineup({
    entries: ENTRIES,
    transport,
    judge: judgeInto(events),
    imagePrompt: customImagePrompt('a cat in a top hat'),
    seed: 1,
    unloadBetweenRuns: false,
    onProgress: (step) => phases.push(step.phase),
    ...fakeClock(),
  });
  assert.equal(outcomes.length, 2);
  assert.ok(!events.includes('judge'));
  assert.ok(!phases.includes('judging'));
});
