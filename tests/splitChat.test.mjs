// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  STORE_VERSION,
  keepColumn,
  parseStore,
  serializeStore,
  splitThread,
  splitTurns,
  startSplit,
  streamKey,
  untilLastAsk,
  updateColumn,
} from '../rigmatch-chat/src/lib/conversationStore.ts';

const OPTS = { makeId: (i) => `id-${i}`, now: 1_770_000_000_000, defaultPersonalityId: 'default' };
const msg = (id, role, content, extra = {}) => ({ id, role, content, ts: 1000, ...extra });

/** A chat saved before split chats existed, exactly as 0.9.9 writes it. */
const SAVED = {
  id: 'c1',
  modelName: 'gemma4:12b',
  personalityId: 'default',
  title: 'Landlord email',
  titleIsAuto: true,
  createdAt: 1000,
  updatedAt: 2000,
  messages: [
    msg('u1', 'user', 'Write my landlord an email about the leak', { attachmentName: 'leak.jpg' }),
    msg('a1', 'assistant', 'Dear landlord…'),
  ],
  summary: 'They asked for an email.',
  summarizedCount: 1,
  summaryBy: 'gemma4:12b',
};

test('a chat saved before split chats existed loads unchanged', () => {
  const raw = JSON.stringify({ version: 2, conversations: [SAVED] });
  assert.equal(STORE_VERSION, 2, 'the file version stays, so older Chats still read it');
  assert.deepEqual(parseStore(raw, OPTS), [SAVED]);
  // And is written back the same: no split field appears on an ordinary chat.
  assert.deepEqual(JSON.parse(serializeStore([SAVED])), { version: 2, conversations: [SAVED] });
});

test('a chat asking two is saved and reopens asking two, without attachment bytes', () => {
  const asked = msg('u2', 'user', 'Shorter, please', { images: ['QUJD'], attachmentName: 'leak.jpg' });
  const split = {
    ...startSplit(SAVED, 'qwen3.5:9b'),
    messages: [...SAVED.messages, asked, msg('a2', 'assistant', 'Short one')],
  };
  split.split = { ...split.split, messages: [asked, msg('b2', 'assistant', 'Shorter still')] };

  const reopened = parseStore(serializeStore([split]), OPTS)[0];
  assert.equal(reopened.split.modelName, 'qwen3.5:9b');
  assert.equal(reopened.split.from, 2);
  assert.deepEqual(reopened.split.messages.map((m) => m.id), ['u2', 'b2']);
  // Bytes are dropped on both sides; the name survives.
  assert.equal(reopened.messages[2].images, undefined);
  assert.equal(reopened.split.messages[0].images, undefined);
  assert.equal(reopened.split.messages[0].attachmentName, 'leak.jpg');
});

test('a damaged second side costs only that side', () => {
  const read = (split) => parseStore(JSON.stringify({ version: 2, conversations: [{ ...SAVED, split }] }), OPTS)[0];
  assert.equal(read({ modelName: '', from: 0, messages: [] }).split, undefined);
  assert.equal(read({ modelName: 'qwen3.5:9b', from: 0, messages: 'nope' }).split, undefined);
  assert.equal(read('nope').split, undefined);
  assert.deepEqual(read('nope').messages, SAVED.messages);
  // A start past the end is clamped to what is there.
  assert.equal(read({ modelName: 'qwen3.5:9b', from: 99, messages: [] }).split.from, 2);
});

test('the second model is sent what came before it joined, then its own turns', () => {
  const split = updateColumn(startSplit(SAVED, 'qwen3.5:9b'), 'split', () => [msg('u2', 'user', 'And again?'), msg('b2', 'assistant', 'Yes')]);
  assert.deepEqual(splitThread(split).map((m) => m.id), ['u1', 'a1', 'u2', 'b2']);
  // Changing one side leaves the other alone.
  assert.deepEqual(split.messages, SAVED.messages);
  // A side that is gone is not brought back by a late answer.
  assert.equal(updateColumn(SAVED, 'split', () => [msg('x', 'assistant', 'late')]), SAVED);
});

test('keeping one side returns an ordinary chat with that model', () => {
  const asked = msg('u2', 'user', 'Shorter?');
  const split = {
    ...startSplit(SAVED, 'qwen3.5:9b'),
    messages: [...SAVED.messages, asked, msg('a2', 'assistant', 'A')],
  };
  split.split = { ...split.split, messages: [asked, msg('b2', 'assistant', 'B')] };

  const first = keepColumn(split, 'main', 5000);
  assert.equal('split' in first, false);
  assert.equal(first.modelName, 'gemma4:12b');
  assert.deepEqual(first.messages.map((m) => m.id), ['u1', 'a1', 'u2', 'a2']);

  const second = keepColumn(split, 'split', 5000);
  assert.equal('split' in second, false);
  assert.equal(second.modelName, 'qwen3.5:9b');
  assert.deepEqual(second.messages.map((m) => m.id), ['u1', 'a1', 'u2', 'b2']);
  assert.equal(second.id, split.id, 'the same chat, so it stays where it was in the list');
  assert.equal(second.summary, SAVED.summary, 'the summary covers the shared start, so it still holds');
  assert.equal(second.updatedAt, 5000);
});

