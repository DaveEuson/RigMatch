// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeModelRows,
  canGenerateText,
  canJoinComparison,
  canReadImages,
  canHearAudio,
  modelMatchesTask,
  getModelDreamTags,
  descriptionSpecialties,
} from '../src/lib/modelCatalog.ts';

// Catalog rows as the Models screen builds them, none installed.
const entry = (name, tag, extra = {}) => ({ id: `${name}:${tag}`, name, tag, params: tag, sizeGb: 5, pack: 'Live Tag', source: 'Ollama library', live: true, ...extra });
const row = (...args) => mergeModelRows([entry(...args)], [])[0];

test('a download that uses tools and thinks can join the lineup', () => {
  const qwen = row('qwen3.5', '9b', { capabilities: ['completion', 'vision', 'tools', 'thinking'] });
  assert.equal(canGenerateText(qwen), true);
  assert.equal(canJoinComparison(qwen), true);
  assert.equal(canReadImages(qwen), true);
  assert.equal(canHearAudio(qwen), false);
});

test('reading pictures follows the size, not the family name', () => {
  assert.equal(canReadImages(row('gemma3', '1b', { capabilities: ['completion'] })), false);
  assert.equal(canReadImages(row('gemma3', '4b', { capabilities: ['completion', 'vision'] })), true);
  assert.equal(modelMatchesTask(row('gemma4', '12b', { capabilities: ['completion', 'vision', 'tools', 'thinking'] }), 'vision'), true,
    'gemma4 is missing from the name rule; the page says it sees');
});

test('Listens to audio lists only what reports hearing', () => {
  assert.equal(modelMatchesTask(row('gemma4', 'e4b', { capabilities: ['completion', 'vision', 'audio'] }), 'hears'), true);
  assert.equal(modelMatchesTask(row('gemma4', '31b', { capabilities: ['completion', 'vision'] }), 'hears'), false);
  assert.equal(modelMatchesTask(row('glm-5.3', 'latest'), 'hears'), false, 'no report means no hearing');
});

test('embedding and OCR models are not chat, writing or code models', () => {
  const embed = row('embeddinggemma', '300m', { capabilities: ['embedding'] });
  const ocr = row('glm-ocr', 'latest', { capabilities: ['completion', 'vision'], description: 'GLM-OCR is a multimodal OCR model.' });
  for (const task of ['assistant', 'writing', 'coding', 'reasoning']) {
    assert.equal(modelMatchesTask(embed, task), false, `embedding in ${task}`);
    assert.equal(modelMatchesTask(ocr, task), false, `OCR in ${task}`);
  }
  assert.equal(canJoinComparison(embed), false);
  assert.equal(modelMatchesTask(ocr, 'vision'), true, 'OCR still reads pictures');
});

test('Code takes a family at its own description', () => {
  assert.deepEqual(descriptionSpecialties('Devstral: the best open source model for coding agents'), ['coding']);
  assert.deepEqual(descriptionSpecialties('24B model that excels at using tools to explore codebases'), ['coding']);
  assert.deepEqual(descriptionSpecialties('A general-purpose model.'), []);
  const devstral = row('devstral', '24b', { capabilities: ['completion', 'tools'], description: 'Devstral: the best open source model for coding agents' });
  assert.equal(modelMatchesTask(devstral, 'coding'), true);
});

test('a cloud-only size cannot join a lineup measured on this PC', () => {
  assert.equal(canJoinComparison(row('kimi-k2.6', 'cloud', { capabilities: ['completion', 'vision'], cloudOnly: true })), false);
  assert.equal(canJoinComparison(row('nemotron-3-nano', '30b-cloud', { capabilities: ['completion'] })), false);
  assert.equal(canJoinComparison(row('nemotron-3-nano', '30b', { capabilities: ['completion'] })), true);
});

test('Makes pictures in Simple Mode follows what the model reports, not its name', () => {
  assert.ok(getModelDreamTags(row('x/z-image-turbo', 'latest', { capabilities: ['image'] })).includes('image'));
  assert.ok(!getModelDreamTags(row('qwen3', '8b', { capabilities: ['completion'] })).includes('image'));
});

test('Tiny is not cut short by the five-tag display limit', () => {
  // Description tags come first, so a small model's "low memory" now lands
  // past the five a row shows; the filter reads them all.
  const small = row('qwen3', '0.6b', { sizeGb: 0.5, pulls: 9_000_000, capabilities: ['completion', 'tools', 'thinking'], description: 'Qwen3 offers reasoning, coding and creative writing.' });
  assert.equal(modelMatchesTask(small, 'tiny'), true);
});
