// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { checkState, type AdvancedLabCheck } from '../lib/labResults';

const CHECK_WORDS = { passed: 'Pass', failed: 'Miss', unchecked: 'Not checked' } as const;

/**
 * A result's rubric, a line per check: Pass, Miss, or Not checked when nothing
 * could judge that line. Each line says why on hover.
 */
export function LabChecks({ checks }: { checks: AdvancedLabCheck[] }) {
  return (
    <div className="advanced-lab-checks">
      {checks.map((check) => {
        const state = checkState(check);
        return (
          <div key={check.label} className={state} title={check.detail}>
            <span>{CHECK_WORDS[state]}</span>
            <strong>{check.label}</strong>
          </div>
        );
      })}
    </div>
  );
}