test('each question lines up with both answers, even when one side failed', () => {
  const split = startSplit({ ...SAVED, messages: [] }, 'qwen3.5:9b');
  const u1 = msg('u1', 'user', 'Hi');
  const u2 = msg('u2', 'user', 'Again');
  const failed = msg('e1', 'assistant', 'model requires more system memory', { fromRigMatch: true });
  const both = {
    ...split,
    messages: [u1, msg('a1', 'assistant', 'Hello'), u2, msg('a2', 'assistant', 'Hello again')],
    split: { ...split.split, messages: [u1, failed, u2, msg('b2', 'assistant', 'Hey')] },
  };
  const { shared, turns } = splitTurns(both);
  assert.deepEqual(shared, []);
  assert.deepEqual(turns.map((t) => [t.ask.id, t.main.map((m) => m.id), t.split.map((m) => m.id)]), [
    ['u1', ['a1'], ['e1']],
    ['u2', ['a2'], ['b2']],
  ]);
});

test('what came before the split is shown once, above the rows', () => {
  const split = startSplit(SAVED, 'qwen3.5:9b');
  const { shared, turns } = splitTurns(split);
  assert.deepEqual(shared.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(turns, []);
});

test('asking again starts from the last question', () => {
  const thread = [msg('u1', 'user', 'Hi'), msg('n1', 'assistant', 'note', { fromRigMatch: true }), msg('a1', 'assistant', 'Hello')];
  assert.deepEqual(untilLastAsk(thread).map((m) => m.id), ['u1']);
  assert.equal(untilLastAsk([]), null);
});

const app = readFileSync(new URL('../rigmatch-chat/src/App.tsx', import.meta.url), 'utf8');
/** The body of one `const name = useCallback(...)` in App.tsx. */
const callback = (name) => {
  const start = app.indexOf(`const ${name} = useCallback(`);
  assert.notEqual(start, -1, `${name} not found in App.tsx`);
  return app.slice(start, app.indexOf('\n  }, [', start));
};

test('an answer in flight is named by its chat as well as its side', () => {
  assert.notEqual(streamKey('chat-a', 'split'), streamKey('chat-b', 'split'));
  assert.notEqual(streamKey('chat-a', 'main'), streamKey('chat-a', 'split'));
});

test('Stop and Regenerate in one chat never reach another chat asking the same model', () => {
  // Two chats asking two, both with the same second model: the second chat's
  // newest row showed Stop for the first chat's answer, and stopped it.
  // Every stream, abort and loading note is keyed by chat and side.
  assert.match(app, /const \[streaming, setStreaming\] = useState<Record<string, string>>\(\{\}\);/);
  assert.match(app, /const abortRefs = useRef<Record<string, AbortController>>\(\{\}\);/);
  assert.doesNotMatch(app, /streaming\[column\]|abortRefs\.current\[column\]|loading\[column\]/);
  const answer = callback('answerInColumn');
  assert.match(answer, /const key = streamKey\(conversationId, column\);/);
  assert.match(answer, /abortRefs\.current\[key\] = ctrl;/);
  assert.match(callback('stopColumns'), /columns\.map\(\(column\) => streamKey\(conversationId, column\)\)/);
  assert.match(callback('regenerate'), /if \(streaming\[streamKey\(target\.id, column\)\]\) continue;/);
  // What the open chat shows comes from its own streams only.
  assert.match(app, /streaming\[streamKey\(activeConversation\.id, column\)\]/);
  assert.match(app, /const answering = newest && answeringHere\(column\) !== null;/);
  assert.match(app, /else if \(activeConversation\) stopColumns\(activeConversation\.id, \[column\]\);/);
});

test('choosing the second model takes a press of Add, and focus is never dropped', () => {
  // An arrow key in the list fires change in Chromium; it must only move the
  // choice, not start a chat with a model nobody picked.
  assert.match(app, /onChange=\{\(event\) => setSecondChoice\(event\.target\.value\)\}/);
  assert.match(app, /onClick=\{\(\) => askSecondModel\(chosenSecond\)\}/);
  assert.match(callback('askSecondModel'), /composeRef\.current\?\.focus\(\);/);
  // Keep this one takes the columns, and the button, away.
  assert.match(callback('keepOne'), /composeRef\.current\?\.focus\(\);/);
  // Stop and Regenerate are one button, so focus stays on it as it changes.
  assert.match(app, /\{answering \? "Stop" : "Regenerate"\}/);
});

test('Chat offers asking two and lays the answers side by side', () => {
  const css = readFileSync(new URL('../rigmatch-chat/src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /Ask a second model too/);
  assert.match(app, /Keep this one/);
  assert.match(app, /Regenerate both/);
  // Stacked when the chat is too narrow for two readable columns.
  assert.match(css, /@container[^{]*\{\s*\.rm-split-row\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
});
