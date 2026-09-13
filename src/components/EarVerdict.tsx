// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { Check, X } from 'lucide-react';
import { recordEarVerdict, type AdvancedLabResult } from '../lib/labResults';

/**
 * Your ear as the judge: whether a made clip sounds like its prompt.
 *
 * Once given, the answer is the clip's accuracy everywhere results are ranked,
 * marked as yours. Pressing the answer already given takes it back, and the
 * clip returns to whatever the listener made of it.
 */
export function EarVerdict({ result }: { result: AdvancedLabResult }) {
  const given = result.verdict?.matches;
  const answer = (matches: boolean) => recordEarVerdict(result, given === matches ? null : matches);
  return (
    <div className="ear-verdict" role="group" aria-label={`Does the clip ${result.model} made sound like the prompt?`}>
      <span>Sounds like the prompt?</span>
      <button
        type="button"
        className="mini-button outline sounds-right"
        aria-pressed={given === true}
        onClick={() => answer(true)}
        title={given === true ? 'Take back your answer' : 'It sounds like what the prompt asked for'}
      >
        <Check aria-hidden="true" />
        Sounds right
      </button>
      <button
        type="button"
        className="mini-button outline sounds-wrong"
        aria-pressed={given === false}
        onClick={() => answer(false)}
        title={given === false ? 'Take back your answer' : 'It does not sound like what the prompt asked for'}
      >
        <X aria-hidden="true" />
        Doesn’t
      </button>
    </div>
  );
}
