// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { sortModelRows } = await import('../src/lib/modelCatalog.ts');

/**
 * The comparator behind the Models table, which had no tests at all.
 *
 * Every real comparison in it is multiplied by the direction factor and the
 * tie-break was not, so ties always resolved a-to-z whichever way the header
 * arrow pointed. That is not a corner case: the default sort is by status, and
 * getModelStatusRank returns 3 for every installed model, so on a machine where
 * most rows are installed the tie-break *is* the ordering. Toggling Status
 * reversed the groups and left every row inside them where it was.
 */

// `pack` is a required field on ModelRow, and the 'skill' sort reads it — the
// types guarantee it in the app, so these plain-JS rows have to supply it too.
const row = (displayName, over = {}) => ({
  displayName, installed: false, live: true, source: 'ollama',
  params: '', sizeGb: null, pulls: null, pack: '', ...over,
});
const sort = (rows, key, dir) => sortModelRows(rows, key, dir, new Set(), {}, {}).map((r) => r.displayName);

const installed = ['qwen2.5:0.5b', 'qwen2.5:7b', 'mistral:7b'].map((n) => row(n, { installed: true }));

test('toggling the direction reverses a column of ties', () => {
  const down = sort(installed, 'status', 'desc');
  const up = sort(installed, 'status', 'asc');
  assert.deepEqual(up, [...down].reverse());
});

test('all-installed rows are ordered by name, and that order turns', () => {
  assert.deepEqual(sort(installed, 'status', 'asc'), ['mistral:7b', 'qwen2.5:0.5b', 'qwen2.5:7b']);
  assert.deepEqual(sort(installed, 'status', 'desc'), ['qwen2.5:7b', 'qwen2.5:0.5b', 'mistral:7b']);
});

test('the primary key still outranks the tie-break', () => {
  // Installed must lead when descending, whatever the names say.
  const mixed = [row('aaa:7b'), row('zzz:7b', { installed: true })];
  assert.deepEqual(sort(mixed, 'status', 'desc'), ['zzz:7b', 'aaa:7b']);
  assert.deepEqual(sort(mixed, 'status', 'asc'), ['aaa:7b', 'zzz:7b']);
});

test('equal sizes break by name, in the direction asked', () => {
  const same = [row('b:7b', { sizeGb: 4.7 }), row('a:7b', { sizeGb: 4.7 })];
  assert.deepEqual(sort(same, 'size', 'asc'), ['a:7b', 'b:7b']);
  assert.deepEqual(sort(same, 'size', 'desc'), ['b:7b', 'a:7b']);
});

test('unknown size sorts last in both directions', () => {
  // Absent data, not a small number: floating it to the top of the ascending
  // list would read as "these are the smallest".
  const rows = [row('unknown:x'), row('small:1b', { sizeGb: 1 }), row('big:70b', { sizeGb: 40 })];
  assert.equal(sort(rows, 'size', 'asc').at(-1), 'unknown:x');
  assert.equal(sort(rows, 'size', 'desc').at(-1), 'unknown:x');
});

test('two rows with no size at all are still ordered, and turn', () => {
  const rows = [row('b:x'), row('a:x')];
  assert.deepEqual(sort(rows, 'size', 'asc'), ['a:x', 'b:x']);
  assert.deepEqual(sort(rows, 'size', 'desc'), ['b:x', 'a:x']);
});

test('rows sharing a maker are ordered by name rather than by arrival', () => {
  // The string branch had no tie-break at all, so equal makers kept input
  // order and the table reshuffled as rows arrived.
  const byArrival = [row('z:7b', { publisher: 'Acme' }), row('a:7b', { publisher: 'Acme' })];
  assert.deepEqual(sort(byArrival, 'maker', 'asc'), ['a:7b', 'z:7b']);
  assert.deepEqual(sort(byArrival, 'maker', 'desc'), ['z:7b', 'a:7b']);
});

test('sorting never loses or invents a row', () => {
  const rows = [row('a:1b', { sizeGb: 1 }), row('b:x'), row('c:7b', { installed: true })];
  for (const key of ['name', 'size', 'status', 'score', 'speed', 'pulls', 'maker', 'origin', 'added', 'params', 'skill', 'source']) {
    for (const dir of ['asc', 'desc']) {
      assert.equal(sort(rows, key, dir).length, rows.length, `${key} ${dir} changed the row count`);
      assert.deepEqual([...sort(rows, key, dir)].sort(), ['a:1b', 'b:x', 'c:7b'], `${key} ${dir} changed the rows`);
    }
  }
});

test('the input array is not mutated', () => {
  const rows = [row('b:7b', { installed: true }), row('a:7b')];
  const before = rows.map((r) => r.displayName);
  sort(rows, 'status', 'desc');
  assert.deepEqual(rows.map((r) => r.displayName), before);
});
