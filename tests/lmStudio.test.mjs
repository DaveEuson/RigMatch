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

const {
  lmStudioChatBody,
  readLmStudioChat,
  toOpenAiToolMessages,
  toolReplyFromOpenAi,
  loadedInstanceIds,
} = require('../electron/lmStudio.cjs');

/**
 * Phase 2: an LM Studio contestant is asked and timed the way an Ollama one
 * is. Speed used to be tokens over the wall clock, which counted loading the
 * model and reading the prompt as generation, and every question carried a
 * system message Ollama's contestants never saw.
 */
test('a question is asked bare, with the same cap and context as Ollama, and not kept', () => {
  const body = lmStudioChatBody({ model: 'm', prompt: 'Why is the sky blue?', maxOutputTokens: 300, contextLength: 2048, reasoningOff: true });
  assert.deepEqual(body, {
    model: 'm',
    input: 'Why is the sky blue?',
    temperature: 0,
    max_output_tokens: 300,
    context_length: 2048,
    stream: false,
    store: false,
    reasoning: 'off',
  });
  assert.equal('system_prompt' in body, false);
  assert.equal('reasoning' in lmStudioChatBody({ model: 'm', prompt: 'p', maxOutputTokens: 8, contextLength: 2048, reasoningOff: false }), false);
});

test('speed is LM Studio\'s own generation rate, not tokens over the wall clock', () => {
  const reply = {
    output: [{ type: 'reasoning', content: 'hmm' }, { type: 'message', content: 'Rayleigh scattering.' }],
    stats: { input_tokens: 12, total_output_tokens: 120, reasoning_output_tokens: 0, tokens_per_second: 60, time_to_first_token_seconds: 0.25, model_load_time_seconds: 3.5 },
  };
  const read = readLmStudioChat(reply, 300);
  assert.equal(read.responseText, 'Rayleigh scattering.');
  assert.equal(read.evalCount, 120);
  assert.equal(read.evalDurationSeconds, 2);
  assert.equal(read.evalCount / read.evalDurationSeconds, 60);
  assert.equal(read.promptEvalDurationMs, 250);
  assert.equal(read.loadDurationMs, 3500);
  assert.equal(read.doneReason, 'stop');
});

test('an answer that used the whole allowance is flagged as cut off, as Ollama\'s "length" is', () => {
  const read = readLmStudioChat({ output: [{ type: 'message', content: 'x' }], stats: { total_output_tokens: 300, tokens_per_second: 50 } }, 300);
  assert.equal(read.doneReason, 'length');
  assert.equal(read.loadDurationMs, null, 'no load time when the model was already loaded');
});

