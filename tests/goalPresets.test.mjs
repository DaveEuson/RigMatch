import test from 'node:test';
import assert from 'node:assert/strict';

import { BENCHMARK_PRESETS, buildBenchmarkPromptPlan } from '../src/benchmarkSuite.ts';
import { GOALS, presetIdForGoal, goalById } from '../src/lib/goals.ts';
import { summarizeTaskScores, isVerdictWorthy, needsJudge } from '../src/lib/taskScores.ts';
import { heuristicCanGrade } from '../electron/benchmarkScoring.cjs';

/** Score a preset the way a real run would, so "does this crown the goal?" is measurable. */
const runPreset = (presetId, questionCount, judged) => {
  const preset = BENCHMARK_PRESETS.find((entry) => entry.id === presetId);
  assert.ok(preset, `no preset "${presetId}"`);
  const plan = buildBenchmarkPromptPlan(questionCount, preset.questions);
  return summarizeTaskScores(plan.map((q) => ({
    id: q.id, label: q.label, type: q.type, prompt: q.prompt,
    elapsedMs: 100, tokensPerSecond: 40, sobrietyScore: 80,
    response: 'a', doneReason: 'stop', status: 'ok',
    scoredBy: judged ? 'judge' : (heuristicCanGrade(q.type, q.prompt) ? 'heuristic' : 'unjudged'),
  })));
};

test('every question-graded goal maps to a focus, and lab goals map to none', () => {
  for (const goal of GOALS) {
    const presetId = presetIdForGoal(goal.id);
    if (goal.grading === 'questions') {
      assert.ok(presetId, `${goal.id} is graded by questions but has no focus to ask them`);
      assert.ok(BENCHMARK_PRESETS.some((p) => p.id === presetId), `${goal.id} maps to unknown preset "${presetId}"`);
    } else {
      assert.equal(presetId, undefined, `${goal.id} is not question-graded, so a focus cannot help it`);
    }
  }
});

test('each focus actually crowns the goal it is mapped to', () => {
  // The whole point of the wiring: a focused run should reach the three
  // marked answers a verdict needs, where the General suite would not.
  const cases = [
    { goal: 'code', group: 'coding' },
    { goal: 'talk', group: 'chat' },
    { goal: 'write', group: 'writing' },
    { goal: 'use-tools', group: 'tools' },
  ];
  for (const { goal, group } of cases) {
    const scores = runPreset(presetIdForGoal(goal), 20, true);
    assert.ok(isVerdictWorthy(scores[group]),
      `the ${goal} focus does not crown ${group} even at 20 questions with a judge`);
  }
});

test('the tools focus crowns automations in a single ten-question run', () => {
  // json is heuristic-gradeable, so this one needs no judge — which matters,
  // because the tools goal is the reason a lot of people run a local model.
  const scores = runPreset('tools', 10, false);
  assert.ok(isVerdictWorthy(scores.tools), 'ten questions of the tools focus should be enough');
  assert.ok(scores.tools.graded >= 3);
});

test('prose focuses are honest that they need the judge', () => {
  // Chat and writing questions have no heuristic behind them. The focus asks
  // plenty of them; marking them is a separate problem, and the app says so
  // rather than crowning on a length proxy.
  for (const [goal, group] of [['talk', 'chat'], ['write', 'writing']]) {
    const unjudged = runPreset(presetIdForGoal(goal), 20, false);
    assert.equal(isVerdictWorthy(unjudged[group]), false, `${group} must not crown unjudged`);
    assert.equal(needsJudge(unjudged[group]), true, `${group} should point at the judge`);

    const judged = runPreset(presetIdForGoal(goal), 20, true);
    assert.ok(isVerdictWorthy(judged[group]), `${group} should crown once judged`);
  }
});

test('the coding focus crowns without a judge at twenty questions', () => {
  // Two of its coding questions are the clamp prompt, which the heuristic can
  // mark; doubled at 20 that is four marked answers, over the bar.
  const scores = runPreset('coding', 20, false);
  assert.ok(isVerdictWorthy(scores.coding), 'four marked coding answers should be a verdict');
});

test('the goal desire is what the suggestion names, not an internal id', () => {
  // The button reads "Focus on <desire>", so the desire has to be a phrase
  // that survives being dropped into a sentence.
  for (const goal of GOALS.filter((g) => presetIdForGoal(g.id))) {
    const desire = goalById(goal.id).desire;
    assert.ok(desire.length > 8 && desire[0] === desire[0].toUpperCase(), goal.id);
  }
});
