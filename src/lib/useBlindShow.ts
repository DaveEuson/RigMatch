// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * One blind show, from the first contestant to the reveal.
 *
 * App owns the show; this owns what blind mode adds to it, so the show's own
 * code only says when a blind show starts, finishes or falls over.
 */
import { useCallback, useMemo, useState } from 'react';
import type { BenchmarkResult } from '../types';
import { blindNames, readBlindModeOn, saveBlindPick, writeBlindModeOn } from './blindMode.ts';
import type { BlindMasking } from './blindShowContext.ts';

/** What the judge made of one contestant, at the fader the show ran at. */
export type BlindJudgeScore = { model: string; total: number; grade: string };

export type BlindSession = {
  /** Every contestant, in seat order. */
  lineup: string[];
  names: Map<string, string>;
  /**
   * running: names hidden. picking: the show is over, names still hidden, the
   * pick step is up. reveal: names back, the pick and the judge side by side.
   */
  stage: 'running' | 'picking' | 'reveal';
  /** The contestants that finished, which are the only ones that can be picked. */
  results: BenchmarkResult[];
  judge: BlindJudgeScore[];
  judgeWinner: string | null;
  picked: string | null;
  /** Whether the pick reached storage; the reveal says so either way. */
  saved: boolean;
};

export function useBlindShow() {
  const [blindOn, setBlindOnState] = useState(readBlindModeOn);
  const [session, setSession] = useState<BlindSession | null>(null);

  const setBlindOn = useCallback((on: boolean) => {
    setBlindOnState(on);
    writeBlindModeOn(on);
  }, []);

  const begin = useCallback((lineup: string[]) => {
    setSession({ lineup, names: blindNames(lineup), stage: 'running', results: [], judge: [], judgeWinner: null, picked: null, saved: false });
  }, []);

  /**
   * The show finished. With fewer than two finishers there is nothing to
   * choose between, so the show goes straight to the normal reveal.
   */
  const finish = useCallback((results: BenchmarkResult[], judge: BlindJudgeScore[], judgeWinner: string) => {
    setSession((current) => (current && results.length >= 2
      ? { ...current, stage: 'picking', results, judge, judgeWinner }
      : null));
  }, []);

  /** The show ended with nothing to pick from, or was skipped, or the reveal was closed. */
  const end = useCallback(() => setSession(null), []);

  // Saved outside the state updater: React may run an updater twice, and a
  // pick must count once.
  const pick = useCallback((model: string) => {
    if (!session || session.stage !== 'picking') return;
    const saved = saveBlindPick(model, session.results.map((result) => result.model));
    setSession({ ...session, stage: 'reveal', picked: model, saved });
  }, [session]);

  /** What the screens may show: names hidden until the reveal, then nothing hidden. */
  const masking = useMemo<BlindMasking | null>(
    () => (session && session.stage !== 'reveal' ? { names: session.names } : null),
    [session],
  );

  return { blindOn, setBlindOn, session, masking, begin, finish, end, pick };
}
