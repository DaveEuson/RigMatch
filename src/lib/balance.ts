// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * How much accuracy counts against speed: the Balance fader.
 *
 * "Which model is best" has no answer until someone says best at what. One
 * person will wait six minutes for the clip that matched their prompt; another
 * wants clips out as fast as the card allows. That choice was a setting three
 * menus deep with three fixed answers, and it only ever re-weighted chat. It is
 * now a value from 0 (speed is all that counts) to 100 (accuracy is all that
 * counts), asked before every test, kept per channel, and able to re-rank any
 * result already on disk without re-running it.
 *
 * The three old presets are notches on it, at exactly their old weights, so
 * someone who never touches the fader sees the same numbers as before.
 * Reliability and fit keep their share at every position: the fader moves the
 * accuracy-and-speed argument, which is the one people actually have.
 */

import {
  SCORE_PRIORITIES,
  SCORE_WEIGHTS,
  calculateWeightedTotal,
  gradeForMatchScore,
  type MatchScoreLike,
  type ScorePriorityId,
  type ScoreWeights,
} from './scoring.ts';
import { CHANNEL_IDS, type ChannelId } from './workbench.ts';

/** The share of the score the fader moves between accuracy and speed. */
const PAIR = SCORE_WEIGHTS.sobriety + SCORE_WEIGHTS.speed;

/** Where a preset sits on the fader: its accuracy share of that pair, 0-100. */
const presetPosition = (id: ScorePriorityId) => (SCORE_PRIORITIES[id].weights.sobriety / PAIR) * 100;

export const BALANCE_NOTCHES = [
  { id: 'speed', label: 'Speed first', value: presetPosition('speed') },
  { id: 'balanced', label: 'Balanced', value: presetPosition('balanced') },
  { id: 'accuracy', label: 'Accuracy first', value: presetPosition('accuracy') },
] as const satisfies ReadonlyArray<{ id: ScorePriorityId; label: string; value: number }>;

/** Where every channel starts: the historical weighting. */
export const BALANCED = presetPosition('balanced');

/**
 * The line a judged result must reach to count as passing. The same line the
 * image and video checks use for "matches the prompt".
 */
export const JUDGE_PASS = 0.8;

export function clampBalance(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : BALANCED;
}

/**
 * The notch a position lands on, within half a step.
 *
 * The fader moves in whole numbers and the notches are not whole numbers
 * (Balanced is 51.5...), so whole-number positions within half a step count as
 * the notch itself — which is what keeps them bit-for-bit.
 */
export function notchAt(balance: number) {
  return BALANCE_NOTCHES.find((notch) => Math.abs(notch.value - balance) < 0.5) ?? null;
}

export function balanceWeights(balance: number): ScoreWeights {
  const notch = notchAt(balance);
  if (notch) return SCORE_PRIORITIES[notch.id].weights;
  const share = clampBalance(balance) / 100;
  return {
    sobriety: PAIR * share,
    speed: PAIR * (1 - share),
    stability: SCORE_WEIGHTS.stability,
    fit: SCORE_WEIGHTS.fit,
  };
}

/**
 * Saved Match scores re-summarised at a fader position.
 *
 * The four measured signals are untouched; only the headline that summarises
 * them moves. At Balanced nothing is rewritten at all.
 */
export function applyBalance<T extends MatchScoreLike & { grade?: string }>(
  scores: Record<string, T>,
  balance: number,
): Record<string, T> {
  if (notchAt(balance)?.id === 'balanced') return scores;
  const weights = balanceWeights(balance);
  const out: Record<string, T> = {};
  for (const [key, score] of Object.entries(scores)) {
    const preciseTotal = calculateWeightedTotal(score, weights);
    const total = Math.round(preciseTotal);
    out[key] = { ...score, preciseTotal, total, grade: gradeForMatchScore(total) };
  }
  return out;
}

/** The short form shown beside a score: "92 · balanced", "85 · 30% accuracy". */
export function balanceLabel(balance: number): string {
  const position = Math.round(clampBalance(balance));
  if (position === 0) return 'speed only';
  if (position === 100) return 'accuracy only';
  const notch = notchAt(balance);
  return notch ? notch.label.toLowerCase() : `${position}% accuracy`;
}

/** The fader's own readout. */
export function balanceSplit(balance: number): string {
  const accuracy = Math.round(clampBalance(balance));
  return `${accuracy}% accuracy · ${100 - accuracy}% speed`;
}

export const BALANCE_STORAGE_KEY = 'rigmatch:balance:v1';

