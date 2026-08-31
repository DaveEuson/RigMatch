// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * One row per family, opened on demand.
 *
 * A 4070 reports 147 models that fit it, and thirty-five of those are Gemma 4.
 * Five of them in a row read: `gemma4:12b`, `gemma4:12b-mlx`, `gemma4:e2b`,
 * `gemma4:e2b-mlx`, `gemma4:e4b` — same Good-for tags, same maker, and the
 * same "23.9M pulls", because Ollama counts pulls per family rather than per
 * tag. So the table spends five rows and one number saying one thing.
 *
 * Simple Mode already collapses variants (see wizardVariants.ts) by picking one
 * and hiding the rest. A table cannot do that: the whole point of the Advanced
 * list is that every variant is reachable. So this collapses and lets you open
 * it again.
 *
 * Ordering is inherited, never recomputed. Rows arrive sorted by whatever
 * column the reader chose, and a family takes the position of its best-sorted
 * member — so sorting by Size still puts the smallest family first, and a
 * family cannot jump the queue by having many variants.
 *
 * Kept dependency-free so Node can import it directly for tests, like
 * runHistory.ts and wizardVariants.ts.
 */

export type ModelGroup<T> = {
  /** The friendly family name, e.g. "Gemma4" — the grouping key. */
  family: string;
  /** Every variant that survived filtering, in the table's own order. */
  rows: T[];
  /** The one shown on the collapsed row. */
  best: T;
};

export type GroupedRow<T> =
  | { kind: 'row'; row: T }
  | { kind: 'group'; group: ModelGroup<T> };

/**
 * Every family is a group, including the ones with a single version.
 *
 * This was 2, on the reasoning that a triangle hiding one row is a control
 * that does nothing. That reasoning was about the control and not about the
 * list: mixing collapsible family rows with bare model rows makes the reader
 * work out which kind each row is before they know what clicking does. One
 * shape for every row is worth the extra click on a family of one.
 */
export const MIN_VARIANTS_TO_GROUP = 1;

export function groupRowsByFamily<T>(
  rows: T[],
  options: {
    /** Usually getFriendlyModelName. */
    familyOf: (row: T) => string;
    /**
     * True when a variant is a fair thing to show as the family's face —
     * installed, and able to run on this machine. An `-mlx` build cannot run
     * on Windows, and a collapsed row that advertises one is a family that
     * looks unavailable when it is not.
     */
    isPreferred?: (row: T) => boolean;
    minToGroup?: number;
  },
): Array<GroupedRow<T>> {
  const minToGroup = options.minToGroup ?? MIN_VARIANTS_TO_GROUP;
  const order: string[] = [];
  const byFamily = new Map<string, T[]>();

  for (const row of rows) {
    const family = options.familyOf(row);
    const existing = byFamily.get(family);
    if (existing) {
      existing.push(row);
    } else {
      byFamily.set(family, [row]);
      order.push(family);
    }
  }

  return order.map((family): GroupedRow<T> => {
    const members = byFamily.get(family)!;
    if (members.length < minToGroup) return { kind: 'row', row: members[0] };
    // First preferred member, else the first — which is already the best one
    // under the reader's chosen sort.
    const best = (options.isPreferred && members.find(options.isPreferred)) || members[0];
    return { kind: 'group', group: { family, rows: members, best } };
  });
}

/** How many table rows a grouping will actually draw, with these families open. */
export function countVisibleRows<T>(grouped: Array<GroupedRow<T>>, expanded: Set<string>): number {
  return grouped.reduce((total, entry) => {
    if (entry.kind === 'row') return total + 1;
    // The group's own row, plus its variants when it is open.
    return total + 1 + (expanded.has(entry.group.family) ? entry.group.rows.length : 0);
  }, 0);
}

/**
 * Families to open on the reader's behalf.
 *
 * Searching is the one time collapsing works against you: typing "e2b" and
 * getting a closed "Gemma4" row hides the very thing that matched. So a family
 * opens when the search is what put it on screen — and only then, or the
 * collapse would never be in effect at all.
 */
export function familiesToAutoExpand<T>(
  grouped: Array<GroupedRow<T>>,
  query: string,
  matches: (row: T, query: string) => boolean,
): Set<string> {
  const trimmed = query.trim();
  if (!trimmed) return new Set();
  const open = new Set<string>();
  for (const entry of grouped) {
    if (entry.kind !== 'group') continue;
    // The family name itself matching is not a reason to open it: searching
    // "gemma" should collapse thirty-five rows, not expand them.
    if (entry.group.rows.some((row) => matches(row, trimmed))) open.add(entry.group.family);
  }
  return open;
}
