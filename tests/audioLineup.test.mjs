// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { AUDIO_CLIP_SECONDS, audioModelSpec } from '../src/lib/audioCatalog.ts';
import { listenerCandidates, toAudioLabResult } from '../src/lib/audioGenChallenge.ts';
import { judgeAudioResult, runAudioGeneration } from '../src/lib/audioGenRun.ts';
import { AUDIO_BENCHMARK_PROMPTS } from '../src/lib/audioGenScoring.ts';
import { installedAudioEntries, runAudioLineup } from '../src/lib/audioLineup.ts';
import { buildAudioWorkflow } from '../src/lib/audioWorkflows.ts';
import { extractAudio } from '../src/lib/comfyui.ts';
import { customImagePrompt } from '../src/lib/imageGenScoring.ts';

/**
 * Several audio models on one prompt, or one on its own. These lock what makes
 * that a fair comparison rather than a list of separate runs — the same prompt,
 * seed and length for every model, a cold start for each when the person
 * agreed, and no listening until every model has made its clip — and what makes
 * a clip count: it has to exist, and it has to make a sound.
 */

const PROMPT = AUDIO_BENCHMARK_PROMPTS.find((prompt) => prompt.id === 'dance');
const ENTRIES = [
  { key: 'ace-step-1.5-turbo', name: 'ACE-Step 1.5 Turbo' },
  { key: 'stable-audio-open-1.0', name: 'Stable Audio Open 1.0' },
];
const ACE = 'ace_step_1.5_turbo_aio.safetensors';
const STABLE = 'stable-audio-open-1.0.safetensors';

const nodes = (graph, type) => Object.values(graph).filter((node) => node.class_type === type);
const checkpointOf = (graph) => nodes(graph, 'CheckpointLoaderSimple')[0].inputs.ckpt_name;

/** A ComfyUI that makes whatever it is sent, logging what happened, in order. */
function fakeComfy({ failOn = [], noAudioOn = [] } = {}) {
  const events = [];
  const graphs = [];
  const sent = new Map();
  const transport = {
    free: async () => { events.push('free'); },
    submit: async (graph) => {
      const promptId = `p${graphs.length + 1}`;
      graphs.push(graph);
      sent.set(promptId, checkpointOf(graph));
      events.push(`make ${checkpointOf(graph)}`);
      return { promptId };
    },
    history: async (promptId) => {
      const checkpoint = sent.get(promptId);
      if (failOn.includes(checkpoint)) {
        return {
          [promptId]: {
            outputs: {},
            status: {
              completed: false,
              status_str: 'error',
              messages: [['execution_error', { node_type: 'KSampler', exception_message: 'out of memory' }]],
            },
          },
        };
      }
      const outputs = noAudioOn.includes(checkpoint)
        ? {}
        : { save: { audio: [{ filename: `${checkpoint}_00001_.mp3`, subfolder: 'rigmatch', type: 'output' }] } };
      return { [promptId]: { outputs, status: { completed: true, status_str: 'success' } } };
    },
    image: async () => 'data:audio/mpeg;base64,SUQzBAA=',
    interrupt: async () => { events.push('interrupt'); },
  };
  return { transport, events, graphs };
}

/** Decodes anything to a tone this loud, so no browser is needed. */
const decoder = (peak = 0.5, seconds = 2) => async () => {
  const samples = new Float32Array(16000 * seconds);
  for (let i = 0; i < samples.length; i += 1) samples[i] = peak * Math.sin(i / 8);
  return { sampleRate: 16000, channels: [samples] };
};

