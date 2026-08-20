// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { getGoalMatches } from '../src/lib/goalMatches.ts';
import { CURRENT_SCORE_SCHEMA_VERSION } from '../src/lib/scoring.ts';

const score = (model, tasks, extra = {}) => ({
  model, total: 90, grade: 'A', speed: 90, sobriety: 90, stability: 90, fit: 90,
  completedAt: '2026-08-13T00:00:00Z', scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
  taskScores: tasks, ...extra,
});

const t = (s) => ({ score: s, questions: 4 });

test('one crown per goal, and the first pick headlines', () => {
  const scores = {
    'qwen2.5-coder:7b': score('qwen2.5-coder:7b', { coding: t(95), chat: t(70) }),
    'llama3.1:8b': score('llama3.1:8b', { coding: t(70), chat: t(92) }),
  };
  const matches = getGoalMatches(['code', 'talk'], scores);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].isMainGoal, true, 'first selected goal leads');
  assert.equal(matches[0].pick.model, 'qwen2.5-coder:7b', 'the coder wins coding');
  assert.equal(matches[1].isMainGoal, false);
  assert.equal(matches[1].pick.model, 'llama3.1:8b', 'the chatter wins talking');
});

test('the tools goal crowns from its own json group, not instructions', () => {
  const scores = {
    'a': score('a', { tools: t(90), instructions: t(10) }),
    'b': score('b', { tools: t(60), instructions: t(99) }),
  };
  const [match] = getGoalMatches(['use-tools'], scores);
  assert.equal(match.pick.model, 'a', 'instruction skill must not decide the tools crown');
  assert.equal(match.pick.taskScore, 90);
});

test('a drifted score cannot wear a goal crown', () => {
  const scores = { 'a': score('a', { coding: t(95) }) };
  const [withDrift] = getGoalMatches(['code'], scores, () => true);
  assert.equal(withDrift.pick, undefined);
  assert.match(withDrift.awaiting, /no measured winner/i);
  const [without] = getGoalMatches(['code'], scores);
  assert.equal(without.pick.model, 'a');
});

test('ungradable goals say why instead of wearing a fake crown', () => {
  const scores = { 'a': score('a', { coding: t(95) }) };
  const byId = Object.fromEntries(
    getGoalMatches(['write', 'transcribe-file', 'transcribe-live'], scores).map((m) => [m.goal.id, m]),
  );
  // Writing is now scored on writing questions, so it awaits a measurement
  // like any other question-graded goal rather than apologising for itself.
  assert.match(byId['write'].awaiting, /no measured winner|mark them/i);
  assert.match(byId['transcribe-file'].awaiting, /Listening Lab/);
  assert.match(byId['transcribe-live'].awaiting, /not possible locally/i);
  for (const match of Object.values(byId)) assert.equal(match.pick, undefined);
});

test('goal crowns are measured-only: no keyword fallback', () => {
  // A score with no taskScores (older run) can top the overall ranking but
  // must not be crowned for a goal it was never measured on.
  const scores = { 'a': score('a', undefined) };
  const [match] = getGoalMatches(['code'], scores);
  assert.equal(match.pick, undefined);
});

test('a goal blocked only by the missing judge says so, and says where to fix it', () => {
  // "Run a test with enough questions" is useless advice when the questions
  // were asked and the scorer simply cannot mark prose.
  const scores = {
    'a': {
      model: 'a', total: 90, grade: 'A', speed: 90, sobriety: 90, stability: 90, fit: 90,
      completedAt: '2026-08-13T00:00:00Z', scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
      taskScores: { chat: { score: 88, questions: 6, graded: 0 } },
    },
  };
  const [talk] = getGoalMatches(['talk'], scores);
  assert.equal(talk.pick, undefined, 'a length proxy must not crown anyone');
  assert.equal(talk.needsJudge, true);
  assert.match(talk.awaiting, /judge/i);
  assert.match(talk.awaiting, /settings/i, 'point at where to turn it on');
});

test('a properly marked goal still crowns normally', () => {
  const scores = {
    'a': {
      model: 'a', total: 90, grade: 'A', speed: 90, sobriety: 90, stability: 90, fit: 90,
      completedAt: '2026-08-13T00:00:00Z', scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
      taskScores: { chat: { score: 88, questions: 6, graded: 6 } },
    },
  };
  const [talk] = getGoalMatches(['talk'], scores);
  assert.equal(talk.pick.model, 'a');
  assert.ok(!talk.needsJudge);
});
