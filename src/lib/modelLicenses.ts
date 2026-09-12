// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The licence links shown on the download consent dialog.
 *
 * These were a fixed list, so the dialog told you to review the terms and then
 * linked to Gemma's — including its prohibited-use policy and the Gemma 3
 * licence — no matter what was actually being downloaded. Someone downloading
 * DeepSeek was shown three documents that do not apply to it and none that do,
 * on the one screen whose entire job is informed consent.
 *
 * Two rules keep this honest:
 *
 *  1. A family gets its own entry only when it carries obligations beyond a
 *     standard open licence AND publishes a stable URL for them. Gemma's
 *     prohibited-use policy is the case that matters today.
 *  2. Everything else links to its own page in the Ollama library, which shows
 *     the licence the provider actually ships. That is always right, because it
 *     is the provider's own statement rather than our guess at it.
 *  3. An image or video model comes from Hugging Face, not Ollama. It links the
 *     Hugging Face page of every repository its files come from — the model's
 *     own and its encoder's, which can differ — where each licence is stated,
 *     and Hugging Face's terms rather than Ollama's.
 *
 * Hosts here must also be in ALLOWED_EXTERNAL_HOSTS in electron/main.cjs, or
 * the link opens nothing.
 */

import { generationModelById, type GenerationModel } from './generationCatalog.ts';

export type LicenseLink = { label: string; href: string };

/** True whatever is being downloaded: Ollama is the thing doing the download. */
const PROVIDER_LINKS: LicenseLink[] = [
  { label: 'Ollama model library', href: 'https://ollama.com/library' },
  { label: 'Ollama terms', href: 'https://ollama.com/terms' },
];

const FAMILY_LINKS: Array<{ match: RegExp; links: LicenseLink[] }> = [
  {
    match: /^gemma/i,
    links: [
      { label: 'Gemma terms', href: 'https://ai.google.dev/gemma/terms' },
      { label: 'Gemma prohibited use', href: 'https://ai.google.dev/gemma/prohibited_use_policy' },
    ],
  },
];

/**
 * The bare family name: "lmstudio-community/qwen2.5-coder-7b" and
 * "qwen2.5-coder:7b" are the same model wearing different labels.
 */
export function modelFamilyName(model: string): string {
  const withoutTag = model.split(':')[0];
  return withoutTag.split('/').pop()?.trim() ?? withoutTag;
}

/** The terms a person should read before downloading exactly these models. */
export function licenseLinksForModels(models: string[]): LicenseLink[] {
  const links = [...PROVIDER_LINKS];
  const seen = new Set(links.map((link) => link.href));

  for (const model of models) {
    const family = modelFamilyName(model);
    if (!family) continue;
    const known = FAMILY_LINKS.find((entry) => entry.match.test(family));
    const forModel = known?.links ?? [{
      label: `${family} licence`,
      href: `https://ollama.com/library/${encodeURIComponent(family)}`,
    }];
    for (const link of forModel) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      links.push(link);
    }
  }

  return links;
}

/** The `owner/name` of the Hugging Face repository a download comes from. */
export function huggingFaceRepo(url: string): string | null {
  return /^https:\/\/huggingface\.co\/([\w.-]+\/[\w.-]+)\/resolve\//.exec(url)?.[1] ?? null;
}

/** The repository page a Hugging Face download comes from, which is where its licence is stated. */
export function huggingFaceRepoPage(url: string): string | null {
  const repo = huggingFaceRepo(url);
  return repo ? `https://huggingface.co/${repo}` : null;
}

const HUNYUAN_TERRITORY = 'Tencent’s Hunyuan licence does not cover use in the European Union, the United Kingdom or South Korea.';
const STABILITY_COMMUNITY = 'Stability AI’s community licence requires registering for commercial use, and an '
  + 'enterprise licence for a business earning over US$1 million a year.';

