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
    /**
     * How good a face this member is, among those isPreferred allows. Highest
     * wins; equal ranks keep the reader's sort order.
     *
     * Without this the face was simply the first eligible member, on the
     * reasoning that the reader's sort had already put the best one there.
     * That holds only while the sort discriminates. The default sort is by
     * status, and every installed model ties at the same rank, so the tie-break
     * decided — and the tie-break is displayName.localeCompare, which for
     * size-suffixed tags means the smallest: "0.5b" sorts before "7b", "e2b"
     * before "e4b". Measured on a real machine, two of three multi-variant
     * families put their weakest member forward, so Qwen2.5 — scoring 92 on
     * its 7B — introduced itself to the list as a 0.4 GB model.
     */
    faceRank?: (row: T) => number;
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
    return { kind: 'group', group: { family, rows: members, best: pickFace(members, options) } };
  });
}

/**
 * The member that stands for the family on the collapsed row.
 *
 * Two questions, deliberately separate. isPreferred asks whether a variant is a
 * *fair* face — installed, and able to run here. faceRank asks which of the
 * fair ones is the *best* face. Eligibility was answering both, and could not:
 * every installed variant is equally eligible, so the choice fell through to
 * whatever order the caller happened to pass.
 */
function pickFace<T>(
  members: T[],
  options: { isPreferred?: (row: T) => boolean; faceRank?: (row: T) => number },
): T {
  const eligible = options.isPreferred ? members.filter(options.isPreferred) : members;
  // Nothing here is installed or runnable — an entirely uninstalled family
  // still needs a face, and the reader's own sort put its best guess first.
  const pool = eligible.length > 0 ? eligible : members;
  const rank = options.faceRank;
  if (!rank) return pool[0];
  // Strictly greater, so an equal rank keeps the earlier member and the
  // reader's sort still decides where nothing else can.
  return pool.reduce((champion, row) => (rank(row) > rank(champion) ? row : champion), pool[0]);
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
