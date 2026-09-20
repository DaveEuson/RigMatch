// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { VIDEO_MODEL_SPECS, videoModelFileIds, videoModelSpec } from '../src/lib/videoCatalog.ts';
import {
  VIDEO_DECODE_NODE,
  buildVideoWorkflow,
  withJudgedFrame,
} from '../src/lib/videoWorkflows.ts';
import { buildTxt2VideoWorkflow, isVideoCheckpoint } from '../src/lib/videoGen.ts';
import { GENERATION_MODELS, generationModelById } from '../src/lib/generationCatalog.ts';
import { validateGraph } from './lib/comfyGraphValidator.mjs';

/**
 * Seventeen video models, ten graph shapes, and one way to find out a graph is
 * wrong without these tests: download up to 56 GB, start ComfyUI cold, and
 * read the error. So every graph is checked two ways here. It must reproduce
 * the graph videobench exported and ran, and it must pass /object_info from the
 * ComfyUI build those graphs were validated against — using only the nodes a
 * stock ComfyUI has, and none that send work off the machine.
 */

const catalog = JSON.parse(readFileSync(new URL('./fixtures/rigmatch-video-catalog.json', import.meta.url), 'utf8'));
const objectInfo = JSON.parse(readFileSync(new URL('./fixtures/object_info-comfyui-e5a38e3.json', import.meta.url), 'utf8'));

/** The export's placeholders: building with these must give back the export. */
const EXPORTED = { prompt: '__PROMPT__', seed: 24 };
const exportedGraph = (key) => catalog.models.find((m) => m.key === key).workflow;
const REAL_SHA256 = /^[0-9a-f]{64}$/;

test('every catalog model has a spec, and nothing else does', () => {
  assert.deepEqual(
    VIDEO_MODEL_SPECS.map((spec) => spec.key).sort(),
    catalog.models.map((model) => model.key).sort(),
  );
});

for (const model of catalog.models) {
  test(`${model.key}: the builder reproduces the exported graph exactly`, () => {
    assert.deepStrictEqual(buildVideoWorkflow(videoModelSpec(model.key), EXPORTED), model.workflow);
  });
}

test('every graph is one a stock ComfyUI of this build would accept, as RigMatch submits it', () => {
  for (const spec of VIDEO_MODEL_SPECS) {
    const graph = withJudgedFrame(
      buildVideoWorkflow(spec, { prompt: 'A corgi riding a skateboard', seed: 1234567 }),
      spec.output.frames,
    );
    assert.deepEqual(validateGraph(graph, objectInfo), [], `${spec.key} would be refused`);
  }
});

test('the LTX checkpoint graph RigMatch already ships passes the same check', () => {
  const graph = buildTxt2VideoWorkflow({
    checkpoint: 'ltxv-2b-distilled.safetensors',
    textEncoder: 't5xxl_fp8_e4m3fn.safetensors',
    prompt: 'a lighthouse',
  });
  assert.deepEqual(validateGraph(graph, objectInfo), []);
});

test('the run\'s prompt and seed land exactly where the export put its placeholders', () => {
  const run = { prompt: 'PROMPT-MARK', seed: 987654 };
  for (const spec of VIDEO_MODEL_SPECS) {
    const built = buildVideoWorkflow(spec, run);
    for (const [id, exported] of Object.entries(exportedGraph(spec.key))) {
      for (const [input, value] of Object.entries(exported.inputs)) {
        const actual = built[id].inputs[input];
        if (value === '__PROMPT__') assert.equal(actual, 'PROMPT-MARK', `${spec.key} ${id}.${input}`);
        else if ((input === 'seed' || input === 'noise_seed') && value === 24) {
          assert.equal(actual, 987654, `${spec.key} ${id}.${input}`);
        } else if (input === 'seed' || input === 'noise_seed') {
          // Wan 2.2's second expert adds no noise, so its seed is a fixed 0.
          assert.equal(actual, value, `${spec.key} ${id}.${input} should not follow the run's seed`);
        }
      }
    }
  }
});

