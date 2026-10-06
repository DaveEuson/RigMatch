// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { textJudgeCandidates } from '../src/lib/modelCatalog.ts';

/**
 * The bug scan after #103–#105 (2026-10-06): three reviewers over the Labs
 * routing, the app side of it, and the design and newcomer changes. One test
 * per finding that was fixed.
 */

const require = createRequire(import.meta.url);
const { readLmStudioChat } = require('../electron/lmStudio.cjs');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const main = read('../electron/main.cjs');
const app = read('../src/App.tsx');
const sheet = read('../src/components/RunSheet.tsx');

const lift = (start, end) => main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start)));

test('an address is LM Studio\'s by its port or its /v1 path, parsed, not by a substring', () => {
  const normalizeLocalProvider = new Function(`${lift('function normalizeLocalProvider(', '\nfunction ')}; return normalizeLocalProvider;`)();
  assert.equal(normalizeLocalProvider(undefined, 'http://127.0.0.1:1234/v1'), 'lm-studio');
  assert.equal(normalizeLocalProvider(undefined, 'http://127.0.0.1:1234'), 'lm-studio');
  assert.equal(normalizeLocalProvider(undefined, 'http://127.0.0.1:11434'), 'ollama');
  assert.equal(normalizeLocalProvider(undefined, 'http://127.0.0.1:12345'), 'ollama', 'port 12345 is not 1234');
  assert.equal(normalizeLocalProvider(undefined, 'http://127.0.0.1:11434/v1beta/x'), 'ollama');
  assert.equal(normalizeLocalProvider(undefined, 'not a url'), 'ollama');
  assert.equal(normalizeLocalProvider('lm-studio', 'http://127.0.0.1:11434'), 'lm-studio', 'a named provider wins');
});

test('a one-line reply with no newline after it is read, so an old LM Studio\'s error is not an empty answer', async () => {
  const streamSource = lift('async function streamAdvancedGenerate(', '/**\n * A Labs test for a model in LM Studio');
  const extractSource = main.slice(main.indexOf('function extractResponseDetail(text) {'), main.indexOf('\n}\n', main.indexOf('function extractResponseDetail(text) {')) + 2);
  const stream = new Function('fetch', 'readLmStudioChat', `const activeAdvancedStreams = new Map(); const JSON_RESPONSE_MAX_BYTES = 8e6; ${extractSource} ${streamSource} return streamAdvancedGenerate;`)(
    async () => new Response('{"error":"Unexpected endpoint or method. (POST /api/v1/chat)"}', { status: 200 }),
    readLmStudioChat,
  );
  const sent = [];
  const result = await stream('u', {}, 5000, { isDestroyed: () => false, send: (_c, p) => sent.push(p) }, 's', 'm');
  assert.match(result.error ?? '', /Unexpected endpoint/);
  assert.equal(sent.at(-1).done, true);
});

test('Labs on LM Studio: an old LM Studio is asked on its OpenAI route, and the card is shared', () => {
  const lms = lift('async function runLmStudioAdvancedGenerate(', '\nconst ollamaLabResident');
  // Before 0.4: no /api/v1/chat, so the OpenAI route, as the show does.
  assert.match(lms, /\/Unexpected endpoint\/i\.test\(result\.error \?\? ''\) \? await askOpenAi\(\) : result/);
  assert.match(lms, /\/chat\/completions`/);
  // Ollama's leftover Labs models out first; the copies it loaded unloaded after,
  // and only with a listing to compare against.
  assert.match(lms, /await releaseOllamaLabModels\(\);/);
  assert.match(lms, /const keep = listing \? loadedInstanceIds\(listing, model\) : null;/);
  assert.match(lms, /if \(keep\) await unloadLmStudioModel\(baseUrl, model, keep\);/);
  // A streamed test asked whole can still be stopped, and still ends.
  assert.match(lms, /activeAdvancedStreams\.set\(stream\.streamId, entry\)/);
  assert.match(lms, /signal: entry\?\.controller\.signal/);
  assert.match(lms, /if \(stream\) emitDone\(result\);/);
  // Ollama Labs requests are recorded so the release knows what to free.
  const run = lift('async function runAdvancedGenerate(', 'async function streamAdvancedGenerate(');
  assert.match(run, /if \(body\.keep_alive !== '0'\) ollamaLabResident\.set\(/);
});

test('a copy RigMatch loaded under the model\'s bare name is left, rather than unload yours by mistake', () => {
  // LM Studio 0.4 resolved instance id "llama-3.2-3b-instruct" to the first
  // copy of that model: the one the user had loaded as "mine".
  const unload = lift('async function unloadLmStudioModel(', '\n}\n');
  assert.match(unload, /if \(instanceId === model && keepIds\.size > 0\) \{/);
  assert.ok(unload.indexOf('instanceId === model') < unload.indexOf('/api/v1/models/unload'), 'checked before the unload call');
});

test('a listening result keeps its own key and no longer replaces the app it was run beside', () => {
  assert.match(app, /: job\.kind === 'listening' \? `listening:\$\{job\.model\}`/);
});

test('the run sheet decides picture reading by what the program reports, as the run does', () => {
  assert.match(app, /readCapable=\{sheetLineupRows\.some\(\(row\) => canReadImages\(row\)\)\}/);
  assert.match(sheet, /const visionCapable = readCapable;/);
  assert.doesNotMatch(sheet, /isVisionModel/);
});

test('a safety classifier is a last resort as a judge, like an OCR model', () => {
  const rows = [
    { displayName: 'gpt-oss-safeguard:20b', capabilities: ['completion'], sizeGb: 14 },
    { displayName: 'qwen3:8b', capabilities: ['completion'], sizeGb: 5.2 },
    { displayName: 'llama3.2:3b', capabilities: ['completion'], sizeGb: 2 },
  ];
  assert.deepEqual(textJudgeCandidates(rows, 24), ['qwen3:8b', 'llama3.2:3b', 'gpt-oss-safeguard:20b']);
});
