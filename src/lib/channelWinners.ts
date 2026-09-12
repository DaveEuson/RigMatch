// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Each channel's results, ranked at that channel's fader, and its winner.
 *
 * Each channel is decided by its own measurement: coding answers for Code, the
 * judge's check of the picture for Images and Video, a listening model's check
 * of the clip for Audio, word accuracy for Listening, the description score for
 * Reading pictures. Chat keeps the Top
 * Match it always had (getRigPick), since the Match Score already is the chat
 * measurement. Every ranking here comes from results measured on this machine;
 * nothing is inferred from a model's name.
 *
 * The Top Match card, the Comparison screen and Scorecards all rank through
 * here, so the three can never disagree about the same results.
 */

import type { TestedModelScore } from '../types';
import type { AdvancedLabResult } from './labResults.ts';
import { accuracyCounted, applyBalance, crowned, rankByBalance, JUDGE_PASS, type Contender, type RankedContender } from './balance.ts';
import { CURRENT_SCORE_SCHEMA_VERSION, compareTestedModelScores } from './scoring.ts';
import { isVerdictWorthy, type TaskScores } from './taskScores.ts';
import { formatVideoDuration } from './videoFit.ts';
import { rankLineupByBalance, type LineupRecord } from './videoLineup.ts';

export type ChannelWinner = {
  model: string;
  /** One line of the measurements that crowned it. */
  detail: string;
  /** A model someone can chat with, so "Use this model" means something. */
  usable: boolean;
  /** Nothing in the running was judged, so it was crowned on speed alone. */
  speedOnly: boolean;
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const seconds = (ms: number) => formatVideoDuration(ms / 1000);

/**
 * A comparison's results re-summarised at the chat fader, best first.
 *
 * The run kept its results at the weighting it ran with. Moving the fader
 * afterwards re-ranks them the way every other Match Score is re-ranked, with
 * nothing run again.
 */
export function rankMatchResults(results: TestedModelScore[], balance: number): TestedModelScore[] {
  const byModel = applyBalance(Object.fromEntries(results.map((result) => [result.model, result])), balance);
  return Object.values(byModel).sort(compareTestedModelScores);
}

/** Anything carrying a coding score: a scorecard, or one result of a comparison. */
export type CodingScored = { model: string; speed: number; taskScores?: TaskScores; scoreSchemaVersion?: number };

/**
 * Models ranked on their coding answers against speed, and the ones that could not be.
 *
 * Only a verdict-worthy coding score takes part — three or more coding answers
 * something could grade — and only from the current scoring schema, the rule
 * that keeps a stale score off the chat Top Match. The rest are returned rather
 * than dropped, so a board can say why they are missing from it.
 */
export function rankCoding<T extends CodingScored>(scores: T[], balance: number): { ranked: RankedContender<T>[]; unmeasured: T[] } {
  const contenders: Contender<T>[] = [];
  const unmeasured: T[] = [];
  for (const score of scores) {
    const coding = score.taskScores?.coding;
    if (score.scoreSchemaVersion === CURRENT_SCORE_SCHEMA_VERSION && isVerdictWorthy(coding)) {
      contenders.push({ item: score, pace: Math.max(1, score.speed), accuracy: coding.score / 100 });
    } else {
      unmeasured.push(score);
    }
  }
  return { ranked: rankByBalance(contenders, balance), unmeasured };
}

/** Best for coding: the coding answers against speed. */
export function codeWinner(
  scores: Record<string, Omit<CodingScored, 'model'>>,
  balance: number,
): ChannelWinner | null {
  const { ranked } = rankCoding(Object.entries(scores).map(([model, score]) => ({ ...score, model })), balance);
  const top = crowned(ranked);
  if (!top) return null;
  return {
    model: top.item.model,
    detail: `coding ${Math.round((top.accuracy ?? 0) * 100)} · speed ${Math.round(top.item.speed)}`,
    usable: true,
    // Every contender here has a graded coding score, so accuracy always counts.
    speedOnly: false,
  };
}

export type LabChannel = 'images' | 'video' | 'listening' | 'reading' | 'audio';

const LAB_CHALLENGE: Record<LabChannel, AdvancedLabResult['challenge']> = {
  images: 'image-generation',
  video: 'video-generation',
  listening: 'listening',
  reading: 'image-recognition',
  audio: 'audio-generation',
};

/** Pictures, clips and made audio are judged against the prompt, and that check can fail. */
const checkedAgainstPrompt = (channel: LabChannel) => channel === 'images' || channel === 'video' || channel === 'audio';

/**
 * Lab results for one channel, ranked at the fader.
 *
 * For images, video and audio, accuracy is the judge's check of the picture,
 * the clip's middle frame or the sound itself, and one that fell short of the
 * pass line has failed its check. Listening and reading are scored 0-100
 * against a right answer, so their score is their accuracy.
 */
export function rankLabList(
  results: AdvancedLabResult[],
  channel: LabChannel,
  balance: number,
): RankedContender<AdvancedLabResult>[] {
  const contenders = results
    .filter((result) => result?.challenge === LAB_CHALLENGE[channel])
    .map((result): Contender<AdvancedLabResult> => {
      const accuracy = checkedAgainstPrompt(channel)
        ? (typeof result.adherence === 'number' ? result.adherence : null)
        : result.score / 100;
      return {
        item: result,
        pace: result.elapsedMs > 0 ? 1000 / result.elapsedMs : 0,
        accuracy,
        failed: Boolean(result.error) || (checkedAgainstPrompt(channel) && accuracy !== null && accuracy < JUDGE_PASS),
      };
    });
  return rankByBalance(contenders, balance);
}

/** The same, from the saved map of every Lab result. */
export function rankLabResults(
  results: Record<string, AdvancedLabResult>,
  channel: LabChannel,
  balance: number,
): RankedContender<AdvancedLabResult>[] {
  return rankLabList(Object.values(results), channel, balance);
}

/** How a channel's accuracy reads beside a result. */
export function describeLabAccuracy(channel: LabChannel, accuracy: number): string {
  if (checkedAgainstPrompt(channel)) return `${percent(accuracy)} of the prompt`;
  if (channel === 'listening') return `listening score ${Math.round(accuracy * 100)}`;
  return `description score ${Math.round(accuracy * 100)}`;
}

export type ComparisonGroup = {
  /** What its results were given in common: the prompt, or the picture. */
  key: string;
  results: AdvancedLabResult[];
  /** Its newest result, which puts the groups in order. */
  latest: string;
};

/**
 * Results that can fairly be put side by side, grouped, newest first.
 *
 * Only results given the same thing are compared: the same prompt for
 * pictures and made audio, the same test picture for reading. A checkpoint that
 * drew a lighthouse is not beaten by one that drew a cat because the cat was
 * quicker. Listening keeps no record of what it heard, so its one group is
 * every model's latest test, and the screen says so.
 */
export function comparisonGroups(
  results: AdvancedLabResult[],
  channel: 'images' | 'listening' | 'reading' | 'audio',
): ComparisonGroup[] {
  const groups = new Map<string, AdvancedLabResult[]>();
  for (const result of results) {
    if (result?.challenge !== LAB_CHALLENGE[channel]) continue;
    const key = channel === 'images' || channel === 'audio'
      ? result.response
      : channel === 'reading' ? (result.imageDataUrl ?? '') : 'latest';
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      results: items,
      latest: items.reduce((newest, item) => (item.completedAt > newest ? item.completedAt : newest), ''),
    }))
    .sort((a, b) => b.latest.localeCompare(a.latest));
}