/** Clock that advances only when the run sleeps, so tests do not wait. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

const listenInto = (events, answer = 'Yes') => async () => { events.push('listen'); return answer; };

const lineup = (overrides) => runAudioLineup({
  entries: ENTRIES,
  audioPrompt: PROMPT,
  seed: 4242,
  unloadBetweenRuns: false,
  decode: decoder(),
  ...fakeClock(),
  ...overrides,
});

test('every model gets the same prompt, seed and length', async () => {
  const { transport, graphs } = fakeComfy();
  await lineup({ transport });
  assert.equal(graphs.length, 2);
  for (const graph of graphs) {
    assert.equal(nodes(graph, 'KSampler')[0].inputs.seed, 4242);
    assert.ok(Object.values(graph).some((node) => node.inputs.tags === PROMPT.prompt || node.inputs.text === PROMPT.prompt));
    const lengths = Object.values(graph)
      .flatMap((node) => [node.inputs.seconds, node.inputs.duration])
      .filter((value) => value !== undefined);
    assert.ok(lengths.every((value) => value === AUDIO_CLIP_SECONDS), JSON.stringify(lengths));
  }
  // The model is the only thing that changes between them.
  assert.deepEqual(graphs.map(checkpointOf), [ACE, STABLE]);
});

test('nothing is listened to until every model has made its clip', async () => {
  const { transport, events } = fakeComfy();
  const progress = [];
  await lineup({
    transport,
    listen: listenInto(events),
    onProgress: (step) => progress.push(`${step.phase} ${step.entry.name}`),
  });
  assert.ok(events.indexOf('listen') > events.lastIndexOf(`make ${STABLE}`), events.join(', '));
  assert.deepEqual(progress, [
    'rendering ACE-Step 1.5 Turbo', 'done ACE-Step 1.5 Turbo',
    'rendering Stable Audio Open 1.0', 'done Stable Audio Open 1.0',
    'judging ACE-Step 1.5 Turbo', 'judged ACE-Step 1.5 Turbo',
    'judging Stable Audio Open 1.0', 'judged Stable Audio Open 1.0',
  ]);
});

test('the listener hears each clip the way the listening test sends audio: a 16 kHz mono WAV', async () => {
  const heard = [];
  await lineup({
    transport: fakeComfy().transport,
    listen: async (wav, question) => { heard.push({ wav, question }); return 'No'; },
  });
  assert.equal(heard.length, ENTRIES.length * PROMPT.propositions.length);
  const wav = Buffer.from(heard[0].wav, 'base64');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1, 'mono');
  assert.equal(wav.readUInt32LE(24), 16000, '16 kHz');
  assert.match(heard[0].question, /Answer with only the word Yes or the word No/);
});

test('a clip checked afterwards scores exactly as one checked on the spot', async () => {
  const yes = async () => 'Yes';
  const spec = audioModelSpec('stable-audio-open-1.0');
  const base = {
    graph: buildAudioWorkflow(spec, { prompt: PROMPT.prompt, seed: 1, seconds: AUDIO_CLIP_SECONDS }),
    model: spec.name,
    seconds: AUDIO_CLIP_SECONDS,
    audioPrompt: PROMPT,
    decode: decoder(),
  };
  const inline = await runAudioGeneration({ ...base, transport: fakeComfy().transport, listen: yes, ...fakeClock() });
  const made = await runAudioGeneration({ ...base, transport: fakeComfy().transport, ...fakeClock() });
  assert.equal(made.judged, false);
  const later = await judgeAudioResult(made, yes, PROMPT);
  for (const field of ['adherence', 'score', 'grade', 'judged', 'checks']) {
    assert.deepEqual(later[field], inline[field], field);
  }
});

test('ComfyUI is unloaded before every model, and before listening, only when the person agreed', async () => {
  const agreed = fakeComfy();
  await lineup({ transport: agreed.transport, unloadBetweenRuns: true, listen: listenInto(agreed.events) });
  assert.deepEqual(agreed.events, [
    'free', `make ${ACE}`,
    'free', `make ${STABLE}`,
    // The listener needs the card the last model is still sitting on.
    'free',
    ...Array(ENTRIES.length * PROMPT.propositions.length).fill('listen'),
  ]);
  const shared = fakeComfy();
  await lineup({ transport: shared.transport, unloadBetweenRuns: false, listen: listenInto(shared.events) });
  assert.ok(!shared.events.includes('free'));
});

test('a model that fails is recorded with its reason, and the rest carry on', async () => {
  const { transport, events } = fakeComfy({ failOn: [ACE] });
  const outcomes = await lineup({ transport, listen: listenInto(events) });
  assert.match(outcomes[0].result.error, /out of memory/);
  assert.equal(outcomes[0].result.judged, false);
  // Only the clip that exists goes to the listener.
  assert.ok(outcomes[1].result.audioRef);
  assert.equal(outcomes[1].result.judged, true);
  assert.equal(events.filter((event) => event === 'listen').length, PROMPT.propositions.length);
});

test('a run that saves no audio, or saves silence, is a failure and never a quiet success', async () => {
  const empty = await lineup({ transport: fakeComfy({ noAudioOn: [ACE] }).transport });
  assert.match(empty[0].result.error, /produced no audio/);
  assert.equal(empty[0].result.score, 0);
  assert.equal(empty[1].result.error, undefined);

  const silent = await lineup({ transport: fakeComfy().transport, decode: decoder(0) });
  for (const outcome of silent) {
    assert.match(outcome.result.error, /silent/);
    assert.equal(outcome.result.score, 0);
    // Kept, so the silence can be played and heard for what it is.
    assert.ok(outcome.result.audioRef);
  }
});

test('a clip that cannot be read back says so rather than scoring', async () => {
  const outcomes = await lineup({
    transport: fakeComfy().transport,
    decode: async () => { throw new Error('Unable to decode audio data'); },
  });
  assert.match(outcomes[0].result.error, /could not be read back: Unable to decode audio data/);
  assert.equal(outcomes[0].result.score, 0);
});

test('Stop ends the comparison after the model in flight, and skips the listening', async () => {
  const { transport, events } = fakeComfy();
  const controller = new AbortController();
  const outcomes = await lineup({
    transport,
    listen: listenInto(events),
    signal: controller.signal,
    onProgress: (step) => { if (step.phase === 'done') controller.abort(); },
  });
  assert.equal(outcomes.length, 1);
  assert.ok(!events.includes(`make ${STABLE}`));
  assert.ok(!events.includes('listen'));
});

test('a prompt someone typed is made and timed, but never sent to the listener', async () => {
  const { transport, events, graphs } = fakeComfy();
  const phases = [];
  const outcomes = await lineup({
    transport,
    listen: listenInto(events),
    audioPrompt: customImagePrompt('birdsong at dawn'),
    onProgress: (step) => phases.push(step.phase),
  });
  assert.equal(outcomes.length, 2);
  assert.ok(graphs.every((graph) => Object.values(graph).some((node) => node.inputs.tags === 'birdsong at dawn'
    || node.inputs.text === 'birdsong at dawn')));
  assert.ok(!events.includes('listen'));
  assert.ok(!phases.includes('judging'));
});

test('a listener that cannot answer leaves the clip unjudged, not wrong', async () => {
  const outcomes = await lineup({
    transport: fakeComfy().transport,
    listen: async () => { throw new Error('Failed to load image or audio file'); },
  });
  for (const outcome of outcomes) {
    assert.equal(outcome.result.adherence, null);
    assert.equal(outcome.result.judged, false);
    assert.equal(outcome.result.error, undefined);
  }
});

test('a clip is scored on the length it turned out to be', async () => {
  const [outcome] = await lineup({ transport: fakeComfy().transport, entries: [ENTRIES[0]], decode: decoder(0.5, 3) });
  assert.ok(Math.abs(outcome.result.seconds - 3) < 0.01, String(outcome.result.seconds));
});

test('audio is read from where ComfyUI’s audio save nodes report it', () => {
  const history = {
    p1: {
      outputs: {
        save: { audio: [{ filename: 'a_00001_.mp3', subfolder: 'rigmatch', type: 'output' }] },
        preview: { images: [{ filename: 'x.png', subfolder: '', type: 'temp' }] },
      },
    },
  };
  assert.deepEqual(extractAudio(history, 'p1'), [{ filename: 'a_00001_.mp3', subfolder: 'rigmatch', type: 'output' }]);
  assert.deepEqual(extractAudio({}, 'p1'), []);
});

test('only a model whose every file ComfyUI lists can run here', () => {
  assert.deepEqual(installedAudioEntries({}), []);
  // Stable Audio without the encoder that reads its prompt makes nothing.
  assert.deepEqual(installedAudioEntries({ checkpoints: [STABLE] }), []);
  assert.deepEqual(
    installedAudioEntries({
      checkpoints: ['Stable-Audio-Open-1.0.safetensors', 'ace_step_v1_3.5b.safetensors'],
      text_encoders: ['t5-base.safetensors'],
    }).map((entry) => entry.key),
    ['ace-step-v1-3.5b', 'stable-audio-open-1.0'],
  );
});

test('only a model on this machine that can hear is asked to listen', () => {
  const models = [
    { name: 'gemma3:4b', capabilities: ['completion', 'vision'] },
    { name: 'gemma4:e2b', capabilities: ['completion', 'vision', 'audio'] },
    { displayName: 'gemma4:e4b', installed: false, capabilities: ['completion', 'audio'] },
  ];
  assert.deepEqual(listenerCandidates(models), ['gemma4:e2b']);
});

test('a saved result keeps where the clip is, never the clip itself', async () => {
  const [outcome] = await lineup({ transport: fakeComfy().transport, entries: [ENTRIES[0]] });
  const saved = toAudioLabResult(outcome.result, PROMPT, { lineupId: 'audio-1', balance: 40 });
  assert.equal(saved.challenge, 'audio-generation');
  assert.equal(saved.model, 'ACE-Step 1.5 Turbo');
  assert.equal(saved.response, PROMPT.prompt);
  assert.deepEqual(saved.audioRef, outcome.result.audioRef);
  assert.equal(saved.lineupId, 'audio-1');
  assert.equal(saved.balance, 40);
  assert.ok(!('clip' in saved));
  assert.ok(!JSON.stringify(saved).includes(outcome.result.clip.base64.slice(0, 64)), 'the clip itself was saved');
});
