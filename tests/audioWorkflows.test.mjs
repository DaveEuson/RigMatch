// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AUDIO_CLIP_SECONDS, AUDIO_MODEL_SPECS, audioModelFileIds, audioModelSpec } from '../src/lib/audioCatalog.ts';
import { AUDIO_DECODE_NODE, AUDIO_SAVE_NODE, INSTRUMENTAL, buildAudioWorkflow } from '../src/lib/audioWorkflows.ts';
import { isAudioCheckpoint, isPictureCheckpoint } from '../src/lib/checkpointKinds.ts';
import { GENERATION_MODELS, generationModelById } from '../src/lib/generationCatalog.ts';
import { validateGraph } from './lib/comfyGraphValidator.mjs';

/**
 * Three audio models, three graph shapes, and one way to find out a graph is
 * wrong without these tests: download up to ten gigabytes, start ComfyUI and
 * read the error. So every graph is held to /object_info from a stock ComfyUI
 * build, and to the settings of the ComfyUI template it was ported from.
 */

const objectInfo = JSON.parse(readFileSync(new URL('./fixtures/object_info-comfyui-e5a38e3.json', import.meta.url), 'utf8'));
const RUN = { prompt: 'A calm solo acoustic guitar melody', seed: 1234567, seconds: AUDIO_CLIP_SECONDS };
const nodes = (graph, type) => Object.values(graph).filter((node) => node.class_type === type);
const sampling = ({ steps, cfg, sampler_name: sampler, scheduler }) => ({ steps, cfg, sampler, scheduler });
const samplerOf = (key, run = RUN) => nodes(buildAudioWorkflow(audioModelSpec(key), run), 'KSampler')[0].inputs;

test('every graph is one a stock ComfyUI of this build would accept, as RigMatch submits it', () => {
  for (const spec of AUDIO_MODEL_SPECS) {
    assert.deepEqual(validateGraph(buildAudioWorkflow(spec, RUN), objectInfo), [], `${spec.key} would be refused`);
  }
});

test('every node is one ComfyUI ships: nothing from a custom pack, nothing sent off the machine', () => {
  for (const spec of AUDIO_MODEL_SPECS) {
    for (const node of Object.values(buildAudioWorkflow(spec, RUN))) {
      const module = String(objectInfo[node.class_type]?.python_module ?? '');
      assert.ok(module === 'nodes' || module.startsWith('comfy_extras.'), `${spec.key} uses ${node.class_type} from ${module}`);
    }
  }
});

test('the prompt, the seed and the length land where each model reads them', () => {
  const run = { prompt: 'PROMPT-MARK', seed: 987654, seconds: 17 };
  for (const spec of AUDIO_MODEL_SPECS) {
    const graph = buildAudioWorkflow(spec, run);
    const read = Object.values(graph).flatMap((node) => [node.inputs.text, node.inputs.tags]);
    assert.ok(read.includes('PROMPT-MARK'), `${spec.key} never reads the prompt`);
    assert.equal(nodes(graph, 'KSampler')[0].inputs.seed, 987654, `${spec.key} samples from another seed`);
    const lengths = Object.values(graph)
      .flatMap((node) => [node.inputs.seconds, node.inputs.duration])
      .filter((value) => value !== undefined);
    assert.ok(lengths.length > 0 && lengths.every((value) => value === 17), `${spec.key} makes ${lengths.join(', ')} s`);
  }
  // ACE-Step 1.5 plans the music with a language model of its own, from the run's seed too.
  const planner = nodes(buildAudioWorkflow(audioModelSpec('ace-step-1.5-turbo'), run), 'TextEncodeAceStepAudio1.5')[0];
  assert.equal(planner.inputs.seed, 987654);
});

test('every model samples at its ComfyUI template’s settings', () => {
  assert.deepEqual(sampling(samplerOf('ace-step-1.5-turbo')), { steps: 8, cfg: 1, sampler: 'euler', scheduler: 'simple' });
  assert.deepEqual(sampling(samplerOf('ace-step-v1-3.5b')), { steps: 50, cfg: 5, sampler: 'euler', scheduler: 'simple' });
  assert.deepEqual(
    sampling(samplerOf('stable-audio-open-1.0')),
    { steps: 50, cfg: 4.98, sampler: 'dpmpp_3m_sde_gpu', scheduler: 'exponential' },
  );
  for (const spec of AUDIO_MODEL_SPECS) assert.equal(samplerOf(spec.key).steps, spec.steps, spec.key);
});