/** Best for a Lab-tested channel: the Lab's own accuracy against how long it took. */
export function labWinner(
  results: Record<string, AdvancedLabResult>,
  channel: 'images' | 'listening' | 'reading' | 'audio',
  balance: number,
): ChannelWinner | null {
  const ranked = rankLabResults(results, channel, balance);
  const top = crowned(ranked);
  if (!top) return null;
  const accuracy = top.accuracy === null ? 'unjudged' : describeLabAccuracy(channel, top.accuracy);
  return {
    model: top.item.model,
    detail: `${seconds(top.item.elapsedMs)} · ${accuracy}`,
    // A checkpoint draws or plays; it cannot be chatted with.
    usable: channel !== 'images' && channel !== 'audio',
    speedOnly: !accuracyCounted(ranked),
  };
}

/** Best for making video: the last lineup, re-ranked at the fader. */
export function videoWinner(record: LineupRecord | null | undefined, balance: number): ChannelWinner | null {
  if (!record) return null;
  const ranked = rankLineupByBalance(record.entries, balance);
  const top = crowned(ranked);
  if (!top) return null;
  const accuracy = top.accuracy === null ? 'unjudged' : `${percent(top.accuracy)} of the prompt`;
  return {
    model: top.item.name,
    detail: `${seconds(top.item.elapsedMs)} · ${accuracy}`,
    usable: false,
    speedOnly: !accuracyCounted(ranked),
  };
}
