// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { ModelQuickFilterId, ModelTaskFilterId } from './modelCatalog.ts';
import type { ModelRow } from '../types';

/**
 * The filter rail: what you can narrow by, visible without opening anything.
 *
 * The tray this replaces answered "what can I narrow by" only after you clicked
 * a button labelled "Filters — 2 active", which named neither of the two. The
 * rail's whole job is that the answer is already on screen: the groups, the
 * options, and the count each one would leave you with.
 *
 * Grouping is fixed rather than derived because the eight quick filters answer
 * three genuinely different questions — will it run here, do I already have it,
 * and how did it do — and a flat list of eight makes the reader sort that out
 * for themselves every time.
 */
export type FacetGroupId = 'fit' | 'local' | 'score';

const QUICK_FILTER_GROUPS: Array<{ id: FacetGroupId; label: string; members: ModelQuickFilterId[] }> = [
  // Label is filled in with the real VRAM figure below — "Fits your 12 GB" says
  // more than "Fits" for the same width.
  { id: 'fit', label: 'Fits your rig', members: ['fits-vram', 'huge'] },
  { id: 'local', label: 'On your PC', members: ['installed', 'unscored', 'scored'] },
  { id: 'score', label: 'How it scored', members: ['good-score', 'low-score'] },
];

export type FacetItem = { id: string; label: string; count: number };
export type FacetGroup = { id: string; label: string; items: FacetItem[] };

/**
 * 'all' is not a facet. It is the absence of one, which the rail expresses by
 * having nothing ticked — so offering it as a ninth button would be a control
 * that does the same thing as unticking the button above it.
 */
export function buildQuickFacetGroups(
  quickFilters: Array<{ id: ModelQuickFilterId; label: string; count: number }>,
  vramLabel: string,
): FacetGroup[] {
  const byId = new Map(quickFilters.map((filter) => [filter.id, filter]));
  return QUICK_FILTER_GROUPS.map((group) => ({
    id: group.id,
    label: group.id === 'fit' && vramLabel ? `Fits your ${vramLabel}` : group.label,
    items: group.members
      .map((id) => byId.get(id))
      .filter((filter): filter is { id: ModelQuickFilterId; label: string; count: number } => Boolean(filter))
      .map((filter) => ({ id: filter.id, label: filter.label, count: filter.count })),
  })).filter((group) => group.items.length > 0);
}

/**
 * Filters that answer a question of their own, not "what is this good for".
 *
 * Uncensored sat in the Good-for list beside Coding, Chat and Writing, which
 * made it read as a use case — a thing you might want a model *for*. It is not
 * one. It says something about what has been removed from the model, and it
 * belongs on its own where that reads clearly rather than as the fourth item in
 * a list of jobs.
 *
 * The filter id and its matching are untouched: only where it is drawn moves.
 */
export const STANDALONE_TASK_FILTERS: ModelTaskFilterId[] = ['uncensored'];

export function splitTaskFilters<T extends { id: ModelTaskFilterId }>(chips: T[]): {
  goodFor: T[];
  standalone: T[];
} {
  const standalone = new Set<string>(STANDALONE_TASK_FILTERS);
  return {
    goodFor: chips.filter((chip) => !standalone.has(chip.id)),
    // Ordered by STANDALONE_TASK_FILTERS rather than by the source list, so the
    // group's order is decided here rather than inherited from a list whose
    // order is about something else.
    standalone: STANDALONE_TASK_FILTERS
      .map((id) => chips.find((chip) => chip.id === id))
      .filter((chip): chip is T => Boolean(chip)),
  };
}

export type SearchSuggestion =
  | { kind: 'quick'; id: ModelQuickFilterId; label: string; groupLabel: string; count: number }
  | { kind: 'task'; id: ModelTaskFilterId; label: string; groupLabel: string; count: number }
  | { kind: 'developer'; id: string; label: string; groupLabel: string; count: number }
  | { kind: 'model'; id: string; label: string; count: number };

const MAX_FILTER_SUGGESTIONS = 3;
const MAX_MODEL_SUGGESTIONS = 4;

/**
 * Rank a label against a query: a word-start match beats a match buried mid-word.
 *
 * "cod" should offer Coding before it offers anything that merely contains the
 * letters, and among models qwen2.5-coder should sit above starcoder2 for the
 * same reason.
 */
function matchRank(label: string, query: string): number {
  const haystack = label.toLowerCase();
  const at = haystack.indexOf(query);
  if (at < 0) return -1;
  if (at === 0) return 0;
  return /[\s\-_:./]/.test(haystack[at - 1]) ? 1 : 2;
}

/**
 * Search suggests filters before models.
 *
 * Typing "cod" almost always means "show me coding models", not "show me the
 * one model whose name happens to contain those letters" — but the plain search
 * box could only ever do the second, so the filter that answers the actual
 * question stayed invisible unless you went looking for it in the rail. Putting
 * it at the top of the suggestion list is how the search box and the rail
 * become one mechanism instead of two that ignore each other.
 *
 * Zero-count filters are dropped: a suggestion that leads to an empty table is
 * worse than no suggestion.
 */
export function buildSearchSuggestions(input: {
  query: string;
  rows: ModelRow[];
  quickFilters: Array<{ id: ModelQuickFilterId; label: string; count: number }>;
  taskFilters: Array<{ id: ModelTaskFilterId; label: string }>;
  taskCounts: Record<string, number>;
  developerOptions: Array<{ id: string; label: string; count: number }>;
}): SearchSuggestion[] {
  const query = input.query.trim().toLowerCase();
  // One letter matches most of the catalogue; the list would be noise.
  if (query.length < 2) return [];

  const ranked: Array<{ suggestion: SearchSuggestion; rank: number }> = [];

  for (const filter of input.quickFilters) {
    if (filter.id === 'all' || filter.count <= 0) continue;
    const rank = matchRank(filter.label, query);
    if (rank >= 0) ranked.push({ suggestion: { kind: 'quick', id: filter.id, label: filter.label, groupLabel: 'Filter', count: filter.count }, rank });
  }
  for (const chip of input.taskFilters) {
    const count = input.taskCounts[chip.id] ?? 0;
    if (count <= 0) continue;
    const rank = matchRank(chip.label, query);
    if (rank >= 0) ranked.push({ suggestion: { kind: 'task', id: chip.id, label: chip.label, groupLabel: 'Good for', count }, rank });
  }
  for (const option of input.developerOptions) {
    if (option.count <= 0) continue;
    const rank = matchRank(option.label, query);
    if (rank >= 0) ranked.push({ suggestion: { kind: 'developer', id: option.id, label: option.label, groupLabel: 'Made by', count: option.count }, rank });
  }

  const filters = ranked
    .sort((a, b) => a.rank - b.rank || b.suggestion.count - a.suggestion.count)
    .slice(0, MAX_FILTER_SUGGESTIONS)
    .map((entry) => entry.suggestion);

  const models = input.rows
    .map((row) => ({ row, rank: matchRank(row.displayName, query) }))
    .filter((entry) => entry.rank >= 0)
    // Something already on disk is the likelier target than a download.
    .sort((a, b) => a.rank - b.rank
      || Number(Boolean(b.row.installed)) - Number(Boolean(a.row.installed))
      || a.row.displayName.localeCompare(b.row.displayName))
    .slice(0, MAX_MODEL_SUGGESTIONS)
    .map((entry): SearchSuggestion => ({
      kind: 'model',
      id: entry.row.displayName,
      label: entry.row.displayName,
      count: entry.row.sizeGb ?? 0,
    }));

  return [...filters, ...models];
}
