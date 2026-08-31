// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildQuickFacetGroups, buildSearchSuggestions } = await import('../src/lib/modelFacets.ts');
const { TASK_FILTER_CHIPS } = await import('../src/lib/modelCatalog.ts');

/**
 * The rail replaced a tray labelled "Filters — 2 active" that named neither of
 * the two. Everything below is about the one property that made the swap worth
 * doing: what you can narrow by, and what it costs you, is readable without
 * spending a click to find out.
 */

const quick = (overrides = {}) => ({
  all: 322,
  installed: 16,
  'fits-vram': 149,
  scored: 0,
  unscored: 16,
  'good-score': 0,
  'low-score': 0,
  huge: 112,
  ...overrides,
});

const quickFilters = (counts = quick()) => [
  { id: 'all', label: 'All', count: counts.all },
  { id: 'installed', label: 'Installed', count: counts.installed },
  { id: 'fits-vram', label: 'Good fit', count: counts['fits-vram'] },
  { id: 'scored', label: 'Scored', count: counts.scored },
  { id: 'unscored', label: 'Unscored', count: counts.unscored },
  { id: 'good-score', label: 'B or better', count: counts['good-score'] },
  { id: 'low-score', label: 'Below B', count: counts['low-score'] },
  { id: 'huge', label: 'Too Big', count: counts.huge },
];

const row = (displayName, sizeGb, installed = false) => ({
  displayName,
  name: displayName,
  params: displayName.split(':')[1] ?? '4b',
  sizeGb,
  installed,
  runtime: 'ollama',
});

test('the rail groups the eight quick filters by the question they answer', () => {
  const groups = buildQuickFacetGroups(quickFilters(), '12 GB');
  assert.deepEqual(groups.map((g) => g.id), ['fit', 'local', 'score']);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['fits-vram', 'huge']);
  assert.deepEqual(groups[1].items.map((i) => i.id), ['installed', 'unscored', 'scored']);
  assert.deepEqual(groups[2].items.map((i) => i.id), ['good-score', 'low-score']);
});

test('the fit group names the actual card, not just "fits"', () => {
  const groups = buildQuickFacetGroups(quickFilters(), '12 GB');
  assert.equal(groups[0].label, 'Fits your 12 GB');
});

test('an undetected card falls back to wording that is still true', () => {
  const groups = buildQuickFacetGroups(quickFilters(), '');
  assert.equal(groups[0].label, 'Fits your rig');
  assert.ok(!groups[0].label.includes('undefined'));
});

test('"All" is not offered as a facet — unticking is how you get it back', () => {
  const groups = buildQuickFacetGroups(quickFilters(), '12 GB');
  const ids = groups.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(!ids.includes('all'));
});

test('every facet carries the count clicking it would leave you with', () => {
  const groups = buildQuickFacetGroups(quickFilters(), '12 GB');
  const fit = groups[0].items.find((i) => i.id === 'fits-vram');
  assert.equal(fit.count, 149);
});

// --- search suggestions -----------------------------------------------------

const suggestInput = (query, rows = []) => ({
  query,
  rows,
  quickFilters: quickFilters(),
  taskFilters: [
    { id: 'coding', label: 'Coding' },
    { id: 'assistant', label: 'Chat' },
    { id: 'videogen', label: 'Makes video' },
  ],
  taskCounts: { coding: 40, assistant: 127, videogen: 0 },
  developerOptions: [
    { id: 'google', label: 'Google', count: 24 },
    { id: 'alibaba', label: 'Alibaba Cloud', count: 24 },
  ],
});

test('typing "cod" offers the Coding filter before any model name', () => {
  const out = buildSearchSuggestions(suggestInput('cod', [
    row('qwen2.5-coder:7b', 4.7),
    row('codegemma:2b', 1.6),
  ]));
  assert.equal(out[0].kind, 'task');
  assert.equal(out[0].label, 'Coding');
  assert.equal(out[0].count, 40);
  assert.ok(out.slice(1).every((s) => s.kind === 'model'));
});

