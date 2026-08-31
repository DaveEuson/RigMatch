// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { formatGb } from '../lib/format';
import { getFriendlyModelName, getHardwareFit, getModelScore } from '../lib/modelCatalog';
import { getModelOrigin } from '../lib/modelOrigins';
import { compareModels, orderComparisonCandidates, summariseComparison } from '../lib/modelComparison';
import type { ComparisonSide } from '../lib/modelComparison';
import type { ModelRow, TestedModelScore } from '../types';
import { ArrowLeftRight, X } from 'lucide-react';

/**
 * Two models, side by side.
 *
 * The question this exists for is "why is gemma4:e2b better than gemma4:e4b",
 * which the app could not answer at all: getModelProfile matches on the family
 * name, so every variant of a model returned the same archetype, the same
 * specialties and the same colour. The only things separating two rows were a
 * tag nobody could decode and a score most models do not have yet.
 *
 * Sibling versions are offered first, because that is nearly always the
 * comparison someone wants — it is the question the tag raises. Everything else
 * stays in the list, further down.
 */
export function ModelCompareCard({
  subject,
  rows,
  modelScores,
  installedModelNames,
  vramGb,
  compareWith,
  onCompareWith,
}: {
  subject?: ModelRow;
  rows: ModelRow[];
  modelScores: Record<string, TestedModelScore>;
  installedModelNames: Set<string>;
  vramGb: number;
  compareWith: string | null;
  onCompareWith: (model: string | null) => void;
}) {
  if (!subject) return null;

  const candidates = orderComparisonCandidates(
    rows,
    subject,
    (row) => getFriendlyModelName(row.displayName),
    (row) => row.displayName,
  );
  if (candidates.length === 0) return null;

  const other = compareWith ? rows.find((row) => row.displayName === compareWith) : undefined;

  const sideFor = (row: ModelRow): ComparisonSide => {
    const fit = getHardwareFit(row, vramGb);
    return {
      row,
      // getModelScore rather than modelScores[displayName]: a saved score can
      // be keyed by the model's id, or by a name carrying a :latest the row
      // does not, and this is the lookup the rest of the app uses. Getting it
      // wrong here would print "Not tested" beside a model that has been —
      // which this panel would then read as a reason not to pick it.
      score: getModelScore(row, modelScores),
      fits: fit.recommend,
      fitLabel: fit.label,
      installed: installedModelNames.has(row.displayName) || row.installed,
      maker: getModelOrigin(row.displayName).organization,
    };
  };

  const left = sideFor(subject);
  const right = other ? sideFor(other) : null;
  const comparison = right ? compareModels(left, right, formatGb) : [];

  return (
    <section className="model-compare-card" aria-label="Compare two models">
      <div className="model-compare-head">
        <ArrowLeftRight aria-hidden="true" />
        <span>Compare</span>
        {other && (
          <button type="button" onClick={() => onCompareWith(null)} aria-label="Stop comparing">
            <X aria-hidden="true" />
          </button>
        )}
      </div>

      <label className="model-compare-picker">
        <span className="sr-only">Compare {subject.displayName} with</span>
        <select
          value={compareWith ?? ''}
          onChange={(event) => onCompareWith(event.target.value || null)}
        >
          <option value="">Compare {subject.displayName} with…</option>
          {candidates.map((row) => (
            <option key={row.displayName} value={row.displayName}>{row.displayName}</option>
          ))}
        </select>
      </label>

      {right && (
        <>
          {/* The verdict first, in a sentence, because a table of numbers is
              not an answer to "which one should I use". */}
          <p className="model-compare-verdict">{summariseComparison(left, right)}</p>
          <table className="model-compare-table">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">What</span></th>
                <th scope="col">{subject.displayName}</th>
                <th scope="col">{other!.displayName}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((entry) => (
                <tr key={entry.label}>
                  <th scope="row">{entry.label}</th>
                  <td className={entry.advantage === 'left' ? 'wins' : undefined}>{entry.left}</td>
                  <td className={entry.advantage === 'right' ? 'wins' : undefined}>{entry.right}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Said once, plainly, rather than implied by an absent highlight:
              most rows here are trades, and only a few are verdicts. */}
          <p className="model-compare-note">
            Highlighted values are the ones measured better on this computer. Size and
            compression are trade-offs, not winners.
          </p>
        </>
      )}
    </section>
  );
}
