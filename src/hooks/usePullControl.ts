// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useCallback, useRef, useState } from 'react';

import { agentArcadeApi } from '../api';
import { abortReasonFor, requestPull, shouldStopQueue, type PullRequest } from '../lib/pullControl';

/**
 * Stop and pause for the download queue, held once.
 *
 * The queue is a long async loop that cannot see React state — it closes over
 * whatever was current when it started — so the loop reads a ref while the
 * buttons render a useState. That is two representations of one fact, and in
 * App they were set independently at four sites:
 *
 *     pullQueueCancelRef.current = true;
 *     pullQueuePauseRef.current = false;
 *     setIsPullCancelRequested(true);
 *     setIsPullPauseRequested(false);
 *
 * Four assignments, every one of which had to be right, with the invariant
 * that cancel and pause are never both true maintained by remembering to write
 * the other one false. Miss a line and the loop and the UI disagree about
 * whether the user asked to stop — which is a download that keeps running while
 * the screen says it stopped.
 *
 * Here there is one value. The ref is written synchronously for the loop and
 * the state follows for the render, in one place, and the transition rules are
 * in lib/pullControl where they are tested.
 */
export function usePullControl() {
  // The loop's copy: written synchronously, because a request made during an
  // await must be visible to the very next check rather than after a render.
  const requestRef = useRef<PullRequest>('none');
  // The buttons' copy: same value, one render behind, which is all they need.
  const [request, setRequest] = useState<PullRequest>('none');
  /** The pull the main process is streaming, so abort can name the right one. */
  const activeProgressIdRef = useRef<string | null>(null);

  const apply = useCallback((next: PullRequest) => {
    requestRef.current = next;
    setRequest(next);
  }, []);

  /**
   * Ask the queue to stop or pause, and tell the main process to drop the
   * stream it is on. Returns the request that ended up in force, which is not
   * always the one asked for — cancel outranks pause.
   */
  const ask = useCallback((next: 'cancel' | 'pause') => {
    const settled = requestPull(requestRef.current, next);
    apply(settled);
    const reason = abortReasonFor(settled);
    if (reason) void agentArcadeApi.abortPull(activeProgressIdRef.current ?? undefined, reason);
    return settled;
  }, [apply]);

  /** Back to running. The finally block of the queue owns this. */
  const clearRequest = useCallback(() => {
    apply('none');
    activeProgressIdRef.current = null;
  }, [apply]);

  const setActiveProgressId = useCallback((id: string | null) => {
    activeProgressIdRef.current = id;
  }, []);

  // Declared here rather than inline in the returned object. A hook call inside
  // an object literal is legal React but sits below the top level of the
  // function, where hook-order.mjs — which counts depth-0 calls, so that a
  // `use...` inside a callback is not mistaken for one of this component's —
  // cannot see it. An uncounted hook is invisible to the census.
  const currentRequest = useCallback(() => requestRef.current, []);
  const shouldStop = useCallback(() => shouldStopQueue(requestRef.current), []);

  return {
    /** For the buttons. One render behind the ref, which is what render wants. */
    request,
    cancelRequested: request === 'cancel',
    pauseRequested: request === 'pause',
    /** For the loop. Reads the ref, so it sees a request made mid-await. */
    currentRequest,
    shouldStop,
    ask,
    clearRequest,
    setActiveProgressId,
  };
}
