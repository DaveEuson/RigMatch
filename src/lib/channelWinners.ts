// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * One winner per channel, crowned at that channel's fader position.
 *
 * Each channel is decided by its own measurement: coding answers for Code, the
 * judge's check of the picture for Images, the lineup for Video, word accuracy
 * for Listening, the description score for Reading pictures. Chat keeps the Top
 * Match it always had (getRigPick), since the Match Score already is the chat
 * measurement. Every winner here comes from a result measured on this machine;
 * nothing is inferred from a model's name.
 */

import type { AdvancedLabResult } from './labResults.ts';
import { accuracyCounted, crowned, rankByBalance, JUDGE_PASS, type Contender, type RankedContender } from './balance.ts';
import { CURRENT_SCORE_SCHEMA_VERSION } from './scoring.ts';
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
 * Best for coding: the coding answers against speed.
 *
 * Only models with a verdict-worthy coding score take part — at least three
 * coding questions something could actually grade — and only scores from the
 * current scoring schema, the same rule that keeps a stale score off the chat
 * Top Match.
 */
export function codeWinner(
  scores: Record<string, { speed: number; taskScores?: TaskScores; scoreSchemaVersion?: number }>,
  balance: number,
): ChannelWinner | null {
  const contenders = Object.entries(scores).flatMap(([model, score]): Contender<string>[] => {
    if (score.scoreSchemaVersion !== CURRENT_SCORE_SCHEMA_VERSION) return [];
    const coding = score.taskScores?.coding;
    if (!isVerdictWorthy(coding)) return [];
    return [{ item: model, pace: Math.max(1, score.speed), accuracy: coding.score / 100 }];
  });
  const top = crowned(rankByBalance(contenders, balance));
  if (!top) return null;
  return {
    model: top.item,
    detail: `coding ${Math.round((top.accuracy ?? 0) * 100)} · speed ${Math.round(scores[top.item].speed)}`,
    usable: true,
    // Every contender here has a graded coding score, so accuracy always counts.
    speedOnly: false,
  };
}

export type LabChannel = 'images' | 'listening' | 'reading';

const LAB_CHALLENGE: Record<LabChannel, AdvancedLabResult['challenge']> = {
  images: 'image-generation',
  listening: 'listening',
  reading: 'image-recognition',
};

/**
 * Every saved result for a Lab-tested channel, ranked at the fader.
 *
 * For images, accuracy is the judge's check of the picture, and a picture that
 * fell short of the pass line has failed its check. Listening and reading are
 * scored 0-100 against a right answer, so their score is their accuracy.
 */
export function rankLabResults(
  results: Record<string, AdvancedLabResult>,
  channel: LabChannel,
  balance: number,
): RankedContender<AdvancedLabResult>[] {
  const contenders = Object.values(results)
    .filter((result) => result?.challenge === LAB_CHALLENGE[channel])
    .map((result): Contender<AdvancedLabResult> => {
      const accuracy = channel === 'images'
        ? (typeof result.adherence === 'number' ? result.adherence : null)
        : result.score / 100;
      return {
        item: result,
        pace: result.elapsedMs > 0 ? 1000 / result.elapsedMs : 0,
        accuracy,
        failed: Boolean(result.error) || (channel === 'images' && accuracy !== null && accuracy < JUDGE_PASS),
      };
    });
  return rankByBalance(contenders, balance);
}

/** How a channel's accuracy reads beside a result. */
export function describeLabAccuracy(channel: LabChannel, accuracy: number): string {
  if (channel === 'images') return `${percent(accuracy)} of the prompt`;
  if (channel === 'listening') return `listening score ${Math.round(accuracy * 100)}`;
  return `description score ${Math.round(accuracy * 100)}`;
}

/** Best for a Lab-tested channel: the Lab's own accuracy against how long it took. */
export function labWinner(
  results: Record<string, AdvancedLabResult>,
  channel: LabChannel,
  balance: number,
): ChannelWinner | null {
  const ranked = rankLabResults(results, channel, balance);
  const top = crowned(ranked);
  if (!top) return null;
  const accuracy = top.accuracy === null ? 'unjudged' : describeLabAccuracy(channel, top.accuracy);
  return {
    model: top.item.model,
    detail: `${seconds(top.item.elapsedMs)} · ${accuracy}`,
    // A checkpoint draws; it cannot be chatted with.
    usable: channel !== 'images',
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
