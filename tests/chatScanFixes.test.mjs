// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readTokenCounts } from '../rigmatch-chat/src/lib/contextWindow.ts';
import { parseStore, readStore } from '../rigmatch-chat/src/lib/conversationStore.ts';
import { parseMemories } from '../rigmatch-chat/src/lib/memory.ts';

/**
 * RigMatch Chat fixes from the 2026-10-18 bug scan. App.tsx is a React
 * component that needs Tauri to run, so its parts are checked in the source;
 * everything that could move into a library module is imported and run.
 */

const app = readFileSync(new URL('../rigmatch-chat/src/App.tsx', import.meta.url), 'utf-8');
/** The body of one `const name = useCallback(...)` in App.tsx. */
const callback = (name) => {
  const start = app.indexOf(`const ${name} = useCallback(`);
  assert.notEqual(start, -1, `${name} not found in App.tsx`);
  const end = app.indexOf('\n  }, [', start);
  return app.slice(start, end);
};

test('end-of-reply counts are read under the names the Rust side sends', () => {
  assert.deepEqual(
    readTokenCounts({ type: 'done', promptTokens: 812, evalTokens: 64 }),
    { promptTokens: 812, evalTokens: 64 },
  );
});

test('a count that is not a number is refused, not stored as a measurement', () => {
  // The old shape: snake_case fields, so promptTokens was undefined and the
  // meter read "Memory NaN / 4K".
  assert.equal(readTokenCounts({ type: 'done', prompt_tokens: 812, eval_tokens: 64 }), null);
  assert.equal(readTokenCounts({ type: 'done', promptTokens: '812', evalTokens: 64 }), null);
  assert.equal(readTokenCounts({ type: 'done', promptTokens: Number.NaN, evalTokens: 64 }), null);
  assert.equal(readTokenCounts({ type: 'done', promptTokens: 812, evalTokens: -1 }), null);
  assert.equal(readTokenCounts(null), null);
});

test('an attachment is sent with one message, not every message after it', () => {
  const send = callback('sendMessage');
  const built = send.indexOf('const userMsg: AppMessage');
  const cleared = send.indexOf('if (usableAttachment) setAttachment(null);');
  assert.ok(built !== -1 && cleared > built, 'sendMessage clears the attachment once the turn holds it');
  assert.ok(cleared < send.indexOf('await streamChat('), 'cleared before the reply streams');
});

test('a store file that is there but unreadable is told apart from no file at all', async () => {
  const parse = (raw) => parseStore(raw, { makeId: (i) => `id-${i}`, now: 1, defaultPersonalityId: 'buddy' });
  const read = (value) => () => (value instanceof Error ? Promise.reject(value) : Promise.resolve(value));

  assert.deepEqual(await readStore(read(null), parse), { status: 'missing' });
  // Zero bytes holds nothing to lose.
  assert.deepEqual(await readStore(read(''), parse), { status: 'missing' });

  const saved = JSON.stringify({ version: 2, conversations: [{ id: 'a', modelName: 'm', messages: [] }] });
  const ok = await readStore(read(saved), parse);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.value[0].id, 'a');

  // Locked, damaged, and written by a newer build: all three used to read as
  // an empty history, which the first save then wrote over the file.
  const locked = await readStore(read(new Error('The process cannot access the file')), parse);
  assert.deepEqual(locked, { status: 'unreadable', reason: 'The process cannot access the file' });
  assert.equal((await readStore(read('{"version":2,"conv'), parse)).status, 'unreadable');
  assert.equal((await readStore(read('{"version":3,"conversations":[]}'), parse)).status, 'unreadable');
  assert.equal((await readStore(read('{"version":9,"memories":[]}'), parseMemories)).status, 'unreadable');
});

test('an unreadable history or memory is never marked loaded, so it is never saved over', () => {
  const load = app.slice(app.indexOf('void loadConversations().then('), app.indexOf('const writerRef'));
  assert.match(load, /if \(loaded\.status === "unreadable"\) \{[\s\S]*?backUpConversationsFile\(\)[\s\S]*?return;\s*\}[\s\S]*?setHistoryLoaded\(true\)/);
  const memory = app.slice(app.indexOf('void readStore(readMemoriesFile, parseMemories)'), app.indexOf('const startFresh'));
  assert.match(memory, /if \(loaded\.status === "unreadable"\) \{[\s\S]*?backUpMemoriesFile\(\)[\s\S]*?return;\s*\}[\s\S]*?setMemoriesLoaded\(true\)/);
  // Starting fresh is offered only once a copy exists.
  assert.match(app, /\{unreadable\.copy && \([\s\S]*?onClick=\{\(\) => startFresh\(store\)\}/);
});

test("a failed reply shows Ollama's reason and is not sent back as the model's words", () => {
  const send = callback('sendMessage');
  const failure = send.slice(send.indexOf('} catch (err) {'));
  assert.match(failure, /const reason = typeof err === "string" \? err : \(err as Error\)\?\.message;/);
  assert.match(failure, /content: reason \|\| "Something went wrong\. Is Ollama still running\?"/);
  assert.match(failure, /fromRigMatch: true/);
});
