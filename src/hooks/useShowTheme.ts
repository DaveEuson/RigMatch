// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { useEffect, useRef } from 'react';
import { showTheme } from '../lib/showTheme';

/**
 * Where the show is, as far as the music cares.
 * - running: contestants are answering — the theme loops.
 * - crowned: a winner was just revealed — ta-da.
 * - flopped: the show stopped, or nobody passed — sad trombone.
 * - idle: anything else — silence.
 */
export type ShowMusicState = 'running' | 'crowned' | 'flopped' | 'idle';

/** How long a show that stops running may take to become crowned or flopped. */
const VERDICT_GRACE_MS = 1500;

/**
 * Plays the theme while a show runs and the right sting as it ends. The stings
 * play only when this hook saw the show running, so revisiting a winner, or
 * turning music on while one is on screen, stays quiet.
 */
export function useShowTheme(state: ShowMusicState, enabled: boolean) {
  const sawRunning = useRef(false);
  const pendingStop = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingStop.current) clearTimeout(pendingStop.current);
    pendingStop.current = null;
    if (!enabled) {
      sawRunning.current = false;
      showTheme.stop();
      return;
    }
    if (state === 'running') {
      sawRunning.current = true;
      showTheme.start();
      return;
    }
    if (sawRunning.current && (state === 'crowned' || state === 'flopped')) {
      sawRunning.current = false;
      if (state === 'crowned') showTheme.winner();
      else showTheme.sad();
      return;
    }
    if (sawRunning.current) {
      // Between the last answer and the verdict the screen can pass through a
      // moment that is neither. Keep the band playing until it lands.
      pendingStop.current = setTimeout(() => {
        sawRunning.current = false;
        showTheme.stop();
      }, VERDICT_GRACE_MS);
      return;
    }
    showTheme.stop();
  }, [state, enabled]);

  // Leaving the screen that owns the show ends the music with it.
  useEffect(() => () => {
    if (pendingStop.current) clearTimeout(pendingStop.current);
    showTheme.stop();
  }, []);
}
