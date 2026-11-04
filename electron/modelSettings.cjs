// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
'use strict';

/**
 * "Each model's own settings": ask each model the way its makers recommend.
 *
 * RigMatch asks every model at temperature 0 with seed 1, so every model gets
 * the same conditions and the same answer each time. Some models are made for
 * sampling: at temperature 0 they can loop until the token limit (8 of 20
 * drawings did in the 2026-10-26 judge study), a failure the person would not
 * see using the model normally. With this choice RigMatch leaves temperature
 * out of the request, so Ollama uses the model's own values from its model
 * file, or its defaults where the model sets none. The seed stays at 1, so
 * the answers still come back the same run after run.
 */

/** The sampling values a model file can set that this choice lets through. */
const SAMPLING_KEYS = ['temperature', 'top_p', 'top_k', 'min_p', 'typical_p', 'repeat_penalty', 'repeat_last_n', 'presence_penalty', 'frequency_penalty'];

/**
 * The sampling values in Ollama's /api/show `parameters` text, one
 * "name value" per line, for saying which values a model answered with.
 * Other lines (stop words, context size) are left out. {} when the model sets
 * none, which means Ollama's defaults.
 */
function samplingFromParameters(parameters) {
  const settings = {};
  for (const line of String(parameters ?? '').split('\n')) {
    const match = line.trim().match(/^([a-z_]+)\s+(-?\d+(?:\.\d+)?)$/);
    if (match && SAMPLING_KEYS.includes(match[1])) settings[match[1]] = Number(match[2]);
  }
  return settings;
}

/** The request options for one answer: fixed, or with temperature left to the model. */
function answerOptions(fixed, sampling) {
  if (sampling !== 'model') return fixed;
  const { temperature: _fixedTemperature, ...own } = fixed;
  return own;
}

module.exports = { SAMPLING_KEYS, samplingFromParameters, answerOptions };
