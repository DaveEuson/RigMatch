/**
 * One crown per selected goal — the Matches board.
 *
 * "Who won?" has no honest single answer when someone picked coding and
 * images: a coder and a painter cannot lose to each other. So each selected
 * goal crowns its own winner, the main goal's winner headlines as "Your
 * Match", and the rest are secondary crowns.
 *
 * Goal crowns are measured-only. The older category picks fall back to
 * catalogue keywords — what a model is generally for — but a crown named
 * after YOUR goal on YOUR rig must come from questions actually asked here,
 * or say plainly why it cannot yet. The test is the determination.
 */

import type { TestedModelScore } from '../types.ts';
import { goalById, type Goal, type GoalId } from './goals.ts';
import { isLegacyScore } from './scoring.ts';
import { isCloudModel } from './modelCatalog.ts';
import { bestModelForTask, type TaskGroupId } from './taskScores.ts';

/** Which measured task group crowns a question-graded goal. */
const GROUP_FOR_GOAL: Partial<Record<GoalId, TaskGroupId>> = {
  talk: 'chat',
  code: 'coding',
  'use-tools': 'tools',
};

/** Which Lab owns a lab-graded goal, for the honest not-yet message. */
const LAB_FOR_GOAL: Partial<Record<GoalId, string>> = {
  'transcribe-file': 'Listening Lab',
  'describe-image': 'Image Recognition Lab',
  'make-images': 'Image Lab',
  'make-video': 'Video Lab',
};

export type GoalMatch = {
  goal: Goal;
  /** First pick leads: this goal's winner headlines as "Your Match". */
  isMainGoal: boolean;
  /** The crowned winner, when a measured one exists. */
  pick?: {
    model: string;
    /** Mean score on this goal's own questions, 0-100. */
    taskScore: number;
    score: TestedModelScore;
  };
  /** When there is no crown, why not — honest and actionable. */
  awaiting?: string;
};

export function getGoalMatches(
  selectedGoalIds: readonly GoalId[],
  modelScores: Record<string, TestedModelScore>,
  /** Same contract as getTaskTopPicks: true = drifted, must not crown. */
  isDrifted?: (score: TestedModelScore) => boolean,
): GoalMatch[] {
  const eligible = Object.values(modelScores).filter(
    (s) => !isCloudModel(s.model) && !isLegacyScore(s) && !(isDrifted?.(s) ?? false),
  );
  const byModel = Object.fromEntries(eligible.map((s) => [s.model, s.taskScores]));
  const models = eligible.map((s) => s.model);

  return selectedGoalIds
    .map((id) => goalById(id))
    .filter((goal): goal is Goal => Boolean(goal))
    .map((goal, index) => {
      const base = { goal, isMainGoal: index === 0 };

      const group = GROUP_FOR_GOAL[goal.id];
      if (group) {
        const best = bestModelForTask(byModel, group, models);
        if (best) {
          const score = eligible.find((s) => s.model === best.model);
          if (score) return { ...base, pick: { model: best.model, taskScore: best.score, score } };
        }
        return {
          ...base,
          awaiting: 'No measured winner yet — run a test with enough questions and one gets crowned.',
        };
      }

      if (goal.grading === 'lab') {
        const lab = LAB_FOR_GOAL[goal.id] ?? 'Lab';
        return { ...base, awaiting: `The ${lab} decides this crown — lab wins are not wired into Matches yet.` };
      }

      return {
        ...base,
        awaiting: goal.runtime === 'none'
          ? 'Not possible locally yet.'
          : "Runs on this PC, but nothing can grade it yet.",
      };
    });
}
