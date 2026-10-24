// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What a RigScore speed feels like, in words.
 *
 * Points say how this PC compares with the reference; they do not say whether
 * it is pleasant to use. LocalScore answers that with a guide beside its number
 * (1,000 excellent, 250 passable, under 100 poor). This is RigMatch's, on the
 * writing speed itself, because that is what a person waits on, and because a
 * tier still waiting for its reference has no points but does have a speed.
 *
 * The thresholds, in tokens per second of writing:
 *  - 5: people read about 240 words a minute, 4 words a second, and the tier
 *    models spend about 1.15 tokens a word (RigScore's passage: 1,294 words,
 *    1,486 tokens), so about 5 tokens a second. Below it the text arrives
 *    slower than you read it. The glossary already says "below about five,
 *    replies feel slow enough to be annoying".
 *  - 20: about 17 words a second, four times reading pace. The glossary says
 *    "above twenty feels immediate".
 *  - 50: a page-long answer or a function with its explanation (about 500
 *    tokens) in ten seconds, so long answers stop being a wait too.
 *
 * The bands and the points are separate on purpose: points compare this PC
 * with the reference, the band says what using it is like.
 */

export type SpeedBandId = 'excellent' | 'fast' | 'usable' | 'slow';

export type SpeedBand = {
  id: SpeedBandId;
  label: string;
  /** Writing speed this band starts at, in tokens per second. */
  minTps: number;
  /** What it is like to use, in a sentence. */
  feel: string;
};

/** Fastest first. */
export const RIG_SPEED_BANDS: readonly SpeedBand[] = [
  { id: 'excellent', label: 'Excellent', minTps: 50, feel: 'Long answers and code arrive in seconds.' },
  { id: 'fast', label: 'Fast', minTps: 20, feel: 'Answers faster than you can read.' },
  { id: 'usable', label: 'Usable', minTps: 5, feel: 'Usable, a bit slow: keeps up with your reading, but long answers take a while.' },
  { id: 'slow', label: 'Slow', minTps: 0, feel: 'Slower than you read. You wait on every answer.' },
];

/** The band a writing speed falls in. Not a number (no measure) reads as Slow. */
export function speedBand(decodeTps: number): SpeedBand {
  const tps = Number.isFinite(decodeTps) ? decodeTps : 0;
  return RIG_SPEED_BANDS.find((band) => tps >= band.minTps) ?? RIG_SPEED_BANDS[RIG_SPEED_BANDS.length - 1];
}

/** "From 20 tok/s" for a band's line on the scale. */
export function bandRange(band: SpeedBand): string {
  const index = RIG_SPEED_BANDS.indexOf(band);
  const above = index > 0 ? RIG_SPEED_BANDS[index - 1].minTps : null;
  if (above === null) return `${band.minTps}+ tok/s`;
  if (band.minTps === 0) return `under ${above} tok/s`;
  return `${band.minTps} to ${above} tok/s`;
}

/** Seconds to read a prompt of `tokens` at a prompt speed: the wait before the first word. */
export function promptWaitSeconds(prefillTps: number, tokens: number): number | null {
  if (!Number.isFinite(prefillTps) || prefillTps <= 0) return null;
  return tokens / prefillTps;
}
