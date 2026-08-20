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
 *
 * Hosts here must also be in ALLOWED_EXTERNAL_HOSTS in electron/main.cjs, or
 * the link opens nothing.
 */

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
