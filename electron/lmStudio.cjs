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

/**
 * A question for /api/v1/chat, asked the way Ollama is asked it.
 *
 * The OpenAI route RigMatch used before added a system message ("You are
 * taking a RigMatch local model compatibility test...") that Ollama's
 * contestants never saw, so the two were not even answering the same thing.
 * Now it is the bare question, the same length cap and context window as
 * BENCHMARK_GENERATE_OPTIONS, temperature 0, and thinking off when asked.
 */
function lmStudioChatBody({ model, prompt, maxOutputTokens, contextLength, reasoningOff, temperature = 0, images = [], stream = false }) {
  const body = {
    model,
    // A picture goes beside the words as its own item, as a data URL. Labs'
    // picture-reading test is the one caller with any.
    input: images.length
      ? [{ type: 'text', content: prompt }, ...images.map((dataUrl) => ({ type: 'image', data_url: dataUrl }))]
      : prompt,
    temperature,
    max_output_tokens: maxOutputTokens,
    context_length: contextLength,
    stream,
    // A test is not a conversation to keep in LM Studio's history.
    store: false,
  };
  if (reasoningOff) body.reasoning = 'off';
  return body;
}

/** The text of a /api/v1/chat reply: its message items, not its reasoning. */
function lmStudioChatText(response) {
  const items = Array.isArray(response?.output) ? response.output : [];
  return items
    .filter((item) => item?.type === 'message')
    .map((item) => (typeof item.content === 'string'
      ? item.content
      : Array.isArray(item.content) ? item.content.map((part) => part?.text ?? '').join('') : ''))
    .join('');
}

/**
 * A /api/v1/chat reply in the units runBenchmarkPromptParity reports.
 *
 * Speed is LM Studio's own tokens per second, the counterpart of Ollama's
 * eval_count / eval_duration. RigMatch used to divide by the wall clock,
 * which counted loading the model and reading the prompt as generation, so
 * the same model scored slower in LM Studio than in Ollama.
 */
function readLmStudioChat(response, maxOutputTokens) {
  const stats = response?.stats || {};
  const responseText = lmStudioChatText(response);
  // Every generated token, reasoning included, as Ollama's eval_count counts
  // them, so evalCount / evalDurationSeconds comes out at LM Studio's own rate.
  const outputTokens = Number(stats.total_output_tokens) || 0;
  const tokensPerSecond = Number(stats.tokens_per_second) || 0;
  const seconds = (value) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value) * 1000) : null);
  return {
    responseText,
    evalCount: outputTokens,
    evalDurationSeconds: tokensPerSecond > 0 ? outputTokens / tokensPerSecond : 0,
    // Ollama's done_reason is 'length' when the cap cut an answer off, which
    // is how a truncated answer gets flagged. LM Studio's stats do not say,
    // so an answer that used the whole allowance is read the same way.
    doneReason: maxOutputTokens && outputTokens >= maxOutputTokens ? 'length' : 'stop',
    promptEvalDurationMs: seconds(stats.time_to_first_token_seconds),
    // Only present when this request had to load the model.
    loadDurationMs: stats.model_load_time_seconds == null ? null : seconds(stats.model_load_time_seconds),
  };
}

/**
 * runAgentTask's messages, written for Ollama's /api/chat, as an
 * OpenAI-compatible server wants them: a tool result names the call it
 * answers by id, where Ollama names the tool.
 */
function toOpenAiToolMessages(messages) {
  const out = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      const previous = [...out].reverse().find((m) => m.role === 'assistant' && Array.isArray(m.tool_calls));
      const call = previous?.tool_calls.find((c) => c.function?.name === message.tool_name) ?? previous?.tool_calls[0];
      out.push({ role: 'tool', tool_call_id: call?.id ?? message.tool_name, content: message.content });
      continue;
    }
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      out.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls.map((call, index) => ({
          id: call.id ?? `call_${index}`,
          type: 'function',
          function: {
            name: call.function?.name,
            arguments: typeof call.function?.arguments === 'string'
              ? call.function.arguments
              : JSON.stringify(call.function?.arguments ?? {}),
          },
        })),
      });
      continue;
    }
    out.push({ role: message.role, content: message.content });
  }
  return out;
}

/**
 * An OpenAI-compatible tool reply in the shape runAgentTask reads from
 * Ollama, with LM Studio's stats (/api/v0 adds them) turned into Ollama's
 * nanosecond durations so the tool questions are timed like the rest.
 */
function toolReplyFromOpenAi(response) {
  const choice = response?.choices?.[0] || {};
  const stats = response?.stats || {};
  const ns = (value) => (Number(value) > 0 ? Math.round(Number(value) * 1e9) : 0);
  const outputTokens = Number(response?.usage?.completion_tokens) || 0;
  const tokensPerSecond = Number(stats.tokens_per_second) || 0;
  return {
    message: { role: 'assistant', content: choice.message?.content ?? '', tool_calls: choice.message?.tool_calls ?? [] },
    eval_count: outputTokens,
    // From LM Studio's own rate, like every other answer. Its generation_time
    // also holds the wait for the first token, which Ollama's eval_duration
    // does not: measured on a real LM Studio, 0.295 s for 38 tokens is 129
    // tok/s where LM Studio's own figure for the same answer was 142.
    eval_duration: tokensPerSecond > 0 && outputTokens > 0 ? ns(outputTokens / tokensPerSecond) : ns(stats.generation_time),
    prompt_eval_duration: ns(stats.time_to_first_token),
    done_reason: choice.finish_reason === 'length' ? 'length' : 'stop',
  };
}

/** The ids of a model's loaded copies, from a /api/v1/models listing. */
function loadedInstanceIds(listing, model) {
  const entry = (Array.isArray(listing?.models) ? listing.models : []).find((m) => m?.key === model);
  return (Array.isArray(entry?.loaded_instances) ? entry.loaded_instances : []).map((i) => i?.id).filter(Boolean);
}

module.exports = {
  lmStudioOrigin,
  lmStudioModelFromRest,
  LM_STUDIO_TOKEN_MESSAGE,
  lmStudioChatBody,
  lmStudioChatText,
  readLmStudioChat,
  toOpenAiToolMessages,
  toolReplyFromOpenAi,
  loadedInstanceIds,
};
