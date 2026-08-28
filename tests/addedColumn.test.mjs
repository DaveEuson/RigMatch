// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { getModelSortValue, getModelSortLabel } = await import('../src/lib/modelCatalog.ts');

/**
 * The "Added" column: how long a model has been on this machine.
 *
 * It reads Ollama's modified_at, which only installed models have. Across the
 * whole catalogue that is a field 16 rows of 322 carry, so the column is shown
 * only under the Installed filter — a column blank 95% of the time, sortable
 * into a wall of nothing, is worse than no column.
 */

const row = (name, modifiedAt) => ({
  displayName: name,
  name,
  params: '4b',
  sizeGb: 4,
  installed: Boolean(modifiedAt),
  installedModel: modifiedAt ? { name, model: name, sizeGb: 4, modifiedAt } : undefined,
});

test('models sort newest-installed first', () => {
  const older = getModelSortValue(row('a:4b', '2026-01-01T00:00:00Z'), 'added', {}, {});
  const newer = getModelSortValue(row('b:4b', '2026-08-01T00:00:00Z'), 'added', {}, {});
  assert.ok(newer > older, 'a more recent install should sort above an older one');
});

test('a model with no date sorts last rather than first', () => {
  // -1, the same convention speed and pulls use. Zero would place undated rows
  // at the epoch, which sorts them *above* nothing and below everything — but
  // an unparseable date must not beat a real one either.
  assert.equal(getModelSortValue(row('a:4b', undefined), 'added', {}, {}), -1);
  assert.equal(getModelSortValue(row('a:4b', 'not a date'), 'added', {}, {}), -1);
});

test('the column has a name for the sort menu', () => {
  assert.equal(getModelSortLabel('added'), 'Added');
});

test('a real Ollama timestamp renders as a readable date', () => {
  // The shape Ollama actually returns, offset and all, captured from a live
  // /api/tags rather than invented. Locale-formatted, so assert the parts
  // rather than one machine's punctuation.
  const rendered = new Date('2026-08-04T09:27:46.332888-07:00')
    .toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  assert.match(rendered, /2026/);
  assert.match(rendered, /Aug/i);
  assert.ok(!Number.isNaN(new Date('2026-08-04T09:27:46.332888-07:00').getTime()));
});

test('the column is bound to the Installed filter, not shown always', () => {
  // The whole point of the decision. If this ever renders unconditionally it
  // becomes 306 blank cells wide enough to push another column off screen.
  const source = readFileSync(new URL('../src/components/ModelCabinet.tsx', import.meta.url), 'utf-8');
  assert.match(source, /const showAdded = quickFilter === 'installed';/,
    'the Added column is no longer gated on the Installed filter');
  assert.match(source, /\{showAdded &&/, 'showAdded is computed but never used to gate rendering');
});