test('every family decodes into the node the judged frame is taken from', () => {
  for (const spec of VIDEO_MODEL_SPECS) {
    const decode = buildVideoWorkflow(spec, EXPORTED)[VIDEO_DECODE_NODE];
    assert.match(decode?.class_type ?? '', /^VAEDecode/, `${spec.key} decodes elsewhere`);
  }
});

test('the judged frame is added beside the graph, never into it', () => {
  const spec = videoModelSpec('wan-2.1-1.3b');
  const graph = buildVideoWorkflow(spec, EXPORTED);
  const judged = withJudgedFrame(graph, spec.output.frames);
  for (const [id, node] of Object.entries(graph)) assert.deepEqual(judged[id], node);
  const frame = Object.values(judged).find((node) => node.class_type === 'ImageFromBatch');
  assert.deepEqual(frame.inputs.image, [VIDEO_DECODE_NODE, 0]);
  assert.equal(frame.inputs.batch_index, 40, '81 frames, so the middle is 40');
});

test('every file a graph loads is one RigMatch fetches, into the folder that node reads', () => {
  // Which folder each loader input reads. A Wan model in checkpoints/ is the bug
  // this exists for: downloaded, listed, and loadable by nothing.
  const READS = {
    UNETLoader: { unet_name: 'diffusion_models' },
    CheckpointLoaderSimple: { ckpt_name: 'checkpoints' },
    CLIPLoader: { clip_name: 'text_encoders' },
    DualCLIPLoader: { clip_name1: 'text_encoders', clip_name2: 'text_encoders' },
    VAELoader: { vae_name: 'vae' },
    LoraLoaderModelOnly: { lora_name: 'loras' },
    LTXAVTextEncoderLoader: { text_encoder: 'text_encoders', ckpt_name: 'checkpoints' },
    LTXVAudioVAELoader: { ckpt_name: 'checkpoints' },
  };
  const byFilename = new Map(GENERATION_MODELS.map((model) => [model.filename, model]));
  for (const spec of VIDEO_MODEL_SPECS) {
    const loaded = new Set();
    for (const [id, node] of Object.entries(buildVideoWorkflow(spec, EXPORTED))) {
      for (const [input, folder] of Object.entries(READS[node.class_type] ?? {})) {
        const entry = byFilename.get(node.inputs[input]);
        assert.ok(entry, `${spec.key} node ${id} loads ${node.inputs[input]}, which RigMatch cannot fetch`);
        assert.equal(entry.folder, folder,
          `${spec.key}: ${entry.filename} downloads to ${entry.folder}/ but ${node.class_type} reads ${folder}/`);
        loaded.add(entry.id);
      }
    }
    assert.deepEqual([...loaded].sort(), videoModelFileIds(spec).sort(),
      `${spec.key}: what it downloads is not what its graph loads`);
  }
});

test('each model\'s main file declares every other file it cannot run without', () => {
  for (const spec of VIDEO_MODEL_SPECS) {
    const main = generationModelById(spec.key);
    assert.ok(main, `${spec.key} has no file entry`);
    assert.equal(main.kind, 'video');
    assert.deepEqual(
      [...(main.requires ?? [])].sort(),
      videoModelFileIds(spec).filter((id) => id !== spec.key).sort(),
      `${spec.key} would download a partial set`,
    );
  }
});

test('the catalog\'s numbers are the export\'s numbers', () => {
  for (const model of catalog.models) {
    const spec = videoModelSpec(model.key);
    assert.deepEqual(spec.output, model.output, model.key);
    assert.equal(spec.ditGb, model.dit_gb, model.key);
    assert.equal(spec.teGb, model.te_gb, model.key);
    assert.equal(spec.refSeconds, model.ref_seconds_rtx4070, model.key);
    assert.equal(spec.refMeasured, model.ref_measured, model.key);
    assert.equal(Boolean(spec.gated), Boolean(model.gated), model.key);
    for (const f of model.files) {
      const entry = GENERATION_MODELS.find((m) => m.filename === f.filename);
      assert.ok(entry, `${f.filename} is missing`);
      assert.deepEqual(
        { folder: entry.folder, url: entry.url, bytes: entry.bytes, sha256: entry.sha256 },
        // A gated repository hides its tree without a token, and the export
        // wrote asterisks where the hash would be. No hash beats a fake one.
        { folder: f.folder, url: f.url, bytes: f.bytes, sha256: REAL_SHA256.test(f.sha256) ? f.sha256 : undefined },
        f.filename,
      );
    }
  }
});