test('tool questions keep their conversation when they go to an OpenAI-style server', () => {
  const messages = [
    { role: 'user', content: 'Find the team page, then email Sam.' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_7', type: 'function', function: { name: 'open_page', arguments: '{"url":"https://example.com/team"}' } }] },
    { role: 'tool', tool_name: 'open_page', content: 'Sam: sam@example.com' },
  ];
  const out = toOpenAiToolMessages(messages);
  assert.equal(out[1].tool_calls[0].id, 'call_7');
  assert.equal(out[1].tool_calls[0].function.arguments, '{"url":"https://example.com/team"}');
  assert.deepEqual(out[2], { role: 'tool', tool_call_id: 'call_7', content: 'Sam: sam@example.com' });
});

test('a call written the Ollama way, with object arguments, is sent as a string', () => {
  const out = toOpenAiToolMessages([{ role: 'assistant', content: '', tool_calls: [{ function: { name: 'web_search', arguments: { query: 'weather' } } }] }]);
  assert.equal(out[0].tool_calls[0].function.arguments, '{"query":"weather"}');
  assert.equal(out[0].tool_calls[0].id, 'call_0');
});

test('a tool reply comes back in Ollama\'s shape, timed when LM Studio says how long it took', () => {
  const reply = toolReplyFromOpenAi({
    choices: [{ message: { content: null, tool_calls: [{ id: 'c', function: { name: 'send_email', arguments: '{"to":"sam@example.com"}' } }] }, finish_reason: 'tool_calls' }],
    usage: { completion_tokens: 30 },
    stats: { tokens_per_second: 60, time_to_first_token: 0.1, generation_time: 0.5 },
  });
  assert.equal(reply.message.tool_calls[0].function.name, 'send_email');
  assert.equal(reply.message.content, '');
  assert.equal(reply.eval_count, 30);
  assert.equal(reply.eval_duration, 500_000_000, 'timed at LM Studio\'s own rate: 30 tokens at 60 tok/s');
  // Measured on a real LM Studio: generation_time includes the first-token wait.
  const real = toolReplyFromOpenAi({
    choices: [{ message: { tool_calls: [] }, finish_reason: 'tool_calls' }],
    usage: { completion_tokens: 38 },
    stats: { tokens_per_second: 141.98, time_to_first_token: 0.034, generation_time: 0.295 },
  });
  assert.equal(Math.round(38 / (real.eval_duration / 1e9)), 142);
  assert.equal(reply.prompt_eval_duration, 100_000_000);
  assert.equal(reply.done_reason, 'stop');
  assert.equal(toolReplyFromOpenAi({ choices: [{ message: { content: 'hi' } }] }).eval_duration, 0, 'no stats: the caller times it');
});

test('cleanup finds the copies of a model LM Studio has loaded', () => {
  const listing = { models: [
    { key: 'a', loaded_instances: [{ id: 'a' }, { id: 'a:2' }] },
    { key: 'b', loaded_instances: [] },
  ] };
  assert.deepEqual(loadedInstanceIds(listing, 'a'), ['a', 'a:2']);
  assert.deepEqual(loadedInstanceIds(listing, 'b'), []);
  assert.deepEqual(loadedInstanceIds(null, 'a'), []);
});

test('a show unloads what it loaded in LM Studio and judges on the judge\'s own provider', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.match(main, /normalizeLocalProvider\(request\.provider, runBaseUrl\) === 'lm-studio'\)\s*\{\s*await unloadLmStudioModel/);
  assert.match(main, /activeBenchmark\.lmStudioKeep = await lmStudioLoadedInstances\(baseUrl, model\)/);
  assert.match(main, /runLocalJudge\(judgeEndpoint\(judgeName\)/);
  assert.doesNotMatch(main, /provider === 'ollama' && Boolean\(autoJudgeModel\)/, 'an LM Studio contestant can be judged');
  assert.doesNotMatch(main, /the tool test runs through Ollama/, 'the tool test runs on LM Studio');
  assert.doesNotMatch(main, /You are taking a RigMatch local model compatibility test/, 'no system message Ollama never sends');
});

test('an error from an OpenAI-style server says what went wrong, not "[object Object]"', () => {
  // Found on a real LM Studio: a model with no thinking setting refuses
  // reasoning:"off" with { error: { message } }. Printed as [object Object],
  // the retry without the switch never saw the word "reasoning", and every
  // LM Studio show and judge on such a model failed on its first question.
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const start = main.indexOf('function extractResponseDetail(text) {');
  const source = main.slice(start, main.indexOf('\n}\n', start) + 2);
  const extractResponseDetail = new Function(`${source}; return extractResponseDetail;`)();
  const lmStudio = JSON.stringify({ error: { message: "Model 'llama-3.2-3b-instruct' does not expose reasoning configuration.", type: 'invalid_request', param: 'reasoning' } });
  assert.match(extractResponseDetail(lmStudio), /does not expose reasoning configuration/);
  assert.equal(extractResponseDetail(JSON.stringify({ error: 'model "x" not found' })), 'model "x" not found', 'Ollama\'s shape is unchanged');
  assert.equal(extractResponseDetail(JSON.stringify({ message: 'plain' })), 'plain');
  assert.equal(extractResponseDetail('not json'), 'not json');
});
