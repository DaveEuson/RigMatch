// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { OllamaModel } from "./ollamaApi";

/**
 * Drop `name:latest` when it is only another name for a tag that is listed too.
 *
 * Ollama lists one model under every tag it was pulled as, so `llama3.2` and
 * `llama3.2:3b` can be the same weights twice. This used to drop `:latest`
 * whenever any other tag of the model existed, so pulling `llama3.2:1b` beside
 * `llama3.2` hid the 3B, and every chat with it. Only the digest says whether
 * two names are the same model; without one, both are kept.
 */
export function deduplicateModels(models: OllamaModel[]): OllamaModel[] {
  return models.filter((m) => {
    const [base, tag] = m.name.split(":");
    if (tag !== "latest" || !m.digest) return true;
    return !models.some((other) => other !== m
      && other.name.split(":")[0] === base
      && other.digest === m.digest);
  });
}
