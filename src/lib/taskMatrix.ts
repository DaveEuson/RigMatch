// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { TestedModelScore } from '../types';
import type { TaskGroupId, TaskScore } from './taskScores.ts';
import { TASK_GROUPS, isVerdictWorthy, needsJudge } from './taskScores.ts';

/**
 * What each model is actually good at, side by side.
 *
 * Every run has computed this since task groups landed — summarizeTaskScores
 * puts a per-group score on every saved result — and no component has ever
 * rendered it. So "which of these three is best at coding" was measured on
 * every comparison and invisible everywhere, on a screen whose entire job is
 * comparing. A single Match score answers "which is best overall"; it cannot
 * answer "best at what", which is the question someone with three models
 * actually has.
 *
 * The restraint is the same as the two-model compare: a cell only claims a
 * number when something graded enough answers to mean one, and a column only
 * crowns a winner when there is a contest to win.
 */

export type CellState =
  /** Enough graded answers to stand as a verdict. */
  | 'measured'
  /** Answers exist, nothing local could grade them. The judge would. */
  | 'needs-judge'
  /** Too few questions of this kind to mean anything. */
  | 'too-few'
  /** This model was never asked anything of this kind. */
  | 'none';

export type MatrixCell = {
  group: TaskGroupId;
  score: number | null;
  state: CellState;
  questions: number;
};

export type MatrixRow = {
  model: string;
  cells: MatrixCell[];
};

export type TaskMatrix = {
  /** Only the groups at least one model has answers for. */
  groups: Array<{ id: TaskGroupId; label: string }>;
  rows: MatrixRow[];
  /**
   * The best model per group, and only where that is a contest: two or more
   * models measured, and no tie at the top. One measured model is not a winner
   * of anything, and crowning it would read as a comparison that never happened.
   */
  winners: Partial<Record<TaskGroupId, string>>;
};

function cellFor(task: TaskScore | undefined, group: TaskGroupId): MatrixCell {
  if (!task || task.questions === 0) return { group, score: null, state: 'none', questions: 0 };
  // Read before the guards. isVerdictWorthy is a type predicate, so on an
  // already-narrowed TaskScore its false branch narrows to never and the
  // remaining reads stop compiling.
  const { questions, score } = task;
  if (isVerdictWorthy(task)) return { group, score, state: 'measured', questions };
  if (needsJudge(task)) return { group, score: null, state: 'needs-judge', questions };
  return { group, score: null, state: 'too-few', questions };
}

export function buildTaskMatrix(
  models: string[],
  scores: Record<string, TestedModelScore>,
): TaskMatrix {
  const present = models
    .map((model) => ({ model, task: scores[model]?.taskScores }))
    .filter((entry): entry is { model: string; task: NonNullable<TestedModelScore['taskScores']> } => Boolean(entry.task));

  // A group nobody was asked about is a column of dashes. Drop it rather than
  // making the reader scan seven columns to find the two with anything in them.
  const groups = TASK_GROUPS
    .filter((group) => present.some(({ task }) => (task[group.id]?.questions ?? 0) > 0))
    .map((group) => ({ id: group.id, label: group.label }));

  const rows: MatrixRow[] = present.map(({ model, task }) => ({
    model,
    cells: groups.map((group) => cellFor(task[group.id], group.id)),
  }));

  const winners: Partial<Record<TaskGroupId, string>> = {};
  for (const group of groups) {
    const measured = rows
      .map((row) => ({ model: row.model, cell: row.cells.find((cell) => cell.group === group.id)! }))
      .filter((entry) => entry.cell.state === 'measured' && entry.cell.score !== null);
    if (measured.length < 2) continue;
    const sorted = [...measured].sort((left, right) => (right.cell.score ?? 0) - (left.cell.score ?? 0));
    // A tie at the top is not a winner. Saying it is would invite someone to
    // choose on a difference that does not exist.
    if (sorted[0].cell.score === sorted[1].cell.score) continue;
    winners[group.id] = sorted[0].model;
  }

  return { groups, rows, winners };
}

/** True when there is nothing worth drawing — no groups, or no models. */
export function isEmptyMatrix(matrix: TaskMatrix): boolean {
  return matrix.groups.length === 0 || matrix.rows.length === 0;
}

/**
 * One line for the top of the table, in the shape the reader asked the
 * question: which model to reach for, and for what.
 *
 * Silent when nothing was measured well enough to say — a summary that
 * invented a strength would be worse than no summary.
 */
export function summariseMatrix(matrix: TaskMatrix): string | null {
  const entries = Object.entries(matrix.winners) as Array<[TaskGroupId, string]>;
  if (entries.length === 0) return null;

  const byModel = new Map<string, string[]>();
  for (const [group, model] of entries) {
    const label = matrix.groups.find((entry) => entry.id === group)?.label ?? group;
    byModel.set(model, [...(byModel.get(model) ?? []), label.toLowerCase()]);
  }
  const parts = [...byModel.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .map(([model, labels]) => `${model} leads on ${labels.join(', ')}`);
  return parts.join('; ') + '.';
}
