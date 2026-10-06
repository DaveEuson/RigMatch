// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

/**
 * Labs on LM Studio: App Builder, Code and picture reading run a model in
 * LM Studio through LM Studio, and the stream reader understands its events.
 * They used to sit out, because every Labs request went to Ollama.
 */

const require = createRequire(import.meta.url);
const { lmStudioChatBody, readLmStudioChat } = require('../electron/lmStudio.cjs');
const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');

// The real stream reader, lifted out of main.cjs with its few dependencies
// handed in, so it reads a stream the way the app does.
const streamSource = main.slice(main.indexOf('async function streamAdvancedGenerate('), main.indexOf('/**\n * A Labs test for a model in LM Studio'));
const extractSource = main.slice(main.indexOf('function extractResponseDetail(text) {'), main.indexOf('\n}\n', main.indexOf('function extractResponseDetail(text) {')) + 2);
const makeStream = (body) => new Function(
  'fetch', 'readLmStudioChat',
  `const activeAdvancedStreams = new Map(); const JSON_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
   ${extractSource}
   ${streamSource}
   return streamAdvancedGenerate;`,
)(async () => new Response(body, { status: 200 }), readLmStudioChat);

const sender = () => {
  const sent = [];
  return { sent, isDestroyed: () => false, send: (_channel, payload) => sent.push(payload) };
};

test('LM Studio\'s streamed events become the same text, progress and ending as Ollama\'s', async () => {
  const sse = [
    'event: chat.start', 'data: {"type":"chat.start","model_instance_id":"m"}', '',
    'event: reasoning.delta', 'data: {"type":"reasoning.delta","content":"hmm"}', '',
    'event: message.delta', 'data: {"type":"message.delta","content":"<html>"}', '',
    'event: message.delta', 'data: {"type":"message.delta","content":"</html>"}', '',
    'event: chat.end', 'data: {"type":"chat.end","result":{"output":[{"type":"message","content":"<html></html>"}],"stats":{"total_output_tokens":4}}}', '',
  ].join('\n');
  const out = sender();
  const result = await makeStream(sse)('u', { max_output_tokens: 4 }, 5000, out, 's1', 'm');
  assert.equal(result.response, '<html></html>', 'reasoning is left out, as Ollama\'s thinking is');
  assert.equal(result.done_reason, 'length', 'an answer that used the whole allowance reads as cut off');
  assert.deepEqual(out.sent.filter((p) => !p.done).map((p) => p.delta), ['<html>', '</html>']);
  assert.equal(out.sent.at(-1).done, true);
});

test('an error event from LM Studio is reported, not taken for an empty answer', async () => {
  const sse = 'event: error\ndata: {"type":"error","error":{"type":"x","message":"Model has unloaded"}}\n\n';
  const result = await makeStream(sse)('u', {}, 5000, sender(), 's2', 'm');
  assert.equal(result.error, 'Model has unloaded');
});

test('a streamed Ollama chat, which the listening round uses, is read as it arrives', async () => {
  const ndjson = '{"message":{"role":"assistant","content":"The quick"},"done":false}\n{"message":{"role":"assistant","content":" fox"},"done":false}\n{"message":{"role":"assistant","content":""},"done":true,"done_reason":"stop"}\n';
  const result = await makeStream(ndjson)('u', {}, 5000, sender(), 's3', 'm');
  assert.equal(result.response, 'The quick fox');
  assert.equal(result.done_reason, 'stop');
});

test('a picture goes to LM Studio as an image item beside the words', () => {
  const body = lmStudioChatBody({ model: 'm', prompt: 'What is in it?', maxOutputTokens: 600, contextLength: 4096, temperature: 0.2, images: ['data:image/png;base64,AAA'], stream: true });
  assert.deepEqual(body.input, [{ type: 'text', content: 'What is in it?' }, { type: 'image', data_url: 'data:image/png;base64,AAA' }]);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.stream, true);
  assert.equal(body.store, false);
});

test('Labs requests for a model in LM Studio go to LM Studio, and streamed audio to Ollama\'s chat', () => {
  const run = main.slice(main.indexOf('async function runAdvancedGenerate('), main.indexOf('async function streamAdvancedGenerate('));
  // Routed before any Ollama endpoint is named.
  const routed = run.indexOf("normalizeLocalProvider(request.provider, baseUrl) === 'lm-studio'");
  assert.ok(routed > 0 && routed < run.indexOf('`${baseUrl}/api/'), 'LM Studio is routed first');
  assert.match(run, /streamAdvancedGenerate\(`\$\{baseUrl\}\/api\/chat`, chatBody/);
  // Its budget carries over: the output cap and context window, and thinking off with a retry.
  const lms = main.slice(main.indexOf('async function runLmStudioAdvancedGenerate('));
  assert.match(lms, /maxOutputTokens = whole\(options\.num_predict\)/);
  assert.match(lms, /contextLength: whole\(options\.num_ctx\)/);
  assert.match(lms, /lmStudioNoReasoningSwitch\.add\(model\)/);
});
