// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KEEP_RECENT_MESSAGES,
  KEEP_RECENT_TOKENS,
  MIN_KEEP_RECENT,
  MIN_MESSAGES_TO_COMPACT,
  buildContextMessages,
  buildSummaryRequest,
  compactionSplit,
  continuationTitle,
  pickSummarizer,
} from '../rigmatch-chat/src/lib/compaction.ts';

const msg = (role, content, ts = 1) => ({ id: `${role}-${content}`, role, content, ts });
const conversation = (n) => Array.from({ length: n }, (_, i) =>
  msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`, i));

test('compaction folds away everything but the recent turns', () => {
  // The last few exchanges carry what is being discussed right now; a summary
  // is a poor substitute for them.
  assert.equal(compactionSplit(conversation(20), 0), 20 - KEEP_RECENT_MESSAGES);
  assert.equal(compactionSplit(conversation(10), 0), 10 - KEEP_RECENT_MESSAGES);
});

test('very long recent messages do not defeat the point of compacting', () => {
  // Measured: with a fixed count, six enormous recent replies left the prompt
  // only 20% smaller — not worth the generation it cost to produce.
  const huge = (i) => msg(i % 2 === 0 ? 'user' : 'assistant', 'word '.repeat(1200), i);
  const messages = Array.from({ length: 12 }, (_, i) => huge(i));

  const split = compactionSplit(messages, 0);
  assert.ok(split > 12 - KEEP_RECENT_MESSAGES, 'should keep fewer than the count cap when they are huge');
  assert.equal(split, 12 - MIN_KEEP_RECENT, 'down to the floor of one exchange');

  // The kept tail must still be bounded by the budget it was given.
  const kept = messages.slice(split).reduce((n, m) => n + Math.ceil(m.content.length / 4), 0);
  assert.ok(kept > KEEP_RECENT_TOKENS, 'a single exchange may exceed it, which is why there is a floor');
});

test('short recent messages still keep the full count', () => {
  const messages = conversation(20);
  assert.equal(compactionSplit(messages, 0), 20 - KEEP_RECENT_MESSAGES);
});

test('a short conversation is left alone', () => {
  for (let n = 0; n < MIN_MESSAGES_TO_COMPACT; n++) {
    assert.equal(compactionSplit(conversation(n), 0), null, `${n} messages should not compact`);
  }
  // Long enough to qualify, but everything would be kept verbatim anyway.
  assert.equal(compactionSplit(conversation(KEEP_RECENT_MESSAGES), 0), null);
});

test('compacting twice must fold in something new', () => {
  // Otherwise a second press burns a generation replacing a summary with a
  // summary of the same messages.
  const first = compactionSplit(conversation(20), 0);
  assert.equal(compactionSplit(conversation(20), first), null, 'nothing new to add');
  assert.equal(compactionSplit(conversation(26), first), 26 - KEEP_RECENT_MESSAGES, 'six more messages, so worth it');
});

test('the summary request carries the earlier turns and any previous summary', () => {
  const messages = [msg('user', 'budget is 4800'), msg('assistant', 'noted'), msg('user', 'due March 14'), msg('assistant', 'ok')];
  const plain = buildSummaryRequest(messages, 2);
  assert.equal(plain[0].role, 'system');
  assert.match(plain[1].content, /User: budget is 4800/);
  assert.match(plain[1].content, /Assistant: noted/);
  assert.doesNotMatch(plain[1].content, /due March 14/, 'must not summarise turns it is keeping');

  // A second pass has to build on the first, or whatever the first covered is
  // silently lost.
  const chained = buildSummaryRequest(messages, 4, 'earlier: budget 4800');
  assert.match(chained[1].content, /earlier: budget 4800/);
  assert.match(chained[1].content, /due March 14/);
});

test('what gets sent is the summary plus the turns it does not cover', () => {
  const messages = conversation(10);
  const sent = buildContextMessages(messages, 'notes about m0-m3', 4);

  assert.equal(sent[0].role, 'system', 'the summary is background, not something the user said');
  assert.match(sent[0].content, /notes about m0-m3/);
  assert.deepEqual(sent.slice(1).map((m) => m.content), ['m4', 'm5', 'm6', 'm7', 'm8', 'm9']);
  // Ollama truncates from the front of the conversation and keeps system
  // messages, so a summary placed here survives a window that fills up again.
  assert.equal(sent.length, 7);
});

test('an uncompacted conversation is sent exactly as it stands', () => {
  const messages = conversation(4);
  assert.deepEqual(buildContextMessages(messages, undefined, 0).map((m) => m.content), ['m0', 'm1', 'm2', 'm3']);
});

test('a thread branched from another carries the summary with no messages of its own', () => {
  // Its summarizedCount is 0 because it has covered none of *its* messages —
  // it has none. Gating the summary on that count instead of on the summary
  // existing would make a brand new branch forget everything it was started
  // from, which is the entire reason it exists.
  const fresh = buildContextMessages([], 'everything decided so far', 0);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].role, 'system');
  assert.match(fresh[0].content, /everything decided so far/);

  const afterFirstReply = buildContextMessages(conversation(2), 'everything decided so far', 0);
  assert.deepEqual(afterFirstReply.map((m) => m.role), ['system', 'user', 'assistant']);
});

test('a count larger than the conversation cannot drop turns that are not there', () => {
  const sent = buildContextMessages(conversation(3), 'notes', 99);
  assert.deepEqual(sent.map((m) => m.role), ['system'], 'everything covered, nothing left to append');
});

test('the summariser is ranked on answer quality, not the headline score', () => {
  // The headline total is a composite in which speed carries a large share, so
  // on a real rig the highest-scoring model is usually the smallest and fastest.
  // Ranking by it picked qwen2.5:0.5b over llama3.2:3b and produced a summary
  // that echoed the transcript back and dropped a fact. Sobriety is RigMatch's
  // answer-quality measure and puts them the right way round.
  const installed = ['qwen2.5:0.5b', 'llama3.2:3b'];
  const scores = {
    'qwen2.5:0.5b': { total: 95, speed: 100, sobriety: 60 },
    'llama3.2:3b': { total: 86, speed: 100, sobriety: 85 },
  };
  assert.deepEqual(
    pickSummarizer('qwen2.5:0.5b', installed, scores),
    { model: 'llama3.2:3b', borrowed: true },
    'the lower total but higher quality model should write the summary',
  );
  assert.deepEqual(
    pickSummarizer('llama3.2:3b', installed, scores),
    { model: 'llama3.2:3b', borrowed: false },
    'already on the better one',
  );
});

test('a marginal quality gain is not worth loading another model', () => {
  // Real scores on one rig cluster between 78 and 92, so without a threshold
  // this would swap models constantly for no measurable benefit.
  const installed = ['a', 'b'];
  assert.deepEqual(
    pickSummarizer('a', installed, { a: { sobriety: 90 }, b: { sobriety: 92 } }),
    { model: 'a', borrowed: false },
    'two points is not worth a model load',
  );
  assert.deepEqual(
    pickSummarizer('a', installed, { a: { sobriety: 60 }, b: { sobriety: 92 } }),
    { model: 'b', borrowed: true },
  );
});

test('with nothing scored, the current model does its own summarising', () => {
  assert.deepEqual(pickSummarizer('llama3.2:3b', ['llama3.2:3b', 'other'], {}), { model: 'llama3.2:3b', borrowed: false });
  assert.deepEqual(pickSummarizer('llama3.2:3b', [], {}), { model: 'llama3.2:3b', borrowed: false });
  // A model that is scored but no longer installed must not be picked.
  assert.deepEqual(
    pickSummarizer('llama3.2:3b', ['llama3.2:3b'], { 'deleted:7b': { sobriety: 99 } }),
    { model: 'llama3.2:3b', borrowed: false },
  );
});

test('branched threads number themselves rather than piling up suffixes', () => {
  assert.equal(continuationTitle('Rotating a Postgres password'), 'Rotating a Postgres password (2)');
  assert.equal(continuationTitle('Rotating a Postgres password (2)'), 'Rotating a Postgres password (3)');
  assert.equal(continuationTitle('Rotating a Postgres password (9)'), 'Rotating a Postgres password (10)');
});

test('the summariser prefers what was measured for instruction-following', () => {
  // Summarising is following an instruction about a body of text. The
  // benchmark asks instruction questions and scores each answer, so that is a
  // far better description of the job than an average over every kind of
  // question — a model can be strong overall and careless about doing exactly
  // as it is told.
  const installed = ['careful:3b', 'strong-overall:7b'];
  const scores = {
    'careful:3b': { sobriety: 70, taskScores: { instructions: { score: 95, questions: 4 } } },
    'strong-overall:7b': { sobriety: 88, taskScores: { instructions: { score: 60, questions: 4 } } },
  };
  assert.deepEqual(
    pickSummarizer('strong-overall:7b', installed, scores),
    { model: 'careful:3b', borrowed: true },
    'the higher overall score should lose to the measured instruction score',
  );
});

test('a thin measurement falls back to the overall quality score', () => {
  // One or two questions is not a finding, so it must not override a score
  // drawn from the whole run.
  const installed = ['a', 'b'];
  const scores = {
    a: { sobriety: 60, taskScores: { instructions: { score: 99, questions: 1 } } },
    b: { sobriety: 90 },
  };
  assert.deepEqual(pickSummarizer('a', installed, scores), { model: 'b', borrowed: true });
});

test('models benchmarked before task scores existed still rank', () => {
  // Every existing install is in this state until it re-runs a benchmark.
  const scores = { a: { sobriety: 60 }, b: { sobriety: 92 } };
  assert.deepEqual(pickSummarizer('a', ['a', 'b'], scores), { model: 'b', borrowed: true });
});
