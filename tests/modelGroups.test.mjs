// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { groupRowsByFamily, countVisibleRows, familiesToAutoExpand, MIN_VARIANTS_TO_GROUP } =
  await import('../src/lib/modelGroups.ts');
const { getFriendlyModelName } = await import('../src/lib/modelCatalog.ts');

/**
 * A 4070 reports 147 models that fit, thirty-five of them Gemma 4, and five
 * consecutive rows that differ only in a tag — same maker, same tags, and the
 * same pull count on every one, because Ollama counts pulls per family.
 */

const row = (displayName, over = {}) => ({ displayName, installed: false, macOnly: false, ...over });
const familyOf = (r) => getFriendlyModelName(r.displayName);
const group = (rows, opts = {}) => groupRowsByFamily(rows, { familyOf, ...opts });

const gemmas = [
  row('gemma4:12b'),
  row('gemma4:12b-mlx', { macOnly: true }),
  row('gemma4:e2b', { installed: true }),
  row('gemma4:e2b-mlx', { macOnly: true }),
  row('gemma4:e4b', { installed: true }),
];

test('a family of variants becomes one group', () => {
  const out = group(gemmas);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'group');
  assert.equal(out[0].group.family, 'Gemma4');
  assert.equal(out[0].group.rows.length, 5);
});

test('a family of one is still a family, so every row behaves the same way', () => {
  // Mixing collapsible family rows with bare model rows makes the reader work
  // out which kind of row they are looking at before they know what a click
  // will do. One shape for every row.
  assert.equal(MIN_VARIANTS_TO_GROUP, 1);
  const out = group([row('mistral:7b')]);
  assert.deepEqual(out.map((e) => e.kind), ['group']);
  assert.equal(out[0].group.rows.length, 1);
});

test('the option still means something for a caller that wants plain rows', () => {
  const out = group([row('mistral:7b')], { minToGroup: 2 });
  assert.deepEqual(out.map((e) => e.kind), ['row']);
});

test('families keep the position of their best-sorted member', () => {
  // Rows arrive in the table's chosen sort order. A family must not jump the
  // queue by having more variants than its neighbours.
  const out = group([row('alpha:1b'), ...gemmas, row('zeta:9b')]);
  assert.deepEqual(out.map((e) => (e.kind === 'row' ? familyOf(e.row) : e.group.family)),
    ['Alpha', 'Gemma4', 'Zeta']);
});

test('variants keep the table’s order inside the group', () => {
  const out = group(gemmas);
  assert.deepEqual(out[0].group.rows.map((r) => r.displayName),
    ['gemma4:12b', 'gemma4:12b-mlx', 'gemma4:e2b', 'gemma4:e2b-mlx', 'gemma4:e4b']);
});

test('the collapsed row shows a variant that can actually run here', () => {
  // Without this the family's face could be an -mlx build on a Windows box,
  // making an available family look unavailable.
  const out = group(gemmas, { isPreferred: (r) => r.installed && !r.macOnly });
  assert.equal(out[0].group.best.displayName, 'gemma4:e2b');
});

test('with nothing preferred it falls back to the best-sorted variant', () => {
  const out = group(gemmas, { isPreferred: () => false });
  assert.equal(out[0].group.best.displayName, 'gemma4:12b');
});

test('a coder build is its own family, not another size of the chat one', () => {
  // getFriendlyModelName's comment claimed these collapsed together. They do
  // not, and merging them would hide a real choice behind a triangle: someone
  // wanting qwen2.5-coder does not want qwen2.5, at any size.
  const out = group([row('qwen2.5:7b'), row('lmstudio-community/qwen2.5-coder-7b-instruct')]);
  assert.equal(out.length, 2);
  assert.deepEqual([familyOf(row('qwen2.5:7b')), familyOf(row('lmstudio-community/qwen2.5-coder-7b-instruct'))],
    ['Qwen2.5', 'Qwen2.5-coder']);
});

// --- what the reader actually sees -----------------------------------------

test('collapsing five variants into one row is the whole point', () => {
  const out = group(gemmas);
  assert.equal(countVisibleRows(out, new Set()), 1);
});

test('opening one family shows its variants under it', () => {
  const out = group(gemmas);
  assert.equal(countVisibleRows(out, new Set(['Gemma4'])), 6);
});

test('a 147-row list of five families draws five rows closed', () => {
  const many = ['gemma4', 'qwen2.5', 'llama3.2', 'mistral', 'phi3']
    .flatMap((family) => Array.from({ length: 29 }, (_, i) => row(`${family}:${i + 1}b`)));
  const out = group(many);
  assert.equal(many.length, 145);
  assert.equal(countVisibleRows(out, new Set()), 5);
});

// --- searching --------------------------------------------------------------

const matches = (r, q) => r.displayName.toLowerCase().includes(q.toLowerCase());

test('searching opens the family that matched, or the match is hidden', () => {
  const out = group(gemmas);
  assert.deepEqual([...familiesToAutoExpand(out, 'e2b', matches)], ['Gemma4']);
});

