// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTxt2ImgWorkflow,
  extractImages,
  parseSystemStats,
  readStatus,
  viewUrl,
} from '../src/lib/comfyui.ts';

test('the graph wires the sampler to the checkpoint, prompts and latent', () => {
  const graph = buildTxt2ImgWorkflow({ checkpoint: 'sd15.safetensors', prompt: 'a lighthouse' });
  const sampler = graph['3'];

  assert.equal(sampler.class_type, 'KSampler');
  assert.deepEqual(sampler.inputs.model, ['4', 0]);
  assert.deepEqual(sampler.inputs.positive, ['6', 0]);
  assert.deepEqual(sampler.inputs.negative, ['7', 0]);
  assert.deepEqual(sampler.inputs.latent_image, ['5', 0]);
  assert.equal(graph['6'].inputs.text, 'a lighthouse');
  assert.equal(graph['4'].inputs.ckpt_name, 'sd15.safetensors');
});

test('the seed is fixed by default, so two runs of a model are comparable', () => {
  const a = buildTxt2ImgWorkflow({ checkpoint: 'x', prompt: 'p' });
  const b = buildTxt2ImgWorkflow({ checkpoint: 'x', prompt: 'p' });
  assert.equal(a['3'].inputs.seed, b['3'].inputs.seed);
});

test('images are found whatever node id saved them', () => {
  // The save node is '9' in our graph, but a user-supplied workflow can save
  // from anywhere, so the whole outputs map is searched.
  const history = {
    abc: { outputs: { 42: { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } } },
  };
  assert.deepEqual(extractImages(history, 'abc'), [
    { filename: 'out.png', subfolder: '', type: 'output' },
  ]);
});

test('a history entry for another prompt is not mistaken for ours', () => {
  const history = { other: { outputs: { 9: { images: [{ filename: 'x.png' }] } } } };
  assert.deepEqual(extractImages(history, 'abc'), []);
  assert.deepEqual(readStatus(history, 'abc'), { done: false, failed: false });
});

test('a run that failed mid-graph is reported as failed, not as done with no images', () => {
  // This is the case that matters: the entry exists, so a presence-only check
  // would call it finished and score the model zero for a missing checkpoint.
  const history = {
    abc: {
      outputs: {},
      status: {
        completed: false,
        status_str: 'error',
        messages: [
          ['execution_start', {}],
          ['execution_error', { node_type: 'CheckpointLoaderSimple', exception_message: 'not found' }],
        ],
      },
    },
  };
  const status = readStatus(history, 'abc');
  assert.equal(status.done, true);
  assert.equal(status.failed, true);
  assert.match(status.error, /CheckpointLoaderSimple: not found/);
});

test('a successful run is done and not failed', () => {
  const history = { abc: { outputs: {}, status: { completed: true, status_str: 'success' } } };
  assert.deepEqual(readStatus(history, 'abc'), { done: true, failed: false, error: undefined });
});

test('the view URL escapes a subfolder and filename with spaces', () => {
  const url = viewUrl('http://127.0.0.1:8188/', {
    filename: 'my image.png',
    subfolder: 'a b',
    type: 'output',
  });
  assert.equal(url, 'http://127.0.0.1:8188/view?filename=my+image.png&subfolder=a+b&type=output');
});

test('missing VRAM figures read as zero rather than NaN', () => {
  // A NaN here divides through a fit calculation and quietly ruins a scorecard.
  const devices = parseSystemStats({ devices: [{ name: 'cuda:0', type: 'cuda' }] });
  assert.deepEqual(devices, [{ name: 'cuda:0', type: 'cuda', vramTotal: 0, vramFree: 0 }]);
});

test('system stats from a build that reports nothing yield no devices', () => {
  assert.deepEqual(parseSystemStats(null), []);
  assert.deepEqual(parseSystemStats({}), []);
});
