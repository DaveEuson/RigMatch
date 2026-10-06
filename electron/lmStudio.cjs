// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * LM Studio's models, read the way Ollama's are.
 *
 * LM Studio 0.4 and later describe every downloaded model at /api/v1/models:
 * size, quantization, parameters, and whether it sees images or calls tools.
 * The OpenAI-compatible /v1/models, all that older versions have, gives a name
 * and nothing else, so every LM Studio row had no size, RigMatch could not say
 * whether it fit, and Simple Mode left it out.
 */
const { inferParamsFromModelName } = require('./ollamaCatalog.cjs');

/** The server root: LM Studio's native API sits beside /v1, not under it. */
function lmStudioOrigin(baseUrl) {
  return String(baseUrl).replace(/\/$/, '').replace(/\/v1$/, '');
}

function bytesToGb(bytes) {
  if (!Number.isFinite(bytes)) return 0;
  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
}

/**
 * One model from /api/v1/models, in the shape getOllamaStatus returns.
 *
 * Capabilities are written in Ollama's words, so canReadImages, the word
 * filters and the show's own checks read both providers the same way: an
 * embedding model gets no 'completion' and stays out of shows, as Ollama's do.
 */
function lmStudioModelFromRest(model, baseUrl) {
  const key = String(model?.key || '').trim();
  if (!key) return null;
  const abilities = model.capabilities || {};
  const capabilities = model.type === 'embedding'
    ? ['embedding']
    : [
      'completion',
      ...(abilities.vision ? ['vision'] : []),
      ...(abilities.trained_for_tool_use ? ['tools'] : []),
      ...(abilities.reasoning ? ['thinking'] : []),
    ];
  return {
    name: key,
    model: key,
    sizeGb: bytesToGb(model.size_bytes),
    family: model.architecture || undefined,
    parameterSize: model.params_string || inferParamsFromModelName(key) || 'Local',
    quantization: model.quantization?.name || undefined,
    capabilities,
    provider: 'lm-studio',
    providerLabel: 'LM Studio',
    baseUrl,
  };
}

/** Said when the server wants a token, which RigMatch has no setting for. */
const LM_STUDIO_TOKEN_MESSAGE = 'LM Studio is asking for an API token. Turn off "Require authentication" in its Developer tab so RigMatch can test its models.';

module.exports = { lmStudioOrigin, lmStudioModelFromRest, LM_STUDIO_TOKEN_MESSAGE };
