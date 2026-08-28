// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { getModelQuickFilters, getHardwareFit } = await import('../src/lib/modelCatalog.ts');

/**
 * A filter should be named for what it selects.
 *
 * "Rig Picks" was not. It gathered every model badged "Sweet spot", "Good fit"
 * or "Small pick" and named none of them, while the filter directly beneath it
 * — "Too Big" — named its badge exactly. The cost was measurable: asked for a
 * "Good Fit" filter, RigMatch's own author did not recognise this button with a
 * screenshot of it open. If the person who wrote it cannot name it, nobody can.
 */

// params is read by the fit calculation, so a row without it throws rather
// than falling back — the fixture has to be a real ModelRow, not a sketch.
const row = (name, sizeGb, params) => ({
  displayName: name,
  name,
  params: params ?? name.split(':')[1] ?? '4b',
  sizeGb,
  installed: false,
  runtime: 'ollama',
});

test('the fit filter is named with the word its own badges use', () => {
  const filters = getModelQuickFilters([row('a:4b', 4)], {}, 12);
  const fit = filters.find((f) => f.id === 'fits-vram');
  assert.ok(fit, 'the fit filter is gone');

  // The filter gathers three tiers — a 4 GB model on 12 GB is "Sweet spot",
  // which is a better fit than "Good fit", not a different kind of thing. So
  // the label has to come from that vocabulary, not appear in every badge.
  const recommended = [1, 4, 9]
    .map((gb) => getHardwareFit(row(`a:${gb}b`, gb), 12))
    .filter((verdict) => verdict.recommend)
    .map((verdict) => verdict.label.toLowerCase());

  assert.ok(recommended.length >= 2, 'the fixture no longer covers more than one fit tier');
  assert.ok(
    recommended.some((badge) => badge.includes(fit.label.toLowerCase())),
    `the filter says "${fit.label}" but the models it gathers are badged `
    + `${recommended.join(', ')} — name the filter for what it selects`,
  );
});

test('it still selects every model the hardware check recommends', () => {
  // Renaming must not narrow it. "Good fit" is the label; the set is unchanged
  // — sweet-spot and small-pick models are good fits too, and dropping them
  // would turn a naming fix into a behaviour change nobody asked for.
  const rows = [
    row('tiny:1b', 1),
    row('mid:7b', 4),
    row('huge:70b', 40),
  ];
  const fit = getModelQuickFilters(rows, {}, 12).find((f) => f.id === 'fits-vram');
  const recommended = rows.filter((r) => getHardwareFit(r, 12).recommend).length;

  assert.equal(fit.count, recommended);
  assert.equal(fit.count, 2, 'the 40 GB model does not fit 12 GB; the other two do');
});

test('no filter is named after an internal concept', () => {
  // The general form of the bug. "Rig", "pick" and "VRAM-safe" are the app's
  // vocabulary for its own machinery; a filter label is read by someone who has
  // never seen that vocabulary and is looking for a word they already own.
  const filters = getModelQuickFilters([row('a:4b', 4)], {}, 12);
  for (const { id, label } of filters) {
    assert.ok(
      !/\brig\b|\bvram-safe\b|\bpicks\b/i.test(label),
      `filter "${id}" is labelled "${label}", which names RigMatch's idea rather than the user's`,
    );
  }
});