test('a filter that would empty the table is never suggested', () => {
  // "Makes video" matches nothing in Ollama's library, so offering it on a
  // search for "vid" would be an offer to look at nothing.
  const out = buildSearchSuggestions(suggestInput('video'));
  assert.ok(!out.some((s) => s.id === 'videogen'));
});

test('one letter suggests nothing — it would match most of the catalogue', () => {
  assert.deepEqual(buildSearchSuggestions(suggestInput('c', [row('codegemma:2b', 1.6)])), []);
});

test('a word-start match outranks the same letters buried mid-word', () => {
  const out = buildSearchSuggestions(suggestInput('cod', [
    row('starcoder2:3b', 1.7),
    row('codegemma:2b', 1.6),
  ]));
  const models = out.filter((s) => s.kind === 'model');
  assert.equal(models[0].label, 'codegemma:2b');
});

test('a hyphen counts as a word start, so qwen2.5-coder beats starcoder2', () => {
  const out = buildSearchSuggestions(suggestInput('cod', [
    row('starcoder2:3b', 1.7),
    row('qwen2.5-coder:7b', 4.7),
  ]));
  const models = out.filter((s) => s.kind === 'model');
  assert.equal(models[0].label, 'qwen2.5-coder:7b');
});

test('something already on disk is offered ahead of an equal-ranked download', () => {
  const out = buildSearchSuggestions(suggestInput('gemma', [
    row('gemma3:12b', 8.1, false),
    row('gemma3:4b', 3.1, true),
  ]));
  const models = out.filter((s) => s.kind === 'model');
  assert.equal(models[0].label, 'gemma3:4b');
});

test('a developer name is a searchable filter too', () => {
  const out = buildSearchSuggestions(suggestInput('goog'));
  assert.equal(out[0].kind, 'developer');
  assert.equal(out[0].id, 'google');
});

test('the list stays short enough to read at a glance', () => {
  const many = Array.from({ length: 40 }, (_, i) => row(`coder-${i}:7b`, 4));
  const out = buildSearchSuggestions(suggestInput('cod', many));
  assert.ok(out.length <= 7, `expected at most 7 suggestions, got ${out.length}`);
});

test('no match at all returns nothing rather than a stale list', () => {
  assert.deepEqual(buildSearchSuggestions(suggestInput('zzzz', [row('gemma3:4b', 3.1)])), []);
});

// --- where a filter is drawn ------------------------------------------------

const { splitTaskFilters, STANDALONE_TASK_FILTERS } = await import('../src/lib/modelFacets.ts');

const chips = [
  { id: 'coding', label: 'Coding' },
  { id: 'assistant', label: 'Chat' },
  { id: 'uncensored', label: 'Uncensored' },
  { id: 'writing', label: 'Writing' },
];

test('Uncensored is not a job you want a model for, so it leaves the Good-for list', () => {
  const { goodFor, standalone } = splitTaskFilters(chips);
  assert.deepEqual(goodFor.map((c) => c.id), ['coding', 'assistant', 'writing']);
  assert.deepEqual(standalone.map((c) => c.id), ['uncensored']);
});

test('splitting loses nothing', () => {
  const { goodFor, standalone } = splitTaskFilters(chips);
  assert.equal(goodFor.length + standalone.length, chips.length);
});

test('a standalone filter the catalogue cannot offer is simply absent', () => {
  // offerableTaskFilters already drops chips nothing matches, so the group must
  // cope with its only member being gone rather than drawing an empty heading.
  const { standalone } = splitTaskFilters([{ id: 'coding', label: 'Coding' }]);
  assert.deepEqual(standalone, []);
});

test('every standalone id is one the task chips actually define', () => {
  const known = new Set(TASK_FILTER_CHIPS.map((chip) => chip.id));
  for (const id of STANDALONE_TASK_FILTERS) {
    assert.ok(known.has(id), `${id} is not a task filter`);
  }
});