/**
 * Conditions to read before downloading, by the repository a file comes from,
 * taken from each licence's own text in September 2026.
 *
 * Only the conditions that decide whether someone may use a model at all:
 * where they are, and how large a business is using it. RigMatch does not know
 * where anyone is and does not guess, so it says what the licence says and
 * leaves the answer to the person it applies to.
 */
const REPOSITORY_CONDITIONS: Record<string, string> = {
  'Comfy-Org/MiniMax-H3': 'MiniMax’s licence does not cover use in the European Union, the United Kingdom, South Korea '
    + 'or the United States, and a business earning over US$20 million a year needs MiniMax’s written permission.',
  'Comfy-Org/HunyuanVideo_1.5_repackaged': HUNYUAN_TERRITORY,
  'Comfy-Org/HunyuanVideo_repackaged': HUNYUAN_TERRITORY,
  'Kijai/HunyuanVideo_comfy': HUNYUAN_TERRITORY,
  'Lightricks/LTX-2.5': 'Lightricks’ LTX-2.x licence requires a paid commercial licence for a business with annual '
    + 'revenue of US$10 million or more.',
  'stabilityai/sdxl-turbo': STABILITY_COMMUNITY,
  'Comfy-Org/stable-audio-open-1.0_repackaged': STABILITY_COMMUNITY,
};

export type LicenceCondition = { condition: string; models: string[] };

/**
 * The conditions that apply to a download of these rows, each with the models
 * it touches.
 *
 * Read from every file a model needs, not just its own: Kandinsky 5 is MIT, but
 * the VAE and text encoder it downloads come from repositories under Tencent's
 * Hunyuan licence, and that is the licence that decides where it may be used.
 */
export function licenceConditionsForRows(
  rows: Array<{ displayName: string; runtime?: string; generationId?: string }>,
): LicenceCondition[] {
  const byCondition = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.runtime !== 'comfyui' || !row.generationId) continue;
    const model = generationModelById(row.generationId);
    if (!model) continue;
    const files = [model, ...(model.requires ?? []).map(generationModelById).filter((file): file is GenerationModel => Boolean(file))];
    for (const file of files) {
      const repo = huggingFaceRepo(file.url);
      const condition = repo ? REPOSITORY_CONDITIONS[repo] : undefined;
      if (!condition) continue;
      if (!byCondition.has(condition)) byCondition.set(condition, new Set());
      byCondition.get(condition)?.add(row.displayName);
    }
  }
  return [...byCondition].map(([condition, models]) => ({ condition, models: [...models] }));
}

const HUGGING_FACE_TERMS: LicenseLink = { label: 'Hugging Face terms', href: 'https://huggingface.co/terms-of-service' };

/**
 * The terms for a download of these rows, whichever runtime fetches each.
 *
 * Ollama rows get their family links as above. Image and video rows get the
 * page of every repository their files come from, since a model and the
 * encoder it needs are often published by different people under different
 * licences.
 */
export function licenseLinksForRows(
  rows: Array<{ displayName: string; runtime?: string; generationId?: string }>,
): LicenseLink[] {
  const ollama = rows.filter((row) => row.runtime !== 'comfyui').map((row) => row.displayName);
  const links = ollama.length > 0 ? licenseLinksForModels(ollama) : [];
  const generation = rows.filter((row) => row.runtime === 'comfyui' && row.generationId);
  if (generation.length === 0) return links;

  const seen = new Set(links.map((link) => link.href));
  const add = (link: LicenseLink) => {
    if (seen.has(link.href)) return;
    seen.add(link.href);
    links.push(link);
  };
  add(HUGGING_FACE_TERMS);
  for (const row of generation) {
    const model = generationModelById(row.generationId ?? '');
    if (!model) continue;
    const files = [model, ...(model.requires ?? []).map(generationModelById).filter((file): file is GenerationModel => Boolean(file))];
    for (const file of files) {
      const page = huggingFaceRepoPage(file.url);
      if (page) add({ label: `${file.label} licence`, href: page });
    }
  }
  return links;
}
