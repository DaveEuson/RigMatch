// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ModelRow } from '../types';

// Families with (or awaiting) their own contestant portrait. New families map to
// the generic robot in MODEL_AVATAR_ASSETS until their art lands — see
// docs/avatar-art-direction.md for the house style.
export type ModelFamilyId =
  | 'deepseek' | 'llama' | 'qwen' | 'mistral' | 'gemma' | 'phi'
  | 'granite' | 'cohere' | 'vision' | 'yi' | 'solar' | 'falcon'
  | 'starcoder' | 'smollm' | 'stablelm' | 'imagegen'
  | 'generic';

export type ModelOrigin = {
  family: ModelFamilyId;
  country: string;
  organization: string;
};

export function getModelFamily(model: string): ModelFamilyId {
  const lower = String(model || '').toLowerCase();
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('llama')) return 'llama';
  if (lower.includes('qwen')) return 'qwen';
  // Mistral AI's own models that don't contain the literal string "mistral" —
  // without these, Mixtral (their flagship MoE) and Devstral fell through to the
  // generic robot and an unknown vendor.
  if (lower.includes('mistral') || lower.includes('mixtral') || lower.includes('devstral') || lower.includes('codestral')) return 'mistral';
  if (lower.includes('gemma')) return 'gemma';
  if (lower.includes('phi')) return 'phi';

  // Families awaiting their own portrait. Checked after the six above so
  // variants like codegemma keep their parent's art. Short names use word
  // boundaries so "yi" and "aya" can't match inside unrelated model names.
  if (lower.includes('granite')) return 'granite';
  if (lower.includes('command-r') || /(^|[^a-z])aya([^a-z]|$)/.test(lower)) return 'cohere';
  if (lower.includes('llava') || lower.includes('moondream') || lower.includes('minicpm')) return 'vision';
  if (/(^|[^a-z])yi([^a-z]|$)/.test(lower)) return 'yi';
  if (lower.includes('solar')) return 'solar';
  if (lower.includes('falcon')) return 'falcon';
  if (lower.includes('starcoder')) return 'starcoder';
  if (lower.includes('smollm')) return 'smollm';
  if (lower.includes('stablelm')) return 'stablelm';
  if (lower.includes('flux') || lower.includes('z-image') || lower.includes('image-turbo')) return 'imagegen';

  return 'generic';
}

export function getModelOrigin(model: string): ModelOrigin {
  const family = getModelFamily(model);
  const lower = String(model || '').toLowerCase();

  switch (family) {
    case 'deepseek':
      return { family, country: 'China', organization: 'DeepSeek' };
    case 'qwen':
      return { family, country: 'China', organization: 'Alibaba Cloud' };
    case 'mistral':
      return { family, country: 'France', organization: 'Mistral AI' };
    case 'llama':
      return { family, country: 'United States', organization: 'Meta' };
    case 'gemma':
      return { family, country: 'United States', organization: 'Google' };
    case 'phi':
      return { family, country: 'United States', organization: 'Microsoft' };
    case 'generic':
    default:
      if (lower.includes('granite')) return { family, country: 'United States', organization: 'IBM' };
      if (lower.includes('starcoder')) return { family, country: 'International', organization: 'BigCode' };
      if (lower.includes('command-r') || lower.includes('aya')) return { family, country: 'Canada', organization: 'Cohere' };
      if (lower.includes('yi')) return { family, country: 'China', organization: '01.AI' };
      if (lower.includes('smollm') || lower.includes('zephyr')) return { family, country: 'United States', organization: 'Hugging Face' };
      if (lower.includes('falcon')) return { family, country: 'United Arab Emirates', organization: 'TII' };
      if (lower.includes('solar')) return { family, country: 'South Korea', organization: 'Upstage' };
      if (lower.includes('neural-chat')) return { family, country: 'United States', organization: 'Intel' };
      if (lower.includes('wizardlm')) return { family, country: 'United States', organization: 'Microsoft' };
      if (lower.includes('openhermes') || lower.includes('nous')) return { family, country: 'United States', organization: 'Nous Research' };
      if (lower.includes('dolphin')) return { family, country: 'United States', organization: 'Cognitive Computations' };
      if (lower.includes('llava') || lower.includes('bakllava')) return { family, country: 'United States', organization: 'LLaVA' };
      if (lower.includes('moondream')) return { family, country: 'United States', organization: 'Moondream' };
      if (lower.includes('minicpm')) return { family, country: 'China', organization: 'OpenBMB' };
      if (lower.includes('tinyllama')) return { family, country: 'Singapore', organization: 'TinyLlama' };
      if (lower.includes('orca-mini')) return { family, country: 'Unknown', organization: 'Community' };
      if (lower.includes('vicuna')) return { family, country: 'United States', organization: 'LMSYS' };
      return { family, country: 'Unknown', organization: 'Unknown model family' };
  }
}

export function getModelDeveloperKey(model: string) {
  return normalizeDeveloperId(getModelOrigin(model).organization);
}

/**
 * Who made this row, for the developer filter.
 *
 * Prefers row.publisher: generation models match no Ollama family, so keying
 * on the name grouped all six under "Unknown model family" while their rows
 * displayed Lightricks and Stability AI. The grouping and the column must
 * read the same source or the filter contradicts the table it filters.
 */
export function getRowDeveloper(row: Pick<ModelRow, 'displayName' | 'publisher'>) {
  const label = row.publisher ?? getModelOrigin(row.displayName).organization;
  return { id: normalizeDeveloperId(label), label };
}

export function getDeveloperFilterOptions(rows: ModelRow[]) {
  const counts = new Map<string, { id: string; label: string; count: number }>();

  rows.forEach((row) => {
    const { id, label } = getRowDeveloper(row);
    const current = counts.get(id);
    counts.set(id, {
      id,
      label,
      count: (current?.count ?? 0) + 1,
    });
  });

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 10);
}

function normalizeDeveloperId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}
