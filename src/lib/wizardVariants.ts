// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Collapse size/quant variants of the same model into one wizard card.
 *
 * The Simple Mode Pick grid rendered every variant as its own near-identical
 * card — the first outside review's top confusion: "many versions of Gemma 4...
 * I don't know how these parameters/differences work". A beginner can't choose
 * between `:e2b` and `:2b` on information they don't have, so the wizard now
 * makes that call and says so on the card. Advanced Mode keeps every variant.
 *
 * Kept dependency-free so Node can import it directly for tests, like
 * runHistory.ts.
 */

type VariantLike = {
  /** Friendly display name — the grouping key ("Gemma4", "Qwen2.5-coder"). */
  name: string;
  row: { displayName: string; installed?: boolean };
};

/**
 * One entry per `name`, annotated with how many siblings it stands in for.
 *
 * `models` must arrive best-first (the wizard sorts by fit tone, then largest
 * size that fits): the first variant seen under a name is the right default.
 * Two overrides, in order:
 *  - a variant the user already shortlisted must represent the card, or it
 *    would render unpicked while sitting in the lineup tray;
 *  - an installed variant beats one that needs a download.
 *
 * Insertion order is preserved, so each name holds the position of its best
 * variant — families can no longer interleave ("Mistral-nemo break the
 * in-order", same review).
 */
export function collapseModelVariants<T extends VariantLike>(
  models: T[],
  shortlistedIds: Set<string>,
): Array<T & { variantCount?: number }> {
  const pickPriority = (m: T) =>
    shortlistedIds.has(m.row.displayName) ? 0 : m.row.installed ? 1 : 2;

  const grouped = new Map<string, { best: T; count: number }>();
  for (const model of models) {
    const entry = grouped.get(model.name);
    if (!entry) {
      grouped.set(model.name, { best: model, count: 1 });
      continue;
    }
    entry.count += 1;
    if (pickPriority(model) < pickPriority(entry.best)) entry.best = model;
  }

  return [...grouped.values()].map(({ best, count }) =>
    count > 1 ? { ...best, variantCount: count } : best);
}
