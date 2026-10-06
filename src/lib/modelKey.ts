// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Model-name normalization, kept in its own leaf module so storage layers can
 * key by model without pulling in modelCatalog's React/asset dependency graph.
 * modelCatalog re-exports this, so existing importers are unaffected.
 */

/** Ollama treats model names case-insensitively; storage keys must match. */
export function normalizeModelKey(model: string | null | undefined) {
  return String(model || '').trim().toLowerCase();
}

/**
 * One model's weights, whatever a provider calls them.
 *
 * Ollama's `qwen3:8b` and LM Studio's `qwen/qwen3-8b` are the same model, so
 * one judging the other is a model marking its own answers, which it marks
 * generously. Names alone missed that: the judge list holds both providers,
 * the two copies are the same size, and they sat side by side at the top.
 *
 * Drops the path (publisher, hf.co/owner), the quantization and file format,
 * and the instruction-tuning word, then everything but letters and digits:
 * `llama3.2:3b`, `llama-3.2-3b-instruct` and
 * `hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M` all become `llama323b`.
 * A different size or a newer release (`qwen3-4b-2507`) stays different.
 */
export function modelWeightsKey(model: string | null | undefined): string {
  return (String(model || '').trim().toLowerCase().split('/').pop() ?? '')
    .replace(/:latest$/, '')
    .replace(/[-_:.](?:i?q\d\w*|f16|bf16|fp16|f32|gguf|mlx)(?=$|[-_:.])/g, '')
    .replace(/[-_:.](?:instruct|it|chat)(?=$|[-_:.])/g, '')
    .replace(/[^a-z0-9]/g, '');
}
