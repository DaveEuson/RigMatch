import type { PullProgressUpdate } from '../types';

/**
 * How the Simple Mode download step reads its own state.
 *
 * Extracted from the wizard so it can be tested directly. Both of these
 * previously lied to the user: a failed download was reported as "Up next /
 * Waiting in line" with its error thrown away, and because the step only
 * completed when *every* model was installed, one failure left Next disabled
 * forever under "Waiting for downloads to finish" — for downloads that had
 * already stopped.
 */

export type DownloadRowStatus = 'done' | 'downloading' | 'paused' | 'failed' | 'queued';

/** A comparison needs two contestants; App.tsx's runListTest enforces the same. */
export const MIN_CONTESTANTS = 2;

export function getDownloadRowStatus(
  installed: boolean,
  pull: PullProgressUpdate | undefined,
): DownloadRowStatus {
  if (installed) return 'done';
  if (!pull) return 'queued';
  if (pull.phase === 'failed') return 'failed';
  if (pull.phase === 'paused') return 'paused';
  if (pull.phase === 'complete' || pull.phase === 'queued') return 'queued';
  return 'downloading';
}

export type DownloadStepSummary = {
  installedCount: number;
  failedCount: number;
  /**
   * Every picked model is on the machine, so the step has nothing to do and is
   * skipped in both directions. Deliberately distinct from `canContinue`, which
   * is also true when a download failed but enough models arrived anyway — that
   * case must still show the step, so the user can see what went wrong.
   */
  allInstalled: boolean;
  /** True while any picked model is still downloading, queued, or paused. */
  stillMoving: boolean;
  /** Whether the user may leave the download step. */
  canContinue: boolean;
  /** Set only when Next is blocked for a reason the default hint gets wrong. */
  blockedReason?: string;
};

/**
 * Takes the already-derived per-row statuses rather than the rows and the
 * progress map. Keeping props out of this signature lets the React Compiler
 * carry on optimizing the wizard: it cannot see inside a cross-module call, so
 * passing prop objects in made it assume they might be mutated and bail.
 */
export function summarizeDownloadStep(statuses: DownloadRowStatus[]): DownloadStepSummary {
  const rows = statuses;
  const installedCount = statuses.filter((s) => s === 'done').length;
  const failedCount = statuses.filter((s) => s === 'failed').length;
  const stillMoving = statuses.some((s) => s === 'downloading' || s === 'queued' || s === 'paused');
  const allInstalled = rows.length > 0 && installedCount === rows.length;

  // Once nothing is moving, don't strand the user over a download that failed —
  // let them continue with whoever actually arrived, provided there are enough
  // of them to hold a comparison.
  const canContinue = allInstalled
    || (rows.length > 0 && failedCount > 0 && !stillMoving && installedCount >= MIN_CONTESTANTS);

  const blockedReason = !canContinue && failedCount > 0 && !stillMoving
    ? `${failedCount} download${failedCount === 1 ? '' : 's'} didn't finish, so there aren't enough contestants. Go back and pick another.`
    : undefined;

  return { installedCount, failedCount, allInstalled, stillMoving, canContinue, blockedReason };
}
