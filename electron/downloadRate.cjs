// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * A download's speed, smoothed so the time left stops jumping.
 *
 * Both downloaders measured speed over the last moment only: Ollama between
 * two progress lines a fraction of a second apart, ComfyUI downloads over
 * 400 ms. Ollama fetches a model in parallel parts that land in bursts, so
 * that reading swung between 8 MB/s and 900 KB/s from one line to the next,
 * and the estimate with it: "about 8 minutes left", then "about 74" on the
 * same model.
 *
 * An exponential moving average weighted by elapsed time follows a real change
 * in speed within a few seconds, while a burst that lasts a few milliseconds
 * barely moves it.
 */

const RATE_SMOOTHING_MS = 5_000;

/**
 * The smoothed speed after one more sample, in bytes per second.
 *
 * `elapsedMs` is the time the sample covers. The first sample is taken as it
 * is; one that is not a number keeps the previous speed.
 */
function smoothRate(previousBps, sampleBps, elapsedMs, smoothingMs = RATE_SMOOTHING_MS) {
  if (!Number.isFinite(sampleBps) || sampleBps < 0) return previousBps ?? null;
  if (previousBps == null || !Number.isFinite(previousBps)) return sampleBps;
  const weight = 1 - Math.exp(-Math.max(0, elapsedMs) / smoothingMs);
  return previousBps + weight * (sampleBps - previousBps);
}

module.exports = { smoothRate, RATE_SMOOTHING_MS };
