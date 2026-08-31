// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ModelRow, TestedModelScore } from '../types';
import { compareModelTags, describeModelTag } from './modelVariants.ts';

/**
 * Two models, side by side, and an honest answer about which is better.
 *
 * "Why is gemma4:e2b better than gemma4:e4b" is the first thing a real user
 * asks about two rows of the same family, and the app could not answer it:
 * getModelProfile matches on the family name, so every variant returned the
 * same archetype, the same specialties and the same colour.
 *
 * The hard part is not laying out the numbers, it is knowing when not to claim
 * one. A Match score is RigMatch's own measurement on this machine, so a higher
 * one is a fair thing to point at. A larger download is not better or worse; it
 * is a trade. And an untested model is not losing — it is unmeasured, which is
 * a different sentence and the one the app has to say.
 *
 * Kept dependency-free of React so Node can import it directly for tests.
 */

export type ComparisonRow = {
  label: string;
  left: string;
  right: string;
  /**
   * Which side to mark as the better one, when that is a defensible claim.
   *
   * Null wherever the difference is a trade-off rather than a verdict, and
   * wherever one side is simply unknown. Most rows are null on purpose.
   */
  advantage: 'left' | 'right' | null;
};

export type ComparisonSide = {
  row: ModelRow;
  score?: TestedModelScore;
  /** From getHardwareFit — whether this machine should run it. */
  fits: boolean;
  fitLabel: string;
  installed: boolean;
  maker: string;
};

const UNTESTED = 'Not tested';

/**
 * A number both sides have, where more is better.
 *
 * Null when neither has been measured: three rows reading "Not tested / Not
 * tested" tell the reader nothing the sentence above them has not already
 * said, and push the rows that do differ off the bottom.
 */
function scoreRow(label: string, left?: number, right?: number): ComparisonRow | null {
  const known = typeof left === 'number' && typeof right === 'number';
  if (typeof left !== 'number' && typeof right !== 'number') return null;
  return {
    label,
    left: typeof left === 'number' ? String(left) : UNTESTED,
    right: typeof right === 'number' ? String(right) : UNTESTED,
    // Only when both were measured. One tested model beside an untested one is
    // not a winner, and saying so would turn "nobody has run this yet" into a
    // verdict against it.
    advantage: known && left !== right ? (left > right ? 'left' : 'right') : null,
  };
}

export function compareModels(
  left: ComparisonSide,
  right: ComparisonSide,
  formatSize: (gb: number) => string,
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  // What the names say, and only where they differ — compareModelTags already
  // drops the traits the two share.
  const tagDiffs = compareModelTags(left.row.displayName, right.row.displayName);
  const KIND_LABEL: Record<string, string> = {
    effective: 'Effective size',
    params: 'Size in parameters',
    quant: 'Compression',
    tuning: 'Tuned for',
    guardrails: 'Guardrails',
  };
  for (const diff of tagDiffs) {
    rows.push({
      label: KIND_LABEL[diff.kind] ?? diff.kind,
      left: diff.left ?? '—',
      right: diff.right ?? '—',
      // A bigger model is not a better one, and a stripped-down one is not a
      // worse one. These are the trades the reader is here to weigh.
      advantage: null,
    });
  }

  const leftGb = left.row.sizeGb ?? 0;
  const rightGb = right.row.sizeGb ?? 0;
  // Only when they actually differ. Two identical downloads listed side by side
  // is a row that costs attention and settles nothing.
  if ((leftGb || rightGb) && leftGb !== rightGb) {
    rows.push({
      label: 'Download',
      left: leftGb ? formatSize(leftGb) : 'Unknown',
      right: rightGb ? formatSize(rightGb) : 'Unknown',
      advantage: null,
    });
  }

  if (left.fitLabel !== right.fitLabel || left.fits !== right.fits) {
    rows.push({
      label: 'Fit on this computer',
      left: left.fitLabel,
      right: right.fitLabel,
      // The one that runs here beats the one that does not. This is the single
      // hardware claim worth making, and only when exactly one of them fits.
      advantage: left.fits === right.fits ? null : left.fits ? 'left' : 'right',
    });
  }

  for (const entry of [
    scoreRow('Match score', left.score?.total, right.score?.total),
    scoreRow('Answer quality', left.score?.sobriety, right.score?.sobriety),
    scoreRow('Speed', left.score?.speed, right.score?.speed),
  ]) {
    if (entry) rows.push(entry);
  }

  if (left.installed !== right.installed) {
    rows.push({
      label: 'On this computer',
      left: left.installed ? 'Installed' : 'Not installed',
      right: right.installed ? 'Installed' : 'Not installed',
      advantage: left.installed ? 'left' : 'right',
    });
  }

  if (left.maker !== right.maker) {
    rows.push({ label: 'Made by', left: left.maker, right: right.maker, advantage: null });
  }

  return rows;
}

/**
 * One sentence for the top of the panel.
 *
 * Says which is ahead only when the measurement supports it, and says what is
 * missing when it does not — "test both to compare them" is a next action,
 * where a shrug is not.
 */
export function summariseComparison(left: ComparisonSide, right: ComparisonSide): string {
  const a = left.score?.total;
  const b = right.score?.total;
  const leftName = left.row.displayName;
  const rightName = right.row.displayName;

  if (typeof a !== 'number' && typeof b !== 'number') {
    return `Neither has been tested on this computer yet, so there is no measured winner. Test both to compare them properly.`;
  }
  if (typeof a !== 'number') return `Only ${rightName} has been tested here. Test ${leftName} to compare them.`;
  if (typeof b !== 'number') return `Only ${leftName} has been tested here. Test ${rightName} to compare them.`;
  if (a === b) return `Dead heat: both scored ${a} on this computer.`;

  const [winner, loser, high, low] = a > b ? [leftName, rightName, a, b] : [rightName, leftName, b, a];
  const gap = high - low;
  // Under a couple of points is inside the noise of a re-run, and calling that
  // a win invites someone to pick on a difference that will not survive one.
  if (gap < 2) return `${winner} is ahead by ${gap}, which is close enough that a re-run could swap them.`;
  return `${winner} scored ${high} against ${low} for ${loser} on this computer.`;
}

/**
 * Sibling variants first, then everything else.
 *
 * The comparison someone actually wants is nearly always against another
 * version of the same model — that is the question the tag raises. Everything
 * else stays reachable, just further down.
 */
export function orderComparisonCandidates<T>(
  candidates: T[],
  subject: T,
  familyOf: (row: T) => string,
  nameOf: (row: T) => string,
): T[] {
  const family = familyOf(subject);
  const subjectName = nameOf(subject);
  const others = candidates.filter((row) => nameOf(row) !== subjectName);
  const siblings = others.filter((row) => familyOf(row) === family);
  const rest = others.filter((row) => familyOf(row) !== family);
  return [...siblings, ...rest];
}

/** True when the two names decode to exactly the same set of traits. */
export function tagsAreIdentical(left: string, right: string): boolean {
  return compareModelTags(left, right).length === 0
    && describeModelTag(left).length === describeModelTag(right).length;
}
