import { useCallback, useEffect, useRef, useState } from 'react';

import { agentArcadeApi } from '../api';
import type { GpuContention } from '../types';

/**
 * Is something else using the GPU hard enough to distort — or stall — a run?
 *
 * App() probed this only while a benchmark was pending, so every other way of
 * starting work went unchecked. A ten-second clip sent to a listening model
 * while a game held the card took over four minutes and died on a timeout that
 * blamed the connection; the detector would have called that `heavy` on the
 * first look, at 95% VRAM against a 55% threshold.
 *
 * `refresh` is deliberate rather than polled. Reading the GPU costs a
 * subprocess, and the moment worth spending it on is when the user is about to
 * commit to a run.
 */
export function useGpuContention() {
  const [contention, setContention] = useState<GpuContention | null>(null);
  // Guards against a probe landing after the panel closed.
  const liveRef = useRef(true);

  useEffect(() => {
    liveRef.current = true;
    return () => { liveRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await agentArcadeApi.getGpuContention();
      if (liveRef.current) setContention(result);
      return result;
    } catch {
      // A failed probe means the same thing as "could not check", which the
      // assessment already reports as `unknown` — so stay silent rather than
      // surfacing an error the user cannot act on.
      return null;
    }
  }, []);

  return { contention, refresh };
}
