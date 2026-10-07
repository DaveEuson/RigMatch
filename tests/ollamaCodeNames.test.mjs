// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeRunFailure } from '../src/lib/runFailure.ts';
import { getFriendlyModelName, mergeModelRows } from '../src/lib/modelCatalog.ts';

/**
 * Ollama 0.40.0 on Windows 11 (2026-10-07) saved qwen3.5:9b's record as a
 * symlink that Windows refuses to follow. Every request for qwen3.5:9b failed
 * with the error below, and /api/tags listed the model only under a code name,
 * which runs. Both lines are copied from that PC.
 */
const refused = 'Error: 500 Internal Server Error from http://127.0.0.1:11434/api/chat: CreateFile C:\\Users\\Dave\\.ollama\\models\\manifests-v2\\ollama.com\\library\\qwen3.5\\9b: The path cannot be traversed because it contains an untrusted mount point.';
const codeName = 'llamacpp:c97eb11d70b1acdc88af01eef566c1fe4f7fbe93eb1afc06871132f293ff425a';

test('a model Windows will not let Ollama open is explained, not quoted', () => {
  const said = describeRunFailure(refused);
  assert.doesNotMatch(said.reason, /CreateFile|reported:/);
  assert.match(said.reason, /^Windows is blocking Ollama from opening this model's files\./);
  // The copy that runs, by the kind of name getFriendlyModelName gives it
  // below. No example: the model that failed may be any model.
  assert.match(said.reason, /working copy may be in your list under a shorter name made of its family and size\./);
  assert.match(said.reason, /Ollama 0\.35\.1 opens the model normally\.$/);
});

test('a model Ollama lists under a code name is shown by family and size, and still runs by the code', () => {
  assert.equal(getFriendlyModelName(codeName), 'Unnamed model c97eb11d', 'before Ollama has said what it is');
  const [row] = mergeModelRows([], [{
    name: codeName, model: codeName, sizeGb: 6.6, family: 'qwen35', parameterSize: '9.7B', quantization: 'Q4_K_M',
  }]);
  assert.equal(row.displayName, codeName, 'the code is the only name Ollama runs it under');
  assert.equal(getFriendlyModelName(row.displayName), 'Qwen35 9.7B');
  // Ordinary tags are untouched.
  assert.equal(getFriendlyModelName('qwen2.5:7b'), 'Qwen2.5');
  assert.equal(getFriendlyModelName('deadbeef:latest'), 'Deadbeef');
});
