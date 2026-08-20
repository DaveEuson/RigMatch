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
