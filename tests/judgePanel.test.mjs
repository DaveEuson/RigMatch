// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { judgeNote, JUDGE_SPREAD_FLAG as RENDERER_FLAG } from '../src/lib/answerRetest.ts';
import { sheetSummary } from '../src/lib/runSheet.ts';

const { JUDGE_SPREAD_FLAG, secondJudge, combineMarks } = createRequire(import.meta.url)('../electron/judgePanel.cjs');

test('the second judge is the next different model, of the same kind for a drawing', async () => {
  const candidates = ['gemma3:12b', 'qwen3:14b', 'gemma4:12b'];
  assert.equal(await secondJudge('gemma3:12b', candidates), 'qwen3:14b');
  assert.equal(await secondJudge('qwen3:14b', candidates), 'gemma3:12b');
  // A drawing: picture judges are only paired with picture judges.
  const sees = new Set(['gemma3:12b', 'gemma4:12b']);
  const sameKindAs = (primary) => async (name) => sees.has(name) === sees.has(primary);
  assert.equal(await secondJudge('gemma3:12b', candidates, sameKindAs('gemma3:12b')), 'gemma4:12b');
  // The only code reader has no partner: it marks alone.
  assert.equal(await secondJudge('qwen3:14b', candidates, sameKindAs('qwen3:14b')), null);
  // Nobody else installed.
  assert.equal(await secondJudge('gemma3:12b', ['gemma3:12b']), null);
  assert.equal(await secondJudge('gemma3:12b', undefined), null);
});

test('two marks are averaged, and how far apart they were is kept', () => {
  assert.deepEqual(combineMarks([{ judge: 'a', score: 90 }, { judge: 'b', score: 61 }]), { score: 76, spread: 29 });
  assert.deepEqual(combineMarks([{ judge: 'a', score: 85 }]), { score: 85, spread: 0 }, 'one judge: its own mark');
  assert.equal(combineMarks([]), null, 'no mark: the answer keeps its rule score');
  assert.equal(combineMarks(undefined), null);
});

test('the answer says who marked it, and calls a wide gap rough', () => {
  assert.equal(RENDERER_FLAG, JUDGE_SPREAD_FLAG, 'the renderer and the main process flag the same gap');
  const answer = (judgeMarks) => ({ id: 'q', label: 'Q', prompt: '', elapsedMs: 0, tokensPerSecond: 0, sobrietyScore: 0, response: '', doneReason: 'stop', judgeMarks });
  assert.equal(judgeNote(answer([{ judge: 'gemma3:12b', score: 90 }, { judge: 'qwen3:14b', score: 82 }])), 'Marked by gemma3:12b (90) and qwen3:14b (82), averaged.');
  assert.match(judgeNote(answer([{ judge: 'gemma3:12b', score: 85 }, { judge: 'gemma4:12b', score: 35 }])), /50 points apart, so read this mark as rough\./);
  assert.equal(judgeNote(answer(undefined)), null);
  assert.equal(judgeNote(answer([{ judge: 'gemma3:12b', score: 85 }])), null, 'one judge: nothing to compare');
});

test('the run sheet names both judges, and never doubles a cloud judge', () => {
  const base = {
    quick: false, skillsOnly: false, questions: [], questionCount: 10, judgedInPlan: 4,
    judgeActive: true, judgeModel: 'gemma3:12b', cloudName: 'Claude', judgeFallback: false,
    sameAsContestant: () => false, ownPicture: false, nameOf: (model) => model,
  };
  assert.match(sheetSummary({ ...base, choice: 'built-in', autoJudge: 'gemma3:12b', secondJudge: 'qwen3:14b' }).marked,
    /^Rules, plus gemma3:12b and qwen3:14b, averaged, for the 4 open-ended answers$/);
  assert.equal(sheetSummary({ ...base, choice: 'local', secondJudge: 'qwen3:14b' }).marked, 'gemma3:12b and qwen3:14b, averaged, on this computer');
  assert.equal(sheetSummary({ ...base, choice: 'local' }).marked, 'gemma3:12b, on this computer', 'one judge, as before');
  assert.equal(sheetSummary({ ...base, choice: 'cloud', secondJudge: undefined }).marked, 'Claude, through OpenRouter');
});
