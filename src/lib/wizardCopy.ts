// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The words Simple Mode puts in its stepper and footer.
 *
 * Pure copy logic, kept out of the component so it can be tested. That matters
 * most for the failure wording: the browser demo always completes its show, so
 * the text shown when a run DIES has no other way to be verified — and that is
 * exactly the text that was wrong. The footer used to insist "The show is still
 * running" over a frozen screen that offered no way back.
 */

import { MIN_CONTESTANTS } from './downloadStatus.ts';
import { formatDuration } from './runEstimates.ts';

export type StepId = 'setup' | 'pick' | 'download' | 'compare' | 'winner';

export const STEPS: StepId[] = ['setup', 'pick', 'download', 'compare', 'winner'];

export const STEP_LABELS: Record<StepId, string> = {
  setup: 'Setup',
  pick: 'Pick',
  download: 'Download',
  compare: 'Show',
  winner: 'Winner',
};

/**
 * How many contestants a round needs before the show can start.
 *
 * The chat and coding rounds are Speed Dating, which compares, so they need
 * two. Pick allowed one, and a one-model lineup failed the instant the show
 * began and landed on a Winner screen crowning nobody, with the reason never
 * shown — reachable by anyone with a single model installed. The picture and
 * listening rounds grade each model against a check, so one is enough.
 */
export function minPicksFor(round: 'chat' | 'code' | 'vision' | 'listening' | undefined): number {
  return round === 'vision' || round === 'listening' ? 1 : MIN_CONTESTANTS;
}

/** What Pick says while the lineup is short. Empty once it is long enough. */
export function pickShortHint(pickCount: number, minPicks: number): string {
  if (pickCount >= minPicks) return '';
  if (pickCount === 0) return `Pick at least ${minPicks} to continue`;
  return `Pick ${minPicks - pickCount} more — the show compares them`;
}

export function footerHint(step: StepId, ready: boolean, pickCount: number, minPicks = 1, runFailed = false): string {
  switch (step) {
    // Only claim readiness once the check has actually passed. Before that this
    // line congratulated the user for a scan that hadn't run — and once it has,
    // the Setup screen already says so, so the footer stays quiet either way.
    case 'setup': return ready ? '' : 'One click checks Ollama and your hardware — nothing is installed or changed';
    case 'download': return 'Heads up: the show works your GPU, CPU, and fans hard until a winner is crowned — close heavy apps first';
    case 'compare': return runFailed ? '' : 'Scores appear live — the winner is crowned after the last round';
    case 'winner': return 'RigMatch remembers your Top Match — find it any time in the header';
    default: return pickShortHint(pickCount, minPicks);
  }
}

export function nextBlockedHint(step: StepId, downloadReason?: string, runFailed = false, pickCount = 0, minPicks = 1): string {
  switch (step) {
    case 'setup': return 'Check your computer first';
    case 'pick': return pickShortHint(pickCount, minPicks) || 'Pick at least 1 to continue';
    // "Waiting for downloads to finish" was shown even when every download had
    // already stopped and one had failed, which was simply untrue.
    case 'download': return downloadReason || 'Waiting for downloads to finish';
    // Likewise: a run that died is not a run that is still going. Saying so
    // stranded beginners on a frozen Compare screen with a disabled Next.
    case 'compare': return runFailed
      ? 'The show stopped early — try again, or go back and change the lineup'
      : 'The show is still running';
    default: return '';
  }
}

/**
 * Why the Listening Test cannot start.
 *
 * The button was disabled on four separate conditions and named none of them,
 * so a dead primary control sat on the panel with no way to work out what it
 * wanted. Four states, four sentences — the same rule the wizard footer
 * follows.
 */
export function listeningBlockedReason(state: {
  hasModel: boolean;
  providerReady: boolean;
  running: boolean;
  needsCapture: boolean;
  hasCapture: boolean;
}): string {
  if (state.running) return '';
  if (!state.hasModel) return 'Pick a model that can hear first';
  if (!state.providerReady) return 'Start Ollama first';
  if (state.needsCapture && !state.hasCapture) return 'Record or upload audio first';
  return '';
}

