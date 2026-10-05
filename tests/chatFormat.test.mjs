// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { mergeModelRows, canJoinComparison, modelMatchesTask, lacksChatFormat, getModelBenchmarkBlocker } from '../src/lib/modelCatalog.ts';

const require = createRequire(import.meta.url);
const { hasChatFormat } = require('../electron/chatFormat.cjs');

/**
 * Five of the 29 models on Dave's machine have no chat format: deepseek-ocr
 * (both tags), starcoder2 3b and 15b, and codegemma:2b. Their Ollama templates
 * have no roles and no built-in renderer, so they cannot hold the conversation
 * a show is. The templates below are the real ones, from /api/show.
 */

const shown = {
  'deepseek-ocr': { template: '{{ .Prompt }}', modelfile: 'FROM x\nTEMPLATE {{ .Prompt }}' },
  starcoder2: { template: '<file_sep>\n{{- if .Suffix }}<fim_prefix>\n{{ .Prompt }}<fim_suffix>{{ .Suffix }}<fim_middle>\n{{- else }}{{ .Prompt }}\n{{- end }}<|end_of_text|>', modelfile: '' },
  codegemma2b: { template: '{{- if .Suffix }}<|fim_prefix|>{{ .Prompt }}<|fim_suffix|>{{ .Suffix }}<|fim_middle|>\n{{- else }}{{ .Prompt }}\n{{- end }}', modelfile: '' },
  // Bare template, but Ollama renders the chat itself.
  'qwen3.5': { template: '{{ .Prompt }}', modelfile: 'FROM x\nTEMPLATE {{ .Prompt }}\nRENDERER qwen3.5\nPARSER qwen3.5' },
  'llama3.2': { template: '<|start_header_id|>system<|end_header_id|>\n{{ .System }}<|eot_id|>{{ range .Messages }}…{{ end }}', modelfile: '' },
  falcon: { template: '{{ if .System }}System: {{ .System }}\n{{ end }}User: {{ .Prompt }}\nAssistant:', modelfile: '' },
  bakllava: { template: 'USER: {{ .Prompt }}\nASSISTANT:', modelfile: '' },
};

test('the OCR and code-completion models have no chat format; chat models do', () => {
  for (const name of ['deepseek-ocr', 'starcoder2', 'codegemma2b']) assert.equal(hasChatFormat(shown[name]), false, name);
  for (const name of ['qwen3.5', 'llama3.2', 'falcon', 'bakllava']) assert.equal(hasChatFormat(shown[name]), true, name);
});

test('no template to judge by is unknown, not "no"', () => {
  assert.equal(hasChatFormat({}), undefined);
  assert.equal(hasChatFormat(null), undefined);
});

const entry = (name, tag) => ({ id: `${name}:${tag}`, name, tag, params: tag, sizeGb: 2, pack: 'Live Tag', source: 'Ollama library', live: true });
const installed = (name, chatFormat) => ({ name, model: name, sizeGb: 2, capabilities: ['completion', 'insert'], ...(chatFormat === undefined ? {} : { chatFormat }) });
const row = (name, tag, chatFormat) => mergeModelRows([entry(name, tag)], [installed(`${name}:${tag}`, chatFormat)])[0];

test('a model with no chat format stays out of shows, word filters and tests, and says why', () => {
  const starcoder = row('starcoder2', '3b', false);
  assert.equal(lacksChatFormat(starcoder), true);
  assert.equal(canJoinComparison(starcoder), false);
  for (const task of ['assistant', 'writing', 'coding', 'reasoning']) assert.equal(modelMatchesTask(starcoder, task), false, task);
  assert.match(getModelBenchmarkBlocker(starcoder, undefined, { ready: true }), /has no chat format/);
});

test('a model Ollama said nothing about keeps the benefit of the doubt', () => {
  const unknown = row('starcoder2', '3b', undefined);
  assert.equal(lacksChatFormat(unknown), false);
  assert.equal(canJoinComparison(unknown), true);
});
