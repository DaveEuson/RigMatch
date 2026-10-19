// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readTokenCounts } from '../rigmatch-chat/src/lib/contextWindow.ts';
import { parseStore, readStore } from '../rigmatch-chat/src/lib/conversationStore.ts';
import { parseMemories } from '../rigmatch-chat/src/lib/memory.ts';
import {
  buildContextMessages,
  buildSummaryRequest,
  compactionSplit,
  summaryContextSize,
} from '../rigmatch-chat/src/lib/compaction.ts';

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

const msg = (role, content, extra = {}) => ({ id: `${role}-${content}`, role, content, ts: 1, ...extra });
const turns = (n) => Array.from({ length: n }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`));

test('a second summary reads only what the first did not cover', () => {
  const messages = turns(10);
  const [, user] = buildSummaryRequest(messages, 8, 'notes on m0-m3', 4);
  assert.match(user.content, /notes on m0-m3/);
  const said = (name) => user.content.split('\n').some((line) => line.endsWith(`: ${name}`));
  for (const covered of ['m0', 'm1', 'm2', 'm3']) assert.ok(!said(covered), `${covered} is in the old summary`);
  for (const fresh of ['m4', 'm5', 'm6', 'm7']) assert.ok(said(fresh), `${fresh} is new since then`);
  assert.ok(!said('m8'), 'turns being kept are not summarized');
});

test("RigMatch's notes are not summarized and do not shift what is kept", () => {
  // A guard note sits after the second user turn, as sendMessage puts it.
  const note = msg('assistant', 'starcoder2:3b writes text. It cannot make pictures.', { fromRigMatch: true });
  const messages = [...turns(3), note, ...turns(10).slice(3).map((m) => ({ ...m, id: `${m.id}-b` }))];
  const upTo = compactionSplit(messages, 0, { keepRecent: 4 });
  // Four real turns kept, counted in transcript positions.
  assert.equal(upTo, messages.length - 4);

  const [, summaryAsk] = buildSummaryRequest(messages, upTo);
  assert.doesNotMatch(summaryAsk.content, /cannot make pictures/);

  const sent = buildContextMessages(messages, 'summary', upTo);
  // Exactly the turns the summary does not cover: none dropped, none repeated.
  assert.deepEqual(sent.slice(1).map((m) => m.content), messages.slice(upTo).map((m) => m.content));
});

test('a note before the summary point no longer costs the model a turn it should see', () => {
  const note = msg('assistant', 'RigMatch note', { fromRigMatch: true });
  const messages = [msg('user', 'a'), note, msg('assistant', 'b'), msg('user', 'c'), msg('assistant', 'd')];
  // Summary covers positions 0-2 (a, the note, b). c and d must be sent.
  const sent = buildContextMessages(messages, 'covers a and b', 3);
  assert.deepEqual(sent.map((m) => m.content), ['Summary of earlier in this conversation:\ncovers a and b', 'c', 'd']);
});

test('the summary request gets a window that holds it, and no smaller than the chat uses', () => {
  const small = [{ role: 'system', content: 'x' }, { role: 'user', content: 'y'.repeat(4000) }];
  assert.equal(summaryContextSize(small, 8192), 8192, 'a request that fits keeps the chat size, so no reload');
  const large = [{ role: 'user', content: 'y'.repeat(4 * 20000) }];
  assert.equal(summaryContextSize(large, 8192), 32768);
  assert.equal(summaryContextSize(large, 8192, 16384), 16384, 'never past what the model declares');
});

test('the token mark counts the note sendMessage shows, the list the meter slices', () => {
  assert.match(callback('sendMessage'), /messageCount: visibleHistory\.length \+ \(accumulated \? 1 : 0\)/);
  assert.match(callback('runCompaction'), /buildSummaryRequest\(\s*activeConversation\.messages,\s*upTo,\s*activeConversation\.summary,\s*activeConversation\.summarizedCount \?\? 0,\s*\)/);
});