test('an empty search opens nothing', () => {
  const out = group(gemmas);
  assert.equal(familiesToAutoExpand(out, '   ', matches).size, 0);
});

test('searching the family name itself does not open it', () => {
  // "gemma" should collapse thirty-five rows into one, which is the feature
  // working — not expand them, which is the feature undone.
  const out = group([row('gemma4:12b'), row('gemma4:e2b'), row('mistral:7b')]);
  const open = familiesToAutoExpand(out, 'gemma', (r, q) => r.displayName.split(':')[1]?.includes(q) ?? false);
  assert.equal(open.size, 0);
});

// --- which variant fronts the family ----------------------------------------

/**
 * Measured on a real machine before this existed: of three families with more
 * than one installed variant, two put their weakest member forward. Qwen2.5,
 * scoring 92 on its 7B, introduced itself to the list as a 0.4 GB model.
 *
 * The cause was not the grouping but what it deferred to. isPreferred asks
 * whether a variant is a *fair* face — installed and runnable — and every
 * installed variant answers yes, so the choice fell through to the order the
 * caller passed. That order is the table's sort, whose default key is status;
 * getModelStatusRank returns 3 for every installed model, so they all tie and
 * the tie-break decides. The tie-break is displayName.localeCompare, and for
 * size-suffixed tags alphabetical means smallest: "0.5b" < "7b", "e2b" < "e4b".
 */

const installedRow = (displayName, brains) => row(displayName, { installed: true, brains });
const byBrains = { isPreferred: (r) => r.installed, faceRank: (r) => r.brains ?? 0 };

test('the family shows its most capable installed version', () => {
  // The real case, in the order the default sort actually produces.
  const out = group([installedRow('qwen2.5:0.5b', 0.494), installedRow('qwen2.5:7b', 7.6)], byBrains);
  assert.equal(out[0].group.best.displayName, 'qwen2.5:7b');
});

test('the alphabetically-first variant no longer wins by default', () => {
  // Without faceRank this is the old behaviour, kept deliberately so callers
  // that pass no ranking are unchanged.
  const rows = [installedRow('qwen2.5:0.5b', 0.494), installedRow('qwen2.5:7b', 7.6)];
  assert.equal(group(rows, { isPreferred: (r) => r.installed }).best?.displayName, undefined);
  assert.equal(group(rows, { isPreferred: (r) => r.installed })[0].group.best.displayName, 'qwen2.5:0.5b');
  assert.equal(group(rows, byBrains)[0].group.best.displayName, 'qwen2.5:7b');
});

test('effective-parameter tags rank by what they actually are', () => {
  // gemma4:e2b is 5.1B and e4b is 8.0B, so "e4b" is the stronger face even
  // though "e2b" sorts first.
  const out = group([installedRow('gemma4:e2b', 5.1), installedRow('gemma4:e4b', 8.0)], byBrains);
  assert.equal(out[0].group.best.displayName, 'gemma4:e4b');
});

test('a variant that cannot run here never fronts its family, however big', () => {
  // The -mlx rule this option was introduced for still wins: eligibility is
  // asked first, and ranking only chooses among those that pass.
  const out = group([
    row('gemma4:27b-mlx', { installed: true, brains: 27, macOnly: true }),
    installedRow('gemma4:4b', 4),
  ], { isPreferred: (r) => r.installed && !r.macOnly, faceRank: (r) => r.brains ?? 0 });
  assert.equal(out[0].group.best.displayName, 'gemma4:4b');
});

test('equal capability keeps the reader\'s sort order', () => {
  const out = group([installedRow('a:7b', 7), installedRow('a:7b-q8', 7)], byBrains);
  assert.equal(out[0].group.best.displayName, 'a:7b');
});

test('a score separates variants of the same size, and only then', () => {
  // capability * 1000 + score, the shape the Models list passes.
  const rank = (r) => (r.brains ?? 0) * 1000 + (r.score ?? 0);
  const sameSize = group([
    row('a:7b', { installed: true, brains: 7, score: 60 }),
    row('a:7b-tuned', { installed: true, brains: 7, score: 88 }),
  ], { isPreferred: (r) => r.installed, faceRank: rank });
  assert.equal(sameSize[0].group.best.displayName, 'a:7b-tuned');

  // And a tested small model still does not outrank an untested large one —
  // that would be the same defect wearing a different key.
  const mixed = group([
    row('b:0.5b', { installed: true, brains: 0.5, score: 92 }),
    row('b:7b', { installed: true, brains: 7 }),
  ], { isPreferred: (r) => r.installed, faceRank: rank });
  assert.equal(mixed[0].group.best.displayName, 'b:7b');
});

test('an entirely uninstalled family still gets a face', () => {
  const out = group([row('mistral:7b'), row('mistral:latest')], byBrains);
  assert.equal(out[0].group.best.displayName, 'mistral:7b');
});