/**
 * What a screen reader hears while the show runs.
 *
 * The show takes minutes, and the only thing it said out loud was "Report
 * ready" at the very end — every podium, count and score in between was visual.
 * This is read from a polite live region, so it changes only at the moments
 * worth interrupting someone for: a model starting, the one before it
 * finishing, and the run failing. Not every question: ten announcements a
 * model would bury the ones that matter.
 */
export function showAnnouncement(state: {
  /** The friendly name of the model answering now, or '' before one starts. */
  answering: string;
  modelNumber: number;
  modelCount: number;
  /** The last model to finish, with its score, once one has. */
  finished?: { name: string; total: number };
  failed: boolean;
  failure?: string;
}): string {
  if (state.failed) return `The show stopped early. ${state.failure ?? ''}`.trim();
  const before = state.finished ? `${state.finished.name} finished with ${Math.round(state.finished.total)}.` : '';
  const now = state.answering
    ? `${state.answering} is answering${state.modelCount > 1 ? `, model ${state.modelNumber} of ${state.modelCount}` : ''}.`
    : '';
  return [before, now].filter(Boolean).join(' ');
}

/**
 * What the show says about the time left.
 *
 * The estimate was the whole elapsed time over the questions finished, so a
 * question that stalled — a judge that stopped answering took two minutes over
 * one — pushed it up every second: "about 5s left" became "about 4 min left"
 * while nothing on screen moved. It is now the time the finished questions
 * took, so it holds still during any one question, and once the current one
 * has run well past the average it says so instead of guessing.
 */
export function showTimeLeft(state: {
  /** How long the finished questions took, up to the last one finishing. */
  elapsedMs: number;
  questionsDone: number;
  totalQuestions: number;
  /** How long the current question has been going. */
  sinceLastQuestionMs: number;
  /** The judge, not the contestant, is working right now. */
  judging: boolean;
}): string {
  const { elapsedMs, questionsDone, totalQuestions, sinceLastQuestionMs, judging } = state;
  if (elapsedMs <= 0 || totalQuestions <= 0 || questionsDone < 3) return '';
  const average = elapsedMs / questionsDone;
  if (sinceLastQuestionMs > Math.max(3 * average, 45000)) {
    return judging ? 'the judge is taking a while to mark this one' : 'this question is taking a while';
  }
  return `about ${formatDuration(average * (totalQuestions - questionsDone)).replace('~', '')} left`;
}

/**
 * How the Winner line counts the field it won.
 *
 * "Out of the 3 you tested" is only true when every pick finished. It was said
 * of a show where one dropped out, and after Stop it said "out of the 1 you
 * tested" of a model that had nothing to be compared with. Anything short of
 * the whole lineup is "that finished", and a lone finisher is said to be one.
 */
/**
 * A download row's time left, in words ("about 8 minutes left").
 *
 * Coarser the further off it is: nobody plans around 74 minutes rather than
 * 75, and a precise-looking number that moves every second reads as noise.
 * The speed under it is smoothed where it is measured (downloadRate.cjs).
 */
export function downloadTimeLeft(pull?: { speedBps?: number | null; totalBytes?: number | null; completedBytes?: number | null }): string {
  if (!pull?.speedBps || !pull.totalBytes || pull.completedBytes == null) return '';
  const secondsLeft = (pull.totalBytes - pull.completedBytes) / pull.speedBps;
  if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) return '';
  if (secondsLeft < 60) return 'under a minute left';
  const minutes = secondsLeft / 60;
  if (minutes < 15) {
    const rounded = Math.round(minutes);
    return `about ${rounded} minute${rounded === 1 ? '' : 's'} left`;
  }
  if (minutes < 90) return `about ${Math.round(minutes / 5) * 5} minutes left`;
  const hours = Math.round(minutes / 30) / 2;
  return `about ${hours} hour${hours === 1 ? '' : 's'} left`;
}

export function winnerField(finished: number, picked: number): { tested: string; onlyOne: boolean } {
  const partial = finished < picked;
  return {
    tested: partial ? `${finished} that finished` : `${finished} you tested`,
    onlyOne: partial && finished === 1,
  };
}
