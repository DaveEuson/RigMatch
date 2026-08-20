// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_QUESTIONS_FOR_VERDICT,
  TASK_GROUPS,
  bestModelForTask,
  findTaskWinners,
  isVerdictWorthy,
  needsJudge,
  summarizeTaskScores,
} from '../src/lib/taskScores.ts';

/**
 * The benchmark already asked typed questions and already scored every answer,
 * but the two were never joined — the breakdown was averaged away, so
 * "Best for coding" came from keyword-matching a curated list of specialties.
 * That is generic knowledge about a model, and says nothing about the machine.
 */
const prompt = (type, sobrietyScore, status = 'ok') => ({
  id: `${type}-${sobrietyScore}-${Math.random()}`,
  label: type,
  type,
  prompt: 'q',
  elapsedMs: 100,
  tokensPerSecond: 40,
  sobrietyScore,
  response: 'a',
  doneReason: 'stop',
  status,
});

test('per-question scores are grouped by what the question tested', () => {
  const scores = summarizeTaskScores([
    prompt('coding', 90), prompt('coding', 80), prompt('coding', 70),
    prompt('assistant', 60), prompt('assistant', 40),
    prompt('truth', 55),
    // json crowns the tools goal; format alone measures instruction-following.
    prompt('json', 100), prompt('format', 80),
  ]);

  // `graded` counts answers something could actually mark; these fixtures
  // carry no scoredBy, which is how an older run looks, and those are trusted
  // rather than retroactively doubted.
  assert.deepEqual(scores.coding, { score: 80, questions: 3, graded: 3 });
  assert.deepEqual(scores.chat, { score: 50, questions: 2, graded: 2 });
  assert.deepEqual(scores.facts, { score: 55, questions: 1, graded: 1 });
  assert.deepEqual(scores.tools, { score: 100, questions: 1, graded: 1 });
  assert.deepEqual(scores.instructions, { score: 80, questions: 1, graded: 1 });
});

test('runs from before question types were kept produce nothing, not a guess', () => {
  // The alternative would be a confident average over unknown material.
  const untyped = [{ ...prompt('coding', 90), type: undefined }];
  assert.deepEqual(summarizeTaskScores(untyped), {});
  assert.deepEqual(summarizeTaskScores([]), {});
});

test('questions the model never answered do not count against its ability', () => {
  // A timeout or a dead model is a stability problem, which is scored
  // separately — folding it in here would call a model bad at coding when it
  // was actually just not running.
  const scores = summarizeTaskScores([
    prompt('coding', 90), prompt('coding', 88), prompt('coding', 92),
    prompt('coding', 0, 'no-response'),
    prompt('coding', 0, 'failed'),
  ]);
  assert.deepEqual(scores.coding, { score: 90, questions: 3, graded: 3 });

  // A truncated answer is a real answer that ran out of room, so it counts.
  const truncated = summarizeTaskScores([prompt('format', 40, 'truncated'), prompt('format', 60)]);
  assert.deepEqual(truncated.instructions, { score: 50, questions: 2, graded: 2 });
});

test('a single question is not a verdict', () => {
  assert.equal(isVerdictWorthy({ score: 99, questions: 1 }), false);
  assert.equal(isVerdictWorthy({ score: 99, questions: MIN_QUESTIONS_FOR_VERDICT }), true);
  assert.equal(isVerdictWorthy(undefined), false);
});

test('a task winner needs a real margin over the runner-up', () => {
  // These scores come from a heuristic judge. Two models a point apart are
  // indistinguishable, and picking between them would be inventing a result.
  const close = findTaskWinners({
    a: { coding: { score: 82, questions: 5 } },
    b: { coding: { score: 80, questions: 5 } },
  });
  assert.deepEqual(close, [], 'two points apart is not a finding');

  const clear = findTaskWinners({
    a: { coding: { score: 92, questions: 5 } },
    b: { coding: { score: 70, questions: 5 } },
  });
  assert.equal(clear.length, 1);
  assert.equal(clear[0].model, 'a');
  assert.equal(clear[0].margin, 22);
  assert.equal(clear[0].label, 'Coding');
});

test('the only model scored at a task wins it outright', () => {
  // There is nothing to be separated from, so the margin rule cannot apply.
  const winners = findTaskWinners({
    a: { coding: { score: 60, questions: 4 } },
    b: { chat: { score: 90, questions: 4 } },
  });
  assert.deepEqual(
    winners.map((w) => [w.task, w.model, w.margin]),
    [['coding', 'a', 0], ['chat', 'b', 0]],
  );
});

