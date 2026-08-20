// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSessionNote } from '../rigmatch-chat/src/lib/sessionNote.ts';

/**
 * Asked "how many chats have we had together?" from the second of two threads,
 * llama3.2:3b replied "this is our first chat together". Nothing was broken —
 * measured, the same request sends the prior turn and the model recalls a fact
 * planted one turn earlier. The question was about the application, which the
 * model has no way to see, so it invented an answer.
 */
const NOW = Date.UTC(2026, 7, 10, 17, 32);
const day = 24 * 60 * 60 * 1000;

test('the model is told how many conversations it cannot see', () => {
  const note = buildSessionNote({ threadCount: 3, startedAt: NOW - 60_000, now: NOW });
  assert.match(note, /1 of 3 separate conversations/);
  assert.match(note, /cannot read the other 2/);
  assert.match(note, /say so rather than guessing/);
});

test('what it CAN see is stated, not only what it cannot', () => {
  // Measured against llama3.2:3b: a note carrying only the prohibition made it
  // cautious about its own transcript — it answered "your first message was
  // Test" and then undermined it with "but I don't know what you said before
  // that". Affirming the normal case removed the hedge.
  const note = buildSessionNote({ threadCount: 2, startedAt: NOW - 60_000, now: NOW });
  assert.match(note, /read all of this conversation normally/);
});

test('the other conversations are counted and pluralised properly', () => {
  // "You cannot read the other 1" is exactly the phrasing a model writes back
  // out verbatim.
  assert.match(buildSessionNote({ threadCount: 2, startedAt: NOW, now: NOW }), /the other one/);
  assert.match(buildSessionNote({ threadCount: 5, startedAt: NOW, now: NOW }), /the other 4/);
});

test('a lone conversation does not claim there are others', () => {
  const note = buildSessionNote({ threadCount: 1, startedAt: NOW - 60_000, now: NOW });
  assert.match(note, /only conversation with you/);
  assert.doesNotMatch(note, /separate conversations/);
  assert.doesNotMatch(note, /cannot read/, 'nothing to be unable to read');
  assert.doesNotMatch(note, /\b1 separate\b/, 'must never read as "1 separate conversations"');
});

test('when it started is described the way a person would say it', () => {
  const when = (startedAt) => buildSessionNote({ threadCount: 1, startedAt, now: NOW });
  assert.match(when(NOW - 60_000), /earlier today/);
  assert.match(when(NOW - 30 * 60 * 1000), /earlier today/);
  assert.match(when(NOW - 1.2 * day), /yesterday/);
  assert.match(when(NOW - 4 * day), /4 days ago/);
  // Anything older gets a real date. Asserted without assuming day-first or
  // month-first, since the format follows whatever locale the machine uses.
  const old = when(NOW - 40 * day);
  assert.match(old, /began on .*2026/);
  assert.match(old, /Jul(y)?/, 'should name the month');
});

test('a clock that has gone backwards does not produce nonsense', () => {
  // Machine clocks move. "began in -3 days" would be worse than vague.
  const note = buildSessionNote({ threadCount: 1, startedAt: NOW + day, now: NOW });
  assert.match(note, /recently/);
  assert.doesNotMatch(note, /-/);
});

test('the note stays small enough to ride on every request', () => {
  // It is prepended to every single message, so its cost is paid over and over.
  const note = buildSessionNote({ threadCount: 12, startedAt: NOW - 400 * day, now: NOW });
  assert.ok(note.length < 400, `too long at ${note.length} characters`);
  // Roughly a couple of dozen tokens.
  assert.ok(Math.ceil(note.length / 4) < 100);
});
