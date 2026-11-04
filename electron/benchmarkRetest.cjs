// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
'use strict';

const { totalsFromPrompts } = require('./benchmarkTotals.cjs');

/**
 * When a question goes wrong because of the PC rather than the model.
 *
 * RigMatch asks at temperature 0 with a fixed seed, so an answer the model cut
 * off at the token limit, or looped on, comes back the same every time: asking
 * again would only repeat it. What asking again can fix is the PC's part: a
 * dropped connection, Ollama failing mid-answer, or a reply that ran out of time
 * while something else held the graphics card.
 */

/** Ollama's ways of saying a model does not fit. Asking again straight away cannot help. */
const OUT_OF_MEMORY = /requires more system memory|out of memory|not enough memory|insufficient memory|cudamalloc failed|unable to allocate/i;

/**
 * Why a question's request failed, when one more try could fix it: 'timed out'
 * or 'connection lost'. Null for anything else: the user pressing Stop, a
 * request Ollama refused (a 4xx), or a model that does not fit.
 */
function transientFailure(error) {
  const message = String(error?.message ?? error ?? '');
  if (error?.name === 'AbortError' || /stopped by user|Request stopped/i.test(message)) return null;
  if (OUT_OF_MEMORY.test(message)) return null;
  // fetchJson's own words for a request that was accepted and never finished.
  if (/did not finish within \d+s/i.test(message)) return 'timed out';
  if (/Cannot reach local AI service|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|other side closed/i.test(message)) return 'connection lost';
  // Ollama answered with a server error, such as its runner stopping mid-answer.
  if (/^5\d\d\b/.test(message)) return 'connection lost';
  return null;
}

/**
 * Whether asking a saved answer again could give a different result: an answer
 * the PC broke, in a result saved with what an exact re-score needs. Through
 * 0.10 the only such answer a finished run keeps is a drawing that ran out of
 * time; every other PC failure ended the model's run.
 */
function canRetest(promptResult) {
  if (!promptResult || typeof promptResult.countedRuns !== 'number') return false;
  return promptResult.timedOut === true || /^timeout$/i.test(String(promptResult.doneReason || ''));
}

/**
 * The run with one answer asked again: the new answer in the old one's place,
 * the first try kept beside it, and the scores worked out again from the
 * answers with the run's own Fit, the same way a clean run is scored.
 */
function mergeRetest(previous, retestedPrompt, { at = new Date().toISOString() } = {}) {
  const index = previous.prompts.findIndex((prompt) => prompt.id === retestedPrompt.id);
  if (index < 0) throw new Error(`The answer to retest (${retestedPrompt.id}) is not in this run.`);
  const firstTry = previous.prompts[index];
  const prompts = previous.prompts.slice();
  prompts[index] = {
    ...retestedPrompt,
    retest: {
      at,
      // Asked a third time, the first try is still the run's own, not the last retest.
      firstTry: firstTry.retest?.firstTry ?? {
        status: firstTry.status,
        doneReason: firstTry.doneReason,
        diagnostic: firstTry.diagnostic,
        ...(firstTry.timedOut ? { timedOut: true } : {}),
      },
    },
  };
  const totals = totalsFromPrompts(prompts, previous.scores.fit);
  return {
    ...previous,
    prompts,
    scores: totals.scores,
    avgTokensPerSecond: totals.avgTokensPerSecond,
    avgLatencyMs: totals.avgLatencyMs,
  };
}

module.exports = { transientFailure, canRetest, mergeRetest };
