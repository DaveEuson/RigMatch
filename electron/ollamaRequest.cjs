// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * What every timed request to Ollama shares: the body the benchmark sends, the
 * check for an Ollama too old for it, and the number reader. Kept apart from
 * benchmarkScoring.cjs, which scores answers and pulls in the agent-tool and
 * drawing-round checks, so the speed test's runner (rigScoreRunner.cjs), and
 * with it the bundled command-line speed test, carries only these. The scorer
 * and the main process import them from benchmarkScoring.cjs as before.
 */

/** The benchmark's /api/generate body: one answer, thinking off, kept loaded for keepAlive. */
function buildBenchmarkGenerateBody({ model, prompt, keepAlive, options }) {
  return {
    model,
    prompt,
    stream: false,
    keep_alive: keepAlive,
    think: false,
    options,
  };
}

/**
 * An Ollama too old for the `think` switch refuses the whole request with an
 * error naming it. Callers ask again without it. Shared by the main process
 * and the command-line speed test (cli/), which both send think:false.
 */
function isUnsupportedThinkError(error) {
  const message = String(error?.message || error || 'Unknown error').toLowerCase();
  return message.includes('think')
    && (
      message.includes('unknown')
      || message.includes('unsupported')
      || message.includes('invalid')
      || message.includes('unrecognized')
    );
}

function normalizePositiveNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

module.exports = { buildBenchmarkGenerateBody, isUnsupportedThinkError, normalizePositiveNumber };
