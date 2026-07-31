import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getModelFamily, getModelOrigin } from '../src/lib/modelOrigins.ts';

test('core families keep their own art', () => {
  assert.equal(getModelFamily('qwen2.5:7b'), 'qwen');
  assert.equal(getModelFamily('deepseek-r1:7b'), 'deepseek');
  assert.equal(getModelFamily('llama3.2:3b'), 'llama');
  assert.equal(getModelFamily('phi3:mini'), 'phi');
});

test('variants inherit their parent family', () => {
  assert.equal(getModelFamily('codegemma:7b'), 'gemma');
  assert.equal(getModelFamily('tinyllama'), 'llama');
  assert.equal(getModelFamily('codellama:13b'), 'llama');
});

test("Mistral AI's own models are recognized without the literal 'mistral'", () => {
  // Regression: these fell through to the generic robot AND an unknown vendor.
  assert.equal(getModelFamily('mixtral:8x7b'), 'mistral');
  assert.equal(getModelFamily('devstral'), 'mistral');
  assert.equal(getModelFamily('codestral'), 'mistral');
  assert.equal(getModelOrigin('mixtral:8x7b').organization, 'Mistral AI');
});

test('new families are detected for their upcoming art', () => {
  assert.equal(getModelFamily('granite3.2:2b'), 'granite');
  assert.equal(getModelFamily('command-r'), 'cohere');
  assert.equal(getModelFamily('aya:8b'), 'cohere');
  assert.equal(getModelFamily('yi:9b'), 'yi');
  assert.equal(getModelFamily('solar:10.7b'), 'solar');
  assert.equal(getModelFamily('falcon2'), 'falcon');
  assert.equal(getModelFamily('starcoder2:3b'), 'starcoder');
  assert.equal(getModelFamily('smollm2'), 'smollm');
  assert.equal(getModelFamily('stablelm2'), 'stablelm');
});

test('vision and image-generation models share a family', () => {
  for (const m of ['llava:7b', 'bakllava', 'moondream', 'minicpm-v']) {
    assert.equal(getModelFamily(m), 'vision', `${m} should be vision`);
  }
  for (const m of ['x/flux2-klein:4b', 'x/z-image-turbo']) {
    assert.equal(getModelFamily(m), 'imagegen', `${m} should be imagegen`);
  }
});

test('short family names do not match inside unrelated model names', () => {
  // "yi" and "aya" are short enough to false-match as bare substrings.
  assert.notEqual(getModelFamily('wizardlm2'), 'yi');
  assert.notEqual(getModelFamily('stablelm2'), 'yi');
  assert.notEqual(getModelFamily('llama3.2-vision:11b'), 'cohere');
});

test('community fine-tunes stay generic and keep their real vendor', () => {
  // Mapping these onto a base family would relabel their organization wrongly.
  assert.equal(getModelFamily('zephyr'), 'generic');
  assert.equal(getModelFamily('vicuna'), 'generic');
  assert.equal(getModelFamily('orca-mini'), 'generic');
  assert.equal(getModelOrigin('zephyr').organization, 'Hugging Face');
});
