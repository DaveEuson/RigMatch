// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What RigMatch Chat offers for each thing RigMatch tests, and with which model.
 *
 * Chat has one choice per use RigMatch measures: write, code, read a picture,
 * listen to audio, and make a picture, a video or audio. Each opens on the
 * model RigMatch's own tests crowned for that use, at that channel's fader, so
 * the model that won is the one Chat puts first. A maker nothing has crowned
 * yet falls back to what can run here now, fastest first: having one installed
 * is enough to use it, and Chat should not refuse to make a clip because no
 * race has been run.
 *
 * Pure, so the choice is tested in Node rather than trusted.
 */

import type { AudioLineupEntry } from './audioLineup.ts';
import { codeWinner, labWinner, videoWinner } from './channelWinners.ts';
import type { AdvancedLabResult } from './labResults.ts';
import type { LineupRecord, VideoLineupEntry } from './videoLineup.ts';

/** The chat models RigMatch crowned, by use; null where nothing has been. */
export type ChatPicks = {
  chat: string | null;
  code: string | null;
  reading: string | null;
  listening: string | null;
};

export function chatPicks({
  chosen,
  scores,
  results,
  balances,
}: {
  /** The Top Match, which Write has always opened on. */
  chosen: string | null;
  scores: Parameters<typeof codeWinner>[0];
  results: Record<string, AdvancedLabResult>;
  balances: { code: number; reading: number; listening: number };
}): ChatPicks {
  return {
    chat: chosen || null,
    code: codeWinner(scores, balances.code)?.model ?? null,
    reading: labWinner(results, 'reading', balances.reading)?.model ?? null,
    listening: labWinner(results, 'listening', balances.listening)?.model ?? null,
  };
}

/**
 * The model a clip is made with: the Makes video winner when it can run here,
 * else the fastest that can. `runnable` is fastest first, as runnableLineup
 * returns it.
 */
export function pickVideoMaker(
  runnable: VideoLineupEntry[],
  lastLineup: LineupRecord | null | undefined,
  balance: number,
): VideoLineupEntry | null {
  const crowned = videoWinner(lastLineup, balance)?.model;
  return runnable.find((entry) => entry.name === crowned) ?? runnable[0] ?? null;
}

/** The model audio is made with: the Makes audio winner when it is installed, else the first installed. */
export function pickAudioMaker(
  installed: AudioLineupEntry[],
  results: Record<string, AdvancedLabResult>,
  balance: number,
): AudioLineupEntry | null {
  const crowned = labWinner(results, 'audio', balance)?.model;
  return installed.find((entry) => entry.name === crowned) ?? installed[0] ?? null;
}
