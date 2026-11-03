// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
'use strict';

const { average, clamp } = require('./benchmarkScoring.cjs');
const { speedScoreFor } = require('./matchFit.cjs');

/**
 * The Match grade for a 0-100 total. The renderer's MATCH_GRADE_BANDS in
 * src/lib/scoring.ts must say the same; tests/scoring.test.mjs checks the two
 * against each other at every score.
 */
function gradeFor(score) {
  if (score >= 95) return 'S';
  if (score >= 88) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 72) return 'B';
  if (score >= 64) return 'C';
  return 'D';
}

/**
 * A run's scores from its answers alone, so a retested answer can be dropped in
 * and the run scored again exactly as a clean run would be.
 *
 * Each answer carries its own reliability count (countedRuns and stableRuns),
 * because the timing runs behind it are not kept: a drawing that ran out of
 * time is in neither, as it says the PC is slow, which speed already counts.
 * Fit is the run's own, read once from the PC (matchFit.cjs), and is passed in.
 */
function totalsFromPrompts(promptResults, fitScore) {
  // A tool question Ollama refused for this model comes back in milliseconds
  // with nothing generated; timed, it would read as the fastest answer of the
  // run. It scores 0 for answer quality and stays out of speed.
  // Nor does a drawing that came back empty: one dropped at its deadline
  // (runDrawingPrompt) generated for 90 seconds and reports no tokens, which
  // would read as a rate near zero. It already scores 0 as no drawing.
  const timedResults = promptResults.filter((result) => !result.toolsUnsupported
    && !(result.type === 'drawing' && result.status === 'no-response'));
  const avgTokens = average(timedResults.map((result) => result.tokensPerSecond));
  const avgLatency = average(timedResults.map((result) => result.elapsedMs));
  /**
   * Answer quality, from the answers something could actually mark.
   *
   * An 'unjudged' score is a placeholder: prose scored by its character count,
   * or code the scorer can only confirm is code. Rank on what was measured;
   * fall back to the full set only when nothing at all could be marked, so a
   * run still produces a score rather than a blank.
   */
  const markedResults = promptResults.filter((result) => result.scoredBy !== 'unjudged');
  const avgSobriety = average((markedResults.length > 0 ? markedResults : promptResults)
    .map((result) => result.sobrietyScore));
  const counted = promptResults.reduce((sum, result) => sum + (result.countedRuns ?? 0), 0);
  const stable = promptResults.reduce((sum, result) => sum + (result.stableRuns ?? 0), 0);
  const stability = Math.round((stable / Math.max(1, counted)) * 100);
  const speed = speedScoreFor(avgTokens);
  const total = clamp(Math.round(speed * 0.32 + avgSobriety * 0.34 + stability * 0.18 + fitScore * 0.16));
  return {
    scores: {
      speed,
      sobriety: Math.round(avgSobriety),
      stability,
      fit: fitScore,
      total,
      grade: gradeFor(total),
    },
    avgTokensPerSecond: Math.round(avgTokens * 10) / 10,
    avgLatencyMs: Math.round(avgLatency),
    unmarkedCount: promptResults.length - markedResults.length,
  };
}

module.exports = { gradeFor, totalsFromPrompts };
