// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { lmStudioOrigin, lmStudioModelFromRest } = require('../electron/lmStudio.cjs');

/**
 * LM Studio rows used to carry a name and nothing else: no size, so RigMatch
 * could not say whether a model fit and Simple Mode left every one out, and
 * vision and tool support were guessed from the name. LM Studio 0.4's
 * /api/v1/models says all of it. The shape below is from its documentation.
 */
const BASE = 'http://127.0.0.1:1234/v1';

const llama = {
  type: 'llm',
  publisher: 'lmstudio-community',
  key: 'llama-3.2-3b-instruct',
  display_name: 'Llama 3.2 3B Instruct',
  architecture: 'llama',
  quantization: { name: 'Q4_K_M', bits_per_weight: 4.8 },
  size_bytes: 2019377696,
  params_string: '3B',
  loaded_instances: [],
  max_context_length: 131072,
  format: 'gguf',
  capabilities: { vision: false, trained_for_tool_use: true },
};

test('a model arrives with its size, parameters, quantization and family', () => {
  const model = lmStudioModelFromRest(llama, BASE);
  assert.equal(model.name, 'llama-3.2-3b-instruct');
  assert.equal(model.model, 'llama-3.2-3b-instruct');
  assert.equal(model.sizeGb, 1.9);
  assert.equal(model.parameterSize, '3B');
  assert.equal(model.quantization, 'Q4_K_M');
  assert.equal(model.family, 'llama');
  assert.equal(model.provider, 'lm-studio');
  assert.equal(model.providerLabel, 'LM Studio');
  assert.equal(model.baseUrl, BASE);
});

test('what it can do is written in the words Ollama uses', () => {
  assert.deepEqual(lmStudioModelFromRest(llama, BASE).capabilities, ['completion', 'tools']);
  const vision = { ...llama, key: 'qwen/qwen2.5-vl-7b', capabilities: { vision: true, trained_for_tool_use: false } };
  assert.deepEqual(lmStudioModelFromRest(vision, BASE).capabilities, ['completion', 'vision']);
  const thinker = { ...llama, key: 'qwen/qwen3-4b', capabilities: { reasoning: { allowed_options: ['off', 'on'], default: 'on' } } };
  assert.deepEqual(lmStudioModelFromRest(thinker, BASE).capabilities, ['completion', 'thinking']);
});

test('an embedding model cannot hold a conversation, so it stays out of shows', () => {
  const embedding = { type: 'embedding', key: 'text-embedding-nomic-embed-text-v1.5', size_bytes: 84106624, quantization: { name: 'Q4_K_M' } };
  const model = lmStudioModelFromRest(embedding, BASE);
  assert.deepEqual(model.capabilities, ['embedding']);
  assert.equal(model.sizeGb, 0.1);
});

test('a missing size or parameter count does not invent one', () => {
  const bare = { type: 'llm', key: 'mystery-7b' };
  const model = lmStudioModelFromRest(bare, BASE);
  assert.equal(model.sizeGb, 0);
  assert.equal(model.parameterSize, '7B');
  assert.equal(model.quantization, undefined);
  assert.equal(lmStudioModelFromRest({ type: 'llm', key: 'mystery' }, BASE).parameterSize, 'Local');
});

test('an entry with no key is dropped rather than shown as a blank row', () => {
  assert.equal(lmStudioModelFromRest({ type: 'llm' }, BASE), null);
  assert.equal(lmStudioModelFromRest(null, BASE), null);
});

test('the native API is found beside /v1, not under it', () => {
  assert.equal(lmStudioOrigin('http://127.0.0.1:1234/v1'), 'http://127.0.0.1:1234');
  assert.equal(lmStudioOrigin('http://127.0.0.1:1234/v1/'), 'http://127.0.0.1:1234');
  assert.equal(lmStudioOrigin('http://127.0.0.1:1234'), 'http://127.0.0.1:1234');
});

test('status asks the native API first and keeps the old route for LM Studio before 0.4', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const status = main.slice(main.indexOf('async function getLmStudioStatus'), main.indexOf('async function getOllamaCatalog'));
  assert.ok(status.indexOf('/api/v1/models') < status.indexOf('}/models`'), 'the described list is asked for first');
  assert.match(status, /lmStudioModelFromRest/);
  assert.match(status, /LM_STUDIO_TOKEN_MESSAGE/, 'a server that wants a token says so');
});
