import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The Compare screen's progress arithmetic, mirrored from SimpleWizard so it can
 * be checked directly. Models run one at a time, each answering every question,
 * so the per-model round counter resets while overall progress only rises.
 *
 * Reported from a real 5-model run: solar finished all 10 questions while
 * granite was on its 4th, and the screen read "Round 4 of 10" with the bar near
 * 40% — when the run was 14 of 50 questions in, or 28%.
 */
function progress({ models, questionsPerModel, completedModels, questionIndex, fallbackPercent = 0 }) {
  const round = questionIndex + 1;
  const totalRounds = questionsPerModel ?? 0;
  const modelNumber = Math.min(completedModels + 1, Math.max(1, models));
  const totalQuestions = models * totalRounds;
  const questionsDone = completedModels * totalRounds + (round - 1);
  const overallPercent = totalQuestions > 0
    ? Math.round((questionsDone / totalQuestions) * 100)
    : fallbackPercent;
  return { round, totalRounds, modelNumber, totalQuestions, questionsDone, overallPercent };
}

test('the reported run reads correctly instead of overstating progress', () => {
  // solar done (10/10), granite ANSWERING its 4th of 10, five models total.
  // Questions 1-3 of granite are finished and the 4th is in flight, so 13 are
  // complete — the count is of finished questions, not started ones.
  const p = progress({ models: 5, questionsPerModel: 10, completedModels: 1, questionIndex: 3 });
  assert.equal(p.questionsDone, 13);
  assert.equal(p.totalQuestions, 50);
  assert.equal(p.overallPercent, 26, 'the old bar showed roughly 40%');
  assert.equal(p.modelNumber, 2, 'granite is the second model');
  assert.equal(p.round, 4, 'the per-model round is still 4 — it just says whose');
});

test('overall progress never goes backwards across a whole run', () => {
  // The bug: the round counter reset to 1 four times in a five-model run.
  const models = 5;
  const questionsPerModel = 10;
  let previous = -1;
  const rounds = [];

  for (let completedModels = 0; completedModels < models; completedModels += 1) {
    for (let questionIndex = 0; questionIndex < questionsPerModel; questionIndex += 1) {
      const p = progress({ models, questionsPerModel, completedModels, questionIndex });
      assert.ok(
        p.questionsDone > previous,
        `progress went backwards at model ${completedModels + 1} question ${questionIndex + 1}`,
      );
      previous = p.questionsDone;
      rounds.push(p.round);
    }
  }

  assert.equal(previous, 49, 'the last question of the last model is #49 (0-based done count)');
  // The per-model round DOES still reset — that is correct, and is exactly why
  // it must be labelled with the model it belongs to.
  assert.equal(rounds.filter((r) => r === 1).length, 5, 'each model starts at round 1');
});

test('the bar and the label always agree', () => {
  for (const completedModels of [0, 1, 2, 3, 4]) {
    for (const questionIndex of [0, 5, 9]) {
      const p = progress({ models: 5, questionsPerModel: 10, completedModels, questionIndex });
      const fromLabel = Math.round((p.questionsDone / p.totalQuestions) * 100);
      assert.equal(p.overallPercent, fromLabel, 'the bar must not disagree with its own caption');
    }
  }
});

test('a single-model run still reads sensibly', () => {
  const p = progress({ models: 1, questionsPerModel: 10, completedModels: 0, questionIndex: 4 });
  assert.equal(p.modelNumber, 1);
  assert.equal(p.totalQuestions, 10);
  assert.equal(p.questionsDone, 4);
  assert.equal(p.overallPercent, 40);
});

test('before the run reports question counts, it falls back rather than inventing', () => {
  // questionTotal used to default to the MODEL count, which is a different
  // quantity entirely and produced "Round 1 of 5" for a 10-question suite.
  const p = progress({ models: 5, questionsPerModel: 0, completedModels: 0, questionIndex: 0, fallbackPercent: 12 });
  assert.equal(p.totalQuestions, 0);
  assert.equal(p.overallPercent, 12, 'uses the model-level figure the run did report');
});

test('the final question of the final model is not yet 100%', () => {
  // questionsDone counts COMPLETED questions; the last one is still being asked.
  const p = progress({ models: 5, questionsPerModel: 10, completedModels: 4, questionIndex: 9 });
  assert.equal(p.questionsDone, 49);
  assert.equal(p.overallPercent, 98);
  assert.equal(p.modelNumber, 5, 'must not report a sixth model');
});

test('modelNumber never exceeds the lineup, even once every model is done', () => {
  const p = progress({ models: 5, questionsPerModel: 10, completedModels: 5, questionIndex: 0 });
  assert.equal(p.modelNumber, 5, 'completed === models must not read as "Model 6 of 5"');
});