test('thinly-tested models are left out of the running entirely', () => {
  const winners = findTaskWinners({
    a: { coding: { score: 99, questions: 1 } },
    b: { coding: { score: 70, questions: 6 } },
  });
  assert.equal(winners.length, 1);
  assert.equal(winners[0].model, 'b', 'six questions at 70 beats one at 99');
});

test('routing picks from what is installed, not from every score on file', () => {
  const byModel = {
    'deleted:7b': { coding: { score: 99, questions: 5 } },
    'llama3.2:3b': { coding: { score: 80, questions: 5 } },
  };
  assert.deepEqual(
    bestModelForTask(byModel, 'coding', ['llama3.2:3b']),
    { model: 'llama3.2:3b', score: 80 },
    'a model no longer installed cannot be routed to',
  );
  assert.equal(bestModelForTask(byModel, 'chat', ['llama3.2:3b']), null, 'nothing measured for that task');
  assert.equal(bestModelForTask({}, 'coding', ['llama3.2:3b']), null);
});

test('every benchmark question type is covered by exactly one group', () => {
  // A type belonging to no group would be silently dropped; one belonging to
  // two would be double-counted.
  const seen = TASK_GROUPS.flatMap((g) => g.questionTypes);
  assert.deepEqual([...seen].sort(), ['assistant', 'coding', 'format', 'json', 'truth', 'writing']);
  assert.equal(new Set(seen).size, seen.length, 'no question type in two groups');
});

test('the default ten-question run is too thin for any per-task verdict', async () => {
  // A real product constraint, pinned so it is not discovered by a user. The
  // default run asks two questions of each of the five types, and since json
  // split out of instructions into its own tools group, no group reaches the
  // three answers a verdict needs. Twenty questions is the honest minimum.
  const { DEFAULT_BENCHMARK_QUESTIONS } = await import('../src/benchmarkSuite.ts');
  const asResults = (questions) => questions.map((q) => ({
    id: q.id, label: q.label, type: q.type, prompt: q.prompt,
    elapsedMs: 100, tokensPerSecond: 40, sobrietyScore: 80,
    response: 'a', doneReason: 'stop', status: 'ok',
  }));

  const ten = summarizeTaskScores(asResults(DEFAULT_BENCHMARK_QUESTIONS));
  assert.equal(ten.coding.questions, 2);
  assert.equal(ten.tools.questions, 2, 'json stands alone as the tools group');
  assert.equal(ten.instructions.questions, 2, 'format alone measures instruction-following');
  assert.deepEqual(
    Object.entries(ten).filter(([, v]) => isVerdictWorthy(v)).map(([k]) => k),
    [],
    'at ten questions nothing is worth calling a verdict',
  );

  // Twenty — the next level up — clears the bar for all five.
  const twenty = summarizeTaskScores(asResults([...DEFAULT_BENCHMARK_QUESTIONS, ...DEFAULT_BENCHMARK_QUESTIONS]));
  assert.deepEqual(
    Object.entries(twenty).filter(([, v]) => isVerdictWorthy(v)).map(([k]) => k).sort(),
    ['chat', 'coding', 'facts', 'instructions', 'tools'],
  );
});

test('a score nothing could grade is not a verdict, however many answers', () => {
  // The quiet version of the bug: chat answers are scored by character count
  // when no judge is running, so "best for talking" went to the wordiest model.
  // Enough answers is not enough — something has to have marked them.
  const ungraded = { score: 88, questions: 6, graded: 0 };
  assert.equal(isVerdictWorthy(ungraded), false);
  assert.equal(needsJudge(ungraded), true, 'and the UI should offer the judge');

  const graded = { score: 88, questions: 6, graded: 6 };
  assert.equal(isVerdictWorthy(graded), true);
  assert.equal(needsJudge(graded), false);

  // Too few answers is a different problem, and not one the judge fixes.
  assert.equal(needsJudge({ score: 90, questions: 1, graded: 0 }), false);
});

test('unjudged answers are counted out of graded, judged ones in', () => {
  const mixed = summarizeTaskScores([
    { ...prompt('assistant', 90), scoredBy: 'unjudged' },
    { ...prompt('assistant', 80), scoredBy: 'unjudged' },
    { ...prompt('assistant', 70), scoredBy: 'judge' },
  ]);
  assert.equal(mixed.chat.questions, 3);
  assert.equal(mixed.chat.graded, 1, 'only the judged answer was actually marked');
  assert.equal(isVerdictWorthy(mixed.chat), false, 'one real mark is not three');
});
