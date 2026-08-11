import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MEMORIES,
  MAX_MEMORY_LENGTH,
  MEMORY_STORE_VERSION,
  MEMORY_TOKEN_BUDGET,
  addMemory,
  buildMemoryNote,
  parseMemories,
  removeMemory,
  serializeMemories,
  setMemoryEnabled,
  updateMemory,
} from '../rigmatch-chat/src/lib/memory.ts';

const NOW = 1_770_000_000_000;
const mem = (id, text, extra = {}) => ({ id, text, createdAt: NOW, enabled: true, ...extra });

test('a fact is kept, and adding it twice does not double it', () => {
  // "Remember this" on the same message twice is an easy accident, and a
  // duplicate both wastes budget and reads as though it were said twice.
  let list = addMemory([], 'I prefer Python over JavaScript', { id: 'a', now: NOW });
  list = addMemory(list, 'I prefer Python over JavaScript', { id: 'b', now: NOW });
  list = addMemory(list, 'i PREFER python over javascript', { id: 'c', now: NOW });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'a', 'the original is kept, not replaced');
});

test('whitespace is normalised so a copied message is one tidy line', () => {
  const list = addMemory([], '  I use   PostgreSQL\n\nnot MySQL  ', { id: 'a', now: NOW });
  assert.equal(list[0].text, 'I use PostgreSQL not MySQL');
});

test('empty text is not a memory', () => {
  assert.deepEqual(addMemory([], '   ', { id: 'a', now: NOW }), []);
  assert.deepEqual(addMemory([], '', { id: 'a', now: NOW }), []);
});

test('an over-long selection is clipped rather than carried on every request', () => {
  const list = addMemory([], 'x'.repeat(5000), { id: 'a', now: NOW });
  assert.equal(list[0].text.length, MAX_MEMORY_LENGTH);
});

test('the list is capped, and the oldest are the ones that go', () => {
  // The newest statement is the one most likely to still be true.
  let list = [];
  for (let i = 0; i < MAX_MEMORIES + 5; i++) {
    list = addMemory(list, `fact ${i}`, { id: `id-${i}`, now: NOW + i });
  }
  assert.equal(list.length, MAX_MEMORIES);
  assert.equal(list[0].text, 'fact 5', 'the first five dropped off the front');
  assert.equal(list[list.length - 1].text, `fact ${MAX_MEMORIES + 4}`);
});

test('editing to nothing deletes, rather than leaving a blank row', () => {
  const list = [mem('a', 'first'), mem('b', 'second')];
  assert.deepEqual(updateMemory(list, 'a', 'changed')[0].text, 'changed');
  assert.deepEqual(updateMemory(list, 'a', '   ').map((m) => m.id), ['b']);
  assert.deepEqual(removeMemory(list, 'b').map((m) => m.id), ['a']);
});

test('one can be silenced without being deleted', () => {
  const list = setMemoryEnabled([mem('a', 'noisy')], 'a', false);
  assert.equal(list[0].enabled, false);
  assert.equal(list.length, 1, 'still on the list');
  assert.equal(buildMemoryNote(list), null, 'but not sent');
});

test('the note carries the facts, oldest first', () => {
  const note = buildMemoryNote([mem('a', 'I use PostgreSQL'), mem('b', 'I prefer short answers')]);
  assert.match(note.text, /asked you to remember/);
  assert.ok(
    note.text.indexOf('PostgreSQL') < note.text.indexOf('short answers'),
    'reads as a history, not a reverse-chronological feed',
  );
  assert.equal(note.used, 2);
  assert.equal(note.omitted, 0);
});

test('nothing to say produces no block at all', () => {
  // An empty header would still cost tokens on every single request.
  assert.equal(buildMemoryNote([]), null);
  assert.equal(buildMemoryNote([mem('a', '   ')]), null);
  assert.equal(buildMemoryNote([mem('a', 'x', { enabled: false })]), null);
});

test('memory cannot quietly eat the context window', () => {
  // The problem it sits next to. Without a budget this recreates it.
  const many = Array.from({ length: 100 }, (_, i) => mem(`id-${i}`, `fact number ${i} `.repeat(12)));
  const note = buildMemoryNote(many);
  assert.ok(note.tokens <= MEMORY_TOKEN_BUDGET + 200, `budget overrun: ${note.tokens}`);
  assert.ok(note.omitted > 0, 'and it reports what did not fit');
  assert.equal(note.used + note.omitted, 100);
});

test('when the budget bites, the newest facts are the ones kept', () => {
  const many = Array.from({ length: 60 }, (_, i) => mem(`id-${i}`, `fact ${i} ${'padding '.repeat(20)}`));
  const note = buildMemoryNote(many);
  assert.match(note.text, /fact 59/, 'the most recent must survive');
  assert.doesNotMatch(note.text, /fact 0 /, 'the oldest is the one to drop');
});

test('a single fact larger than the whole budget is still sent', () => {
  // Better to exceed the budget than to silently remember nothing at all.
  const note = buildMemoryNote([mem('a', 'x'.repeat(MAX_MEMORY_LENGTH))], 10);
  assert.equal(note.used, 1);
});

test('memories round-trip, and a foreign file is refused', () => {
  const list = [mem('a', 'I use PostgreSQL'), mem('b', 'quiet', { enabled: false })];
  const reread = parseMemories(serializeMemories(list));
  assert.deepEqual(reread, list);
  assert.equal(JSON.parse(serializeMemories(list)).version, MEMORY_STORE_VERSION);

  assert.equal(parseMemories(null), null);
  assert.equal(parseMemories('{oh no'), null);
  assert.equal(parseMemories(JSON.stringify({ version: 99, memories: [] })), null);
  assert.equal(parseMemories(JSON.stringify({ version: MEMORY_STORE_VERSION })), null);
});

test('junk entries are dropped without taking the good ones with them', () => {
  const raw = JSON.stringify({
    version: MEMORY_STORE_VERSION,
    memories: [mem('a', 'kept'), { id: 'b' }, null, { text: 42 }, mem('c', '   ')],
  });
  const parsed = parseMemories(raw);
  assert.deepEqual(parsed.map((m) => m.text), ['kept']);
});
