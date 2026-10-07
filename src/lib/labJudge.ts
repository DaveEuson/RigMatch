// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { modelIdentities, sameModel } from './modelKey.ts';

export type LabJudge = { provider: 'local' | 'openrouter'; model: string; apiKey?: string; baseUrl?: string };

/**
 * The judge for one contestant's App Builder or Code answer.
 *
 * The skill rounds used one judge for the whole lineup, so when the judge was
 * picked automatically and was also a contestant, it marked its own app and
 * code. The show's automatic judge already steps aside for the model under
 * test and for its copy in the other program (autoJudgeModel in main.cjs);
 * this does the same, taking the next candidate with different weights, or no
 * judge when only the contestant is left.
 *
 * A judge the person chose stays theirs, as in the show, and a cloud judge is
 * never a contestant.
 */
export function labJudgeFor(
  contestant: string,
  judge: LabJudge | null,
  { chosen, candidates, baseUrlOf, identityOf = (model) => modelIdentities(model) }: {
    chosen: boolean;
    candidates: string[];
    baseUrlOf: (model: string) => string | undefined;
    /** Every identity of an installed model (modelIdentities): its name key, digest and build. */
    identityOf?: (model: string) => string[];
  },
): LabJudge | null {
  if (!judge || judge.provider !== 'local' || chosen) return judge;
  const own = identityOf(contestant);
  if (!sameModel(identityOf(judge.model), own)) return judge;
  const other = candidates.find((name) => !sameModel(identityOf(name), own));
  return other ? { ...judge, model: other, baseUrl: baseUrlOf(other) } : null;
}
