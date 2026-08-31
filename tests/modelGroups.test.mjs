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
