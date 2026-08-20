// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The stop/pause rules for a running download queue.
 *
 * Pure on purpose. In App these were two booleans held twice over — a ref the
 * async loop reads and a useState the buttons render — set in four places by
 * hand, with the invariant that they are never both true maintained by writing
 * the other one false next to each assignment. Nothing could test that, and the
 * failure it protects against is the worst kind this app has: a multi-gigabyte
 * download that keeps running after Stop while the UI says it stopped.
 *
 * So the transitions and the outcome live here, where a test can reach them.
 */

export type PullRequest = 'none' | 'cancel' | 'pause';

/**
 * Cancel outranks pause, deliberately.
 *
 * Someone who has asked to stop and then hits pause means stop — the queue is
 * ending either way, and resuming something the user tried to abandon is the
 * surprise. Pause after cancel is therefore ignored rather than replacing it.
 */
export function requestPull(current: PullRequest, next: 'cancel' | 'pause'): PullRequest {
  if (current === 'cancel') return 'cancel';
  return next;
}

/**
 * What a queue that threw should report.
 *
 * Order matters and is not obvious: a pause is only a pause if something was
 * actually downloading, because pausing between models leaves nothing to
 * resume and must read as a cancel. Read the wrong way round, a paused queue
 * announces itself as cancelled and the partial download is discarded.
 */
export function pullOutcome({
  request,
  hasActiveModel,
}: {
  request: PullRequest;
  hasActiveModel: boolean;
}): 'paused' | 'cancelled' | 'failed' {
  if (request === 'pause' && hasActiveModel) return 'paused';
  if (request === 'cancel') return 'cancelled';
  return 'failed';
}

/** Whether the loop should stop handing out new models. */
export function shouldStopQueue(request: PullRequest): boolean {
  return request === 'cancel';
}

/**
 * The abort reason the main process expects.
 *
 * 'pause' leaves Ollama's partial layers in place so Start Download resumes
 * through them; 'cancel' does not. Sending the wrong one silently turns a
 * pause into a restart-from-zero on the next attempt.
 */
export function abortReasonFor(request: PullRequest): 'cancel' | 'pause' | null {
  return request === 'none' ? null : request;
}