export type Balances = Record<ChannelId, number>;

/**
 * Every channel's fader, from storage.
 *
 * A chat priority chosen before the fader existed carries over to chat and
 * code, the two channels it ever applied to. Everything else starts Balanced.
 */
export function readBalances(raw: string | null | undefined, legacyPriority?: string | null): Balances {
  const legacy = legacyPriority && legacyPriority in SCORE_PRIORITIES
    ? presetPosition(legacyPriority as ScorePriorityId)
    : BALANCED;
  const balances = Object.fromEntries(
    CHANNEL_IDS.map((id) => [id, id === 'chat' || id === 'code' ? legacy : BALANCED]),
  ) as Balances;
  try {
    const parsed = JSON.parse(raw ?? 'null') as Record<string, unknown> | null;
    if (parsed && typeof parsed === 'object') {
      for (const id of CHANNEL_IDS) {
        const value = parsed[id];
        if (typeof value === 'number' && Number.isFinite(value)) balances[id] = clampBalance(value);
      }
    }
  } catch {
    // A damaged value falls back to the defaults rather than taking the app down.
  }
  return balances;
}

/**
 * One finished result, as the fader sees it.
 *
 * `pace` is anything where higher is faster — 1 / seconds, or a speed score —
 * because only the ratio to the fastest counts. `accuracy` runs 0 to 1, null
 * when nothing could judge it.
 */
export type Contender<T> = { item: T; pace: number; accuracy: number | null; failed?: boolean };

export type RankedContender<T> = Contender<T> & {
  /** Pace against the fastest in the same race, 0 to 1. */
  speed: number;
  value: number;
  standing: 'ranked' | 'unjudged' | 'failed';
};

/**
 * Rank finished results at a fader position.
 *
 * Speed counts within the race — the fastest result gets full marks — so a
 * fixed scale built for one model family cannot sink another. Three rules hold
 * at every position:
 * - A result that failed its check is never crowned; it is listed after the rest.
 * - A result nothing judged cannot win on accuracy it never showed, so with any
 *   weight on accuracy it ranks after every judged result.
 * - When nothing in the race was judged, accuracy cannot be measured at all and
 *   the ranking is speed alone.
 */
export function rankByBalance<T>(contenders: Contender<T>[], balance: number): RankedContender<T>[] {
  const alive = contenders.filter((contender) => !contender.failed && contender.pace > 0);
  const fastest = alive.reduce((max, contender) => Math.max(max, contender.pace), 0);
  const anyJudged = alive.some((contender) => contender.accuracy !== null);
  const share = anyJudged ? clampBalance(balance) / 100 : 0;

  const ranked = alive
    .map((contender): RankedContender<T> => {
      const speed = fastest > 0 ? contender.pace / fastest : 0;
      return {
        ...contender,
        speed,
        value: share * (contender.accuracy ?? 0) + (1 - share) * speed,
        standing: contender.accuracy === null && share > 0 ? 'unjudged' : 'ranked',
      };
    })
    .sort((a, b) => (a.standing === b.standing ? 0 : a.standing === 'ranked' ? -1 : 1)
      || b.value - a.value
      || b.pace - a.pace);

  const failed = contenders
    .filter((contender) => contender.failed || !(contender.pace > 0))
    .map((contender): RankedContender<T> => ({ ...contender, speed: 0, value: 0, standing: 'failed' }));

  return [...ranked, ...failed];
}

/** The winner of a ranking, if anything in it can be crowned. */
export function crowned<T>(ranked: RankedContender<T>[]): RankedContender<T> | null {
  return ranked[0]?.standing === 'ranked' ? ranked[0] : null;
}

/**
 * Whether accuracy counted anywhere in a ranking.
 *
 * When nothing that could win was judged, the fader cannot have mattered, and
 * "ranked at 70% accuracy" over a list ordered by time alone would be false.
 */
export function accuracyCounted<T>(ranked: RankedContender<T>[]): boolean {
  return ranked.some((entry) => entry.standing !== 'failed' && entry.accuracy !== null);
}

/** What a ranking was really ranked at: the fader, or speed alone when nothing was judged. */
export function rankedAtLabel<T>(ranked: RankedContender<T>[], balance: number): string {
  return accuracyCounted(ranked) ? balanceLabel(balance) : 'speed only';
}

/** True when no result in the race was judged, so the fader can only mean speed. */
export function speedOnly<T>(contenders: Contender<T>[]): boolean {
  return contenders.length > 0 && contenders.every((contender) => contender.accuracy === null);
}
