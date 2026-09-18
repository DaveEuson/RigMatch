// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What RigMatch Chat offers for each thing RigMatch tests, and with which model.
 *
 * Chat has one choice per use RigMatch measures: write, code, read a picture,
 * listen to audio, and make a picture, a video or audio. Each opens on the
 * model RigMatch's own tests crowned for that use, at that channel's fader, so
 * the model that won is the one Chat puts first. A maker nothing has crowned
 * yet falls back to what can run here now: having one installed is enough to
 * use it, and Chat should not refuse to make a clip because no race has been
 * run.
 *
 * A maker offers every model that can run here rather than one, because the
 * first real clip made this way came from the fastest model installed — a 0.9.5
 * LTX checkpoint kept from an older Lab — and was mush. Speed settles a race;
 * it should not settle what someone asking for one clip is handed.
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

/** One model a maker can be set to, as Chat lists it. */
export type MakerChoice = {
  key: string;
  name: string;
  /** How long one clip should take here, in seconds; null where nothing estimates it. */
  seconds: number | null;
  /** What RigMatch measured when it tested this model here, or null if it never has. */
  tested: string | null;
  /** The model this channel's own race crowned. */
  crowned: boolean;
};

/** "12.4 s", "4 min": a time a person can hold in their head. */
function saySeconds(seconds: number): string {
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  const minutes = seconds / 60;
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`;
}

/**
 * Crowned first, then tested, then the catalogue's order, and a stray file last.
 *
 * A model RigMatch has timed here beats one it has only estimated, because an
 * estimate is a guess about this computer and a measurement is not. Among
 * models nothing has tested the catalogue order stands, which runs best first.
 * A file RigMatch never downloaded goes last whatever its speed: it runs the
 * oldest graph the app still keeps.
 */
function rankChoices<T>(
  items: T[],
  { keyOf, crowned, tested, place }: {
    keyOf: (item: T) => string;
    crowned: (item: T) => boolean;
    tested: (item: T) => boolean;
    place: (item: T) => number;
  },
): T[] {
  const tier = (item: T) => {
    if (crowned(item)) return 0;
    if (tested(item)) return 1;
    return keyOf(item).startsWith('file:') ? 3 : 2;
  };
  return [...items].sort((left, right) => tier(left) - tier(right) || place(left) - place(right));
}

/**
 * Every video model that can run here, in the order Chat should offer them.
 *
 * `runnable` is fastest first, as runnableLineup returns it; `catalogue` is the
 * whole lineup in its own order, which is how models nothing has tested here
 * are placed.
 */
export function videoMakerChoices({
  runnable,
  catalogue,
  record,
  balance,
  secondsFor,
}: {
  runnable: VideoLineupEntry[];
  catalogue: VideoLineupEntry[];
  record: LineupRecord | null | undefined;
  balance: number;
  secondsFor: (entry: VideoLineupEntry) => number | null;
}): MakerChoice[] {
  const crownedName = videoWinner(record, balance)?.model ?? null;
  const measured = new Map<string, string>();
  for (const entry of record?.entries ?? []) {
    if (typeof entry.elapsedMs !== 'number' || entry.error) continue;
    const accuracy = typeof entry.adherence === 'number'
      ? `${Math.round(entry.adherence * 100)}% of the prompt`
      : 'unjudged';
    measured.set(entry.name, `${saySeconds(entry.elapsedMs / 1000)} · ${accuracy}`);
  }
  const place = new Map(catalogue.map((entry, index) => [entry.key, index]));
  return rankChoices(runnable, {
    keyOf: (entry) => entry.key,
    crowned: (entry) => entry.name === crownedName,
    tested: (entry) => measured.has(entry.name),
    place: (entry) => place.get(entry.key) ?? catalogue.length,
  }).map((entry) => ({
    key: entry.key,
    name: entry.name,
    seconds: secondsFor(entry),
    tested: measured.get(entry.name) ?? null,
    crowned: entry.name === crownedName,
  }));
}

/** Every installed audio model, ordered the same way. */
export function audioMakerChoices({
  installed,
  results,
  balance,
}: {
  installed: AudioLineupEntry[];
  results: Record<string, AdvancedLabResult>;
  balance: number;
}): MakerChoice[] {
  const crownedName = labWinner(results, 'audio', balance)?.model ?? null;
  const measured = new Map<string, string>();
  for (const result of Object.values(results)) {
    if (!result || result.challenge !== 'audio-generation' || result.error) continue;
    if (!measured.has(result.model)) {
      measured.set(result.model, `${saySeconds(result.elapsedMs / 1000)} · ${result.grade}`);
    }
  }
  const place = new Map(installed.map((entry, index) => [entry.key, index]));
  return rankChoices(installed, {
    keyOf: (entry) => entry.key,
    crowned: (entry) => entry.name === crownedName,
    tested: (entry) => measured.has(entry.name),
    place: (entry) => place.get(entry.key) ?? installed.length,
  }).map((entry) => ({
    key: entry.key,
    name: entry.name,
    // What a clip of audio takes is not estimated per model; its length is fixed.
    seconds: null,
    tested: measured.get(entry.name) ?? null,
    crowned: entry.name === crownedName,
  }));
}