test('every lineup file carries a checksum, except the four a gated repository would not show', () => {
  // These four can only be checked by size. That is weaker, and worth knowing
  // rather than papering over with a hash nobody could compute.
  const lineupFiles = new Set(VIDEO_MODEL_SPECS.flatMap(videoModelFileIds));
  const unhashed = GENERATION_MODELS.filter((m) => lineupFiles.has(m.id) && !m.sha256).map((m) => m.id).sort();
  assert.deepEqual(unhashed, ['gemma4-12b-ltx25', 'ltx-2.5', 'vae-ltx25-audio', 'vae-ltx25-video']);
});

test('a video checkpoint in the catalog is never offered to the Image Lab as a picture model', () => {
  // LTX-2 and LTX-2.3 are checkpoints named ltx-2-… and ltx-2.3-…, which the
  // name rule did not recognize, so the Image Lab would have run them.
  for (const model of GENERATION_MODELS.filter((m) => m.kind === 'video' && m.folder === 'checkpoints')) {
    assert.ok(isVideoCheckpoint(model.filename), `${model.filename} would be offered as an image model`);
  }
});

test('a file the snapshot machine did not have is still a valid choice', () => {
  // The snapshot's file pickers list one machine's disk. Treating them as the
  // full set would reject every model that machine had not downloaded.
  const graph = structuredClone(buildVideoWorkflow(videoModelSpec('ltxv-2b'), EXPORTED));
  graph['1'].inputs.unet_name = 'a-model-that-machine-never-had.safetensors';
  graph['5'].inputs.vae_name = 'another-vae.safetensors';
  assert.deepEqual(validateGraph(graph, objectInfo), []);
});

test('the validator catches every kind of mistake it claims to', () => {
  // Without this the tests above could pass against a validator that accepts
  // anything.
  const good = buildVideoWorkflow(videoModelSpec('ltxv-2b'), EXPORTED);
  assert.deepEqual(validateGraph(good, objectInfo), []);
  const apiNode = Object.entries(objectInfo)
    .find(([, def]) => String(def.python_module).startsWith('comfy_api_nodes'))[0];
  const spoilers = [
    ['a class ComfyUI does not have', (g) => { g['1'].class_type = 'NotARealNode'; }, /no such node class/],
    ['a custom node, though this snapshot has it', (g) => {
      g['1'] = { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'ltxv-2b.gguf' } };
    }, /custom node \(ComfyUI-GGUF\)/],
    ['a node that sends the work off the machine', (g) => {
      g.api = { class_type: apiNode, inputs: {} };
    }, /off this machine/],
    ['a missing required input', (g) => { delete g['8'].inputs.steps; }, /missing required input "steps"/],
    ['an input the node does not have', (g) => { g['8'].inputs.stepz = 8; }, /no input called "stepz"/],
    ['a link of the wrong type', (g) => { g['8'].inputs.model = ['6', 0]; }, /wants MODEL/],
    ['a link to a node that is not there', (g) => { g['8'].inputs.model = ['nope', 0]; }, /not in the graph/],
    ['an output the node does not have', (g) => { g['8'].inputs.model = ['1', 3]; }, /which has 1/],
    ['a setting that is not on the list', (g) => { g['8'].inputs.sampler_name = 'eulr'; }, /is not one of/],
    ['a literal where a link belongs', (g) => { g['8'].inputs.model = 'model.safetensors'; }, /wants a MODEL link/],
    ['a number below its minimum', (g) => { g['8'].inputs.steps = 0; }, /below the minimum/],
  ];
  for (const [what, spoil, expected] of spoilers) {
    const graph = structuredClone(good);
    spoil(graph);
    const errors = validateGraph(graph, objectInfo);
    assert.ok(errors.some((error) => expected.test(error)), `${what} was not caught: ${JSON.stringify(errors)}`);
  }
});
