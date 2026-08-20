// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What each model is good at, measured on this rig.
 *
 * Every benchmark question already carries a type, and every answer already
 * gets its own sobriety score — but the two were never joined. The per-question
 * scores were averaged into one number and the breakdown thrown away, so
 * "Best for coding" came from keyword-matching a hand-curated list of model
 * specialties: generic knowledge, true of the model in the abstract, and
 * unable to say anything about the machine it is running on.
 *
 * Joining them is the whole of this module. A quantisation that mangles a
 * model's instruction-following, or a rig that makes a bigger model unusable,
 * shows up here and cannot show up in a curated list.
 */

import type { BenchmarkQuestionType } from '../benchmarkSuite.ts';
import type { BenchmarkPromptResult } from '../types.ts';

/**
 * The benchmark asks five kinds of question, one group each. `json` and
 * `format` used to pool as "does it do as it is told", but the goal taxonomy
 * split them: the JSON questions were always tool-output questions ("Return
 * only valid JSON for this local assistant request...") and now crown the
 * tools-and-automations goal, while `format` alone measures instruction-
 * following. Scores saved under the old pooling are a different measurement —
 * that is why CURRENT_SCORE_SCHEMA_VERSION bumped when these split.
 */
export const TASK_GROUPS = [
  { id: 'coding', label: 'Coding', questionTypes: ['coding'] },
  { id: 'chat', label: 'Everyday chat', questionTypes: ['assistant'] },
  { id: 'writing', label: 'Writing', questionTypes: ['writing'] },
  { id: 'facts', label: 'Sticking to facts', questionTypes: ['truth'] },
  { id: 'tools', label: 'Tools & automations', questionTypes: ['json'] },
  { id: 'instructions', label: 'Following instructions', questionTypes: ['format'] },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  questionTypes: readonly BenchmarkQuestionType[];
}>;

export type TaskGroupId = (typeof TASK_GROUPS)[number]['id'];

export type TaskScore = {
  /** Mean sobriety across that group's questions, 0-100. */
  score: number;
  /** Questions it is drawn from — a score from one question is not a finding. */
  questions: number;
  /**
   * How many of those answers something could actually grade. Chat and writing
   * questions have no heuristic behind them — without a judge their score is a
   * length proxy — so a group where this is 0 has a number but no measurement,
   * and must not be presented as a verdict. Absent on runs recorded before
   * scoredBy was kept, which are treated as graded rather than retro-doubted.
   */
  graded?: number;
};

export type TaskScores = Partial<Record<TaskGroupId, TaskScore>>;

/**
 * Below this, a group's score is kept but should not be presented as a verdict.
 * A ten-question run spreads thinly across five types.
 */
export const MIN_QUESTIONS_FOR_VERDICT = 3;

/**
 * Group a run's per-question scores by what the question was testing.
 *
 * Results from before question types were recorded simply produce nothing,
 * rather than a confident average over unknown material.
 */
export function summarizeTaskScores(prompts: BenchmarkPromptResult[]): TaskScores {
  const scores: TaskScores = {};

  for (const group of TASK_GROUPS) {
    const matching = prompts.filter(
      (prompt) => prompt.type !== undefined
        && (group.questionTypes as readonly string[]).includes(prompt.type)
        // A question the model never answered says nothing about its ability at
        // that task; it belongs to stability, which is scored separately.
        && prompt.status !== 'no-response'
        && prompt.status !== 'failed',
    );
    if (matching.length === 0) continue;
    const total = matching.reduce((sum, prompt) => sum + prompt.sobrietyScore, 0);
    // An older run has no scoredBy at all; count those as graded so this does
    // not retroactively cast doubt on results it cannot actually assess.
    const graded = matching.filter((prompt) => prompt.scoredBy !== 'unjudged').length;
    scores[group.id] = {
      score: Math.round(total / matching.length),
      questions: matching.length,
      graded,
    };
  }

  return scores;
}

/**
 * Whether a group has enough behind it to be shown as a verdict.
 *
 * Two ways to fail: too few answers, or enough answers that nothing could
 * grade. The second was the quieter bug — "Best for talking" was crowned on
 * chat answers scored purely by character count, so the longest-winded model
 * won. A number is not a measurement.
 */
export function isVerdictWorthy(task: TaskScore | undefined): task is TaskScore {
  if (task === undefined || task.questions < MIN_QUESTIONS_FOR_VERDICT) return false;
  return (task.graded ?? task.questions) >= MIN_QUESTIONS_FOR_VERDICT;
}

/** True when answers exist but nothing could grade them — the judge would. */
export function needsJudge(task: TaskScore | undefined): boolean {
  if (!task || task.questions < MIN_QUESTIONS_FOR_VERDICT) return false;
  return (task.graded ?? task.questions) < MIN_QUESTIONS_FOR_VERDICT;
}

export type TaskWinner = {
  task: TaskGroupId;
  label: string;
  model: string;
  score: number;
  /** Points clear of the runner-up. Zero when it is the only scored model. */
  margin: number;
};

/**
 * The best model for each task, from what was actually measured.
 *
 * A winner needs a real margin: these scores come from a heuristic judge, so
 * two models a point apart are indistinguishable and picking between them would
 * be inventing a result.
 */
export function findTaskWinners(
  byModel: Record<string, TaskScores | undefined>,
  minimumMargin = 5,
): TaskWinner[] {
  const winners: TaskWinner[] = [];

  for (const group of TASK_GROUPS) {
    const ranked = Object.entries(byModel)
      .map(([model, tasks]) => ({ model, task: tasks?.[group.id] }))
      .filter((entry): entry is { model: string; task: TaskScore } => isVerdictWorthy(entry.task))
      .sort((a, b) => b.task.score - a.task.score);

    const [best, runnerUp] = ranked;
    if (!best) continue;
    const margin = runnerUp ? best.task.score - runnerUp.task.score : 0;
    // A single scored model is the best by default — there is nothing to
    // separate it from, so the margin rule does not apply.
    if (runnerUp && margin < minimumMargin) continue;

    winners.push({
      task: group.id,
      label: group.label,
      model: best.model,
      score: best.task.score,
      margin,
    });
  }

  return winners;
}

/**
 * The best model for one task, for callers that want to route work to it —
 * summarising a conversation, answering a coding question — rather than display
 * a league table.
 */
export function bestModelForTask(
  byModel: Record<string, TaskScores | undefined>,
  task: TaskGroupId,
  available: string[],
): { model: string; score: number } | null {
  const ranked = available
    .map((model) => ({ model, task: byModel[model]?.[task] }))
    .filter((entry): entry is { model: string; task: TaskScore } => isVerdictWorthy(entry.task))
    .sort((a, b) => b.task.score - a.task.score);
  const best = ranked[0];
  return best ? { model: best.model, score: best.task.score } : null;
}
