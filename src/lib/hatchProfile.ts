import type { TestedModelScore } from '../types';

// The JSON profile Hatch's "Import a RigMatch profile" box accepts. Only
// recommendedLocalModel is required; Hatch ignores any extra fields, so we
// include richer RigMatch data (score, rig specs) too.
export type HatchProfile = {
  source: 'rigmatch';
  device?: string;
  recommendedLocalModel: string;
  fallbackModel?: string;
  confidence?: string;
  note?: string;
  // Extras Hatch ignores but that carry the full RigMatch context.
  matchScore?: number;
  grade?: string;
  vramGb?: number;
  ramGb?: number;
};

export type BuildHatchResult =
  | { ok: true; profile: HatchProfile; json: string }
  | { ok: false; reason: string };

// An Ollama chat model RigMatch could recommend, already classified by the
// caller (which owns the LM Studio / cloud / image / embedding filtering).
export type HatchCandidate = {
  tag: string;                       // the exact `ollama pull <tag>` string (row.displayName)
  sizeGb: number | null;
  score?: TestedModelScore | null;
};

// An `ollama pull <tag>` target: name segments, optional namespace segments,
// and an optional `:tag`. Case-insensitive (the `/i` flag) since real quant tags
// carry uppercase, e.g. `:Q4_K_M`. Mirrors the main process MODEL_NAME_PATTERN
// that guards real pulls, plus a hard length cap and a no-URL guard. Hatch runs
// `ollama pull` on this string, so it must be exactly what the CLI expects —
// not a display name.
const OLLAMA_PULL_TAG = /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$/i;

export function isValidOllamaPullTag(tag: string | null | undefined): boolean {
  const value = (tag ?? '').trim();
  if (!value || value.length > 120) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false; // reject URLs
  return OLLAMA_PULL_TAG.test(value);
}

function bySizeDesc(a: HatchCandidate, b: HatchCandidate): number {
  return (b.sizeGb ?? 0) - (a.sizeGb ?? 0);
}

/**
 * Build the Hatch-import JSON profile from RigMatch's current recommendation and
 * hardware detection. `candidates` must already be Ollama-pullable chat models
 * (the caller filters out LM Studio / cloud / image / embedding models, which
 * `ollama pull` can't fetch). Returns { ok:false } with a reason when no such
 * model fits yet — Hatch needs a real pull tag.
 */
export function buildHatchProfile(opts: {
  recommendedTag: string | null;
  candidates: HatchCandidate[];
  device: string;
  gpuLabel: string;
  vramGb: number;
  ramGb: number;
  reason?: string | null;
}): BuildHatchResult {
  const { recommendedTag, device, gpuLabel, vramGb, ramGb, reason } = opts;
  const valid = opts.candidates.filter((candidate) => isValidOllamaPullTag(candidate.tag));

  // Prefer RigMatch's own pick when it's a valid Ollama candidate; otherwise the
  // best candidate — highest Match total, else the largest overall (candidates
  // are already the caller's fitting set, so largest ≈ most capable here).
  let recommended: HatchCandidate | null = null;
  if (recommendedTag && valid.some((c) => c.tag === recommendedTag)) {
    recommended = valid.find((c) => c.tag === recommendedTag) ?? null;
  } else {
    const scored = valid.filter((c) => c.score).sort((a, b) => (b.score!.total) - (a.score!.total));
    recommended = scored[0] ?? [...valid].sort(bySizeDesc)[0] ?? null;
  }

  if (!recommended) {
    return { ok: false, reason: 'No Ollama chat model fits this computer yet. Download or test one first, then export.' };
  }
  if (!isValidOllamaPullTag(recommended.tag)) {
    return { ok: false, reason: `"${recommended.tag}" is not a valid Ollama pull tag, so Hatch could not pull it.` };
  }

  // Fallback: the largest model smaller than the pick (a lighter, faster second
  // choice), else the smallest other candidate.
  const recSize = recommended.sizeGb ?? Infinity;
  const others = valid.filter((c) => c.tag !== recommended!.tag && (c.sizeGb ?? 0) > 0);
  const smaller = others.filter((c) => (c.sizeGb ?? 0) < recSize).sort(bySizeDesc);
  const fallback = smaller[0] ?? [...others].sort((a, b) => (a.sizeGb ?? 0) - (b.sizeGb ?? 0))[0] ?? null;
  const fallbackTag = fallback && isValidOllamaPullTag(fallback.tag) ? fallback.tag : undefined;

  const score = recommended.score ?? undefined;
  const confidence = score
    ? (score.total >= 85 ? 'high' : score.total >= 68 ? 'medium' : 'low')
    : 'estimated';
  const note = (score
    ? `RigMatch's top match for ${gpuLabel} — grade ${score.grade}, ${score.total}/100 across speed, answer quality, and hardware fit.`
    : (reason || `${recommended.tag} is sized to fit ${gpuLabel} by RigMatch's hardware check.`)).slice(0, 200);

  const profile: HatchProfile = {
    source: 'rigmatch',
    device: device.slice(0, 80),
    recommendedLocalModel: recommended.tag,
    ...(fallbackTag ? { fallbackModel: fallbackTag } : {}),
    confidence,
    note,
    ...(score ? { matchScore: score.total, grade: score.grade } : {}),
    ...(vramGb > 0 ? { vramGb: Math.round(vramGb) } : {}),
    ...(ramGb > 0 ? { ramGb: Math.round(ramGb) } : {}),
  };

  return { ok: true, profile, json: JSON.stringify(profile, null, 2) };
}
