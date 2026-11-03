// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { createContext, useContext } from 'react';
import type { BenchmarkResult } from '../types';

/**
 * "Test this question again", for every panel that shows answers: the
 * comparison's answers tab, a run report, and a saved test's detail. Null where
 * it is not offered, which includes a blind show until its reveal, so names
 * stay hidden.
 */
export type AnswerRetest = {
  retest: (result: BenchmarkResult, promptId: string) => void;
  /** The answer being asked again now, if any. */
  retesting: { model: string; promptId: string } | null;
  stop: () => void;
};

export const AnswerRetestContext = createContext<AnswerRetest | null>(null);

export function useAnswerRetest(): AnswerRetest | null {
  return useContext(AnswerRetestContext);
}
