/**
 * How much of a model's memory RigMatch Chat actually asks for.
 *
 * The app used to send no `options` block at all, so Ollama fell back to its
 * own default of 4096 tokens — for a model that supports 131072. Worse than the
 * small number was the silence: past the limit, Ollama keeps the system prompt
 * and the newest tokens and discards everything between, so a 5602-token
 * conversation was evaluated as 82 tokens. The transcript still showed every
 * message while the model could no longer see any of them, which reads as the
 * model being stupid rather than the app being misconfigured.
 *
 * Asking for the model's full context is not the answer either. The KV cache is
 * allocated up front and grows linearly with the context, so llama3.2:3b at its
 * full 131072 wants about 15 GB of VRAM on its own — Ollama would spill layers
 * to the CPU and the model would crawl.
 *
 * So: size it from the model's own metadata against a memory budget.
 */

export type ModelContextInfo = {
  /** Context length the model itself declares (`*.context_length`). */
  maxContext: number;
  /** Transformer layers (`*.block_count`). */
  blockCount: number;
  /** Key/value heads — lower than head_count under grouped-query attention. */
  headCountKv: number;
  /** Per-head key width (`*.attention.key_length`). */
  keyLength: number;
  /** Per-head value width (`*.attention.value_length`). */
  valueLength: number;
};

/** Ollama's default when no num_ctx is given, and our floor. */
export const OLLAMA_DEFAULT_CONTEXT = 4096;

/**
 * KV cache we are willing to spend before asking for more context. 2 GiB sits
 * under the headroom of a card that can already hold the model, and is checked
 * against the model's real per-token cost rather than guessed per model size.
 */
export const DEFAULT_KV_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Ceiling for the automatic choice. 32768 tokens is roughly 24,000 words — past
 * any real conversation — and prompt processing gets slower the larger the
 * window, so going higher should be a deliberate act, not a default.
 */
export const AUTO_CONTEXT_CEILING = 32768;

export type VramInfo = {
  totalBytes: number;
  /** System RAM shared with the CPU (Apple Silicon) rather than a card's own. */
  unified: boolean;
};

/**
 * Share of the pool the model and its KV cache may occupy between them.
 *
 * Going over does not fail, it spills layers to the CPU and the model crawls —
 * the worst outcome for a product about speed, and invisible unless you are
 * watching. A dedicated card only has to leave room for the desktop; unified
 * memory is also running the operating system and everything else, so it keeps
 * considerably more back.
 */
export const VRAM_USABLE_SHARE = 0.7;
export const UNIFIED_USABLE_SHARE = 0.5;

/**
 * KV budget for a model on this machine, or null when the hardware is unknown
 * and the caller should keep its fixed default.
 *
 * Weights are subtracted because they are in the same pool: a 7B model leaves
 * far less room for context than a 3B on the same card, which a budget
 * expressed as a flat number of bytes cannot express.
 */
export function kvBudgetFromVram(vram: VramInfo | null, modelWeightBytes: number): number | null {
  if (!vram || !Number.isFinite(vram.totalBytes) || vram.totalBytes <= 0) return null;
  const share = vram.unified ? UNIFIED_USABLE_SHARE : VRAM_USABLE_SHARE;
  const usable = vram.totalBytes * share;
  const weights = Number.isFinite(modelWeightBytes) && modelWeightBytes > 0 ? modelWeightBytes : 0;
  // A model whose weights already exceed the share gets nothing extra — the
  // floor in chooseContextSize keeps it at Ollama's default rather than below.
  return Math.max(0, usable - weights);
}

/** Sizes offered in Settings. Powers of two because llama.cpp likes them. */
export const CONTEXT_STEPS = [4096, 8192, 16384, 32768, 65536, 131072] as const;

/**
 * Bytes of KV cache per token of context.
 *
 * Both a key and a value vector per head, per layer, at f16 (2 bytes) — which
 * is what Ollama uses unless KV quantization is explicitly turned on.
 */
export function kvBytesPerToken(info: ModelContextInfo): number {
  return info.blockCount * info.headCountKv * (info.keyLength + info.valueLength) * 2;
}

/** VRAM the KV cache will occupy at a given context size. */
export function kvCacheBytes(info: ModelContextInfo, contextSize: number): number {
  return kvBytesPerToken(info) * contextSize;
}

/**
 * The context size to request for a model, given what it supports and what its
 * KV cache costs.
 *
 * Never returns less than Ollama's own default — this should only ever move a
 * conversation's memory up — and never more than the model declares, since
 * asking beyond that is silently clamped anyway.
 */
export function chooseContextSize(
  info: ModelContextInfo | null,
  // Accepts null so the result of kvBudgetFromVram can be passed straight
  // through. A default parameter only fills in for undefined, and a null
  // budget compares as zero — every size would look unaffordable and every
  // model would silently drop back to 4096, which is the bug this all exists
  // to fix.
  budgetBytes?: number | null,
  ceiling: number = AUTO_CONTEXT_CEILING,
): number {
  const budget = typeof budgetBytes === "number" && Number.isFinite(budgetBytes)
    ? budgetBytes
    : DEFAULT_KV_BUDGET_BYTES;
  if (!info || !Number.isFinite(info.maxContext) || info.maxContext <= 0) {
    return OLLAMA_DEFAULT_CONTEXT;
  }
  // A model that supports less than the default gets its own limit, not ours.
  if (info.maxContext < OLLAMA_DEFAULT_CONTEXT) return info.maxContext;

  const perToken = kvBytesPerToken(info);
  const limit = Math.min(info.maxContext, ceiling);
  let best = OLLAMA_DEFAULT_CONTEXT;
  for (const step of CONTEXT_STEPS) {
    if (step > limit) break;
    // Unknown or nonsensical metadata: fall back to the size alone rather than
    // dividing by zero and accepting everything.
    if (perToken > 0 && step * perToken > budget) break;
    best = step;
  }
  return best;
}

/**
 * Rough token count for text not yet sent.
 *
 * Only used to keep the meter moving while typing — every completed turn
 * replaces it with `prompt_eval_count`, the exact number Ollama evaluated.
 * Four characters per token is the usual English approximation.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Tokens to hold back for the model's own reply. A prompt that fills the window
 * completely leaves nothing to answer with, and Ollama would drop the oldest
 * turns to make room without saying so.
 */
export const REPLY_HEADROOM_TOKENS = 1024;

export type ContextUsage = {
  used: number;
  limit: number;
  /** Share of the window the conversation occupies, 0–1, clamped. */
  fraction: number;
  /** The next turn will not fit without something being dropped. */
  willTruncate: boolean;
  /** Close enough that the user should know before it starts dropping turns. */
  nearLimit: boolean;
};

export function getContextUsage(used: number, limit: number): ContextUsage {
  const safeLimit = limit > 0 ? limit : OLLAMA_DEFAULT_CONTEXT;
  const fraction = Math.max(0, Math.min(1, used / safeLimit));
  return {
    used,
    limit: safeLimit,
    fraction,
    willTruncate: used + REPLY_HEADROOM_TOKENS >= safeLimit,
    nearLimit: fraction >= 0.75,
  };
}

/** "16K" / "128K" for a context size, "4,096" style for a live token count. */
export function formatContextSize(tokens: number): string {
  if (tokens >= 1024 && tokens % 1024 === 0) return `${tokens / 1024}K`;
  return tokens.toLocaleString();
}

export function formatGib(bytes: number): string {
  const gib = bytes / (1024 * 1024 * 1024);
  if (gib < 0.1) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${gib.toFixed(1)} GB`;
}