test('ACE-Step is asked for an instrumental, and given the tempo a prompt names', () => {
  const encoder = (key, type, run) => nodes(buildAudioWorkflow(audioModelSpec(key), run), type)[0].inputs;
  assert.equal(encoder('ace-step-1.5-turbo', 'TextEncodeAceStepAudio1.5', RUN).lyrics, INSTRUMENTAL);
  assert.equal(encoder('ace-step-1.5-turbo', 'TextEncodeAceStepAudio1.5', { ...RUN, bpm: 72 }).bpm, 72);
  assert.equal(encoder('ace-step-1.5-turbo', 'TextEncodeAceStepAudio1.5', RUN).bpm, 120, 'the node’s own default');
  assert.equal(encoder('ace-step-v1-3.5b', 'TextEncodeAceStepAudio', RUN).lyrics, INSTRUMENTAL);
});

test('every family decodes into one node and saves one MP3 from it, under RigMatch’s own name', () => {
  for (const spec of AUDIO_MODEL_SPECS) {
    const graph = buildAudioWorkflow(spec, RUN);
    assert.equal(graph[AUDIO_DECODE_NODE]?.class_type, 'VAEDecodeAudio', spec.key);
    assert.equal(graph[AUDIO_SAVE_NODE]?.class_type, 'SaveAudioMP3', spec.key);
    assert.deepEqual(graph[AUDIO_SAVE_NODE].inputs.audio, [AUDIO_DECODE_NODE, 0]);
    assert.match(graph[AUDIO_SAVE_NODE].inputs.filename_prefix, /^rigmatch\//);
    assert.equal(nodes(graph, 'SaveAudioMP3').length, 1, `${spec.key} saves more than one clip`);
  }
});

test('every file a graph loads is one RigMatch fetches, into the folder that node reads', () => {
  const READS = {
    CheckpointLoaderSimple: { ckpt_name: 'checkpoints' },
    CLIPLoader: { clip_name: 'text_encoders' },
  };
  const byFilename = new Map(GENERATION_MODELS.map((model) => [model.filename, model]));
  for (const spec of AUDIO_MODEL_SPECS) {
    const loaded = new Set();
    for (const [id, node] of Object.entries(buildAudioWorkflow(spec, RUN))) {
      for (const [input, folder] of Object.entries(READS[node.class_type] ?? {})) {
        const entry = byFilename.get(node.inputs[input]);
        assert.ok(entry, `${spec.key} node ${id} loads ${node.inputs[input]}, which RigMatch cannot fetch`);
        assert.equal(entry.folder, folder,
          `${spec.key}: ${entry.filename} downloads to ${entry.folder}/ but ${node.class_type} reads ${folder}/`);
        loaded.add(entry.id);
      }
    }
    assert.deepEqual([...loaded].sort(), audioModelFileIds(spec).sort(), `${spec.key}: what it downloads is not what its graph loads`);
  }
});

test('each audio model’s main file declares every other file it cannot run without', () => {
  for (const spec of AUDIO_MODEL_SPECS) {
    const main = generationModelById(spec.key);
    assert.ok(main, `${spec.key} has no file entry`);
    assert.equal(main.kind, 'audio');
    assert.deepEqual(
      [...(main.requires ?? [])].sort(),
      audioModelFileIds(spec).filter((id) => id !== spec.key).sort(),
      `${spec.key} would download a partial set`,
    );
  }
});

test('every audio file is checked by its SHA-256 and named as its URL names it', () => {
  for (const id of new Set(AUDIO_MODEL_SPECS.flatMap(audioModelFileIds))) {
    const file = generationModelById(id);
    assert.match(file.sha256 ?? '', /^[0-9a-f]{64}$/, `${id} could only be checked by size`);
    assert.match(file.url, /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/main\//, id);
    assert.ok(file.url.endsWith(`/${file.filename}`), `${id} downloads a file named differently from the one it lists`);
  }
});

test('an audio checkpoint is never offered to the Image Lab as a picture model', () => {
  for (const model of GENERATION_MODELS.filter((m) => m.kind === 'audio')) {
    assert.ok(isAudioCheckpoint(model.filename), `${model.filename} is not recognized as audio`);
    assert.ok(!isPictureCheckpoint(model.filename), `${model.filename} would be offered as a picture model`);
  }
  for (const model of GENERATION_MODELS.filter((m) => m.kind === 'video' && m.folder === 'checkpoints')) {
    assert.ok(!isPictureCheckpoint(model.filename), `${model.filename} would be offered as a picture model`);
  }
  for (const model of GENERATION_MODELS.filter((m) => m.kind === 'image')) {
    assert.ok(isPictureCheckpoint(model.filename), `${model.filename} would be hidden from the Image Lab`);
  }
  // "ace" inside a word is not ACE-Step.
  assert.ok(isPictureCheckpoint('surface_steps_xl.safetensors'));
});
