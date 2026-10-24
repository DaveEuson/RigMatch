// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODEL_NEWS_PAGE_SIZE,
  getEmptyModelNewsState,
  getModelNewsId,
  getModelNewsItems,
  getModelNewsPage,
  groupModelNews,
  reconcileModelNews,
} from '../src/lib/modelNews.ts';

// What's New decides a claim the user reads: "3 new models found." Nothing
// tested it before useModelNews was extracted, and the extraction is the moment
// to fix that — the refactor asserts this behavior is unchanged, so the
// behavior needs saying out loud somewhere.

const model = (name, tag = 'latest') => ({ id: `${name}:${tag}`, name, tag });

test('the first ever scan announces nothing', () => {
  // Everything is new on a fresh install. Announcing it would greet a first-run
  // user with "347 new models found", which is true of the catalog and false
  // about their situation.
  const catalog = [model('llama3'), model('gemma3'), model('qwen2.5')];
  const { isBootstrap, state } = reconcileModelNews(catalog, getEmptyModelNewsState());

  assert.equal(isBootstrap, true);
  assert.deepEqual(state.latestNewModelIds, [], 'a first run must announce nothing');
  assert.equal(state.knownModelIds.length, 3, 'but it must remember what it saw');
});

test('a model that appears after bootstrap is announced once', () => {
  const first = reconcileModelNews([model('llama3')], getEmptyModelNewsState());
  const second = reconcileModelNews([model('llama3'), model('gemma3')], first.state);

  assert.equal(second.isBootstrap, false);
  assert.deepEqual(second.state.latestNewModelIds, [getModelNewsId(model('gemma3'))]);

  // Scanning again with the same catalog must not re-announce it.
  const third = reconcileModelNews([model('llama3'), model('gemma3')], second.state);
  assert.deepEqual(third.state.latestNewModelIds, [], 'a known model is not new twice');
});

test('a model that disappears from the catalog stays known', () => {
  // Ollama's index is not stable; a model dropping out for one scan and coming
  // back must not read as a new arrival.
  const first = reconcileModelNews([model('llama3'), model('gemma3')], getEmptyModelNewsState());
  const without = reconcileModelNews([model('llama3')], first.state);
  const back = reconcileModelNews([model('llama3'), model('gemma3')], without.state);

  assert.deepEqual(back.state.latestNewModelIds, [], 'a returning model is not a new one');
  assert.ok(back.state.knownModelIds.includes(getModelNewsId(model('gemma3'))));
});

test('first-seen timestamps survive later scans', () => {
  const first = reconcileModelNews([model('llama3')], getEmptyModelNewsState());
  const id = getModelNewsId(model('llama3'));
  const originallySeen = first.state.firstSeenById[id];
  assert.ok(originallySeen, 'a first-seen time is recorded');

  const later = reconcileModelNews([model('llama3'), model('gemma3')], first.state);
  assert.equal(later.state.firstSeenById[id], originallySeen, 'the original sighting is not overwritten');
});

test('known ids stay deduplicated and sorted', () => {
  const first = reconcileModelNews([model('zephyr'), model('alpha')], getEmptyModelNewsState());
  const second = reconcileModelNews([model('alpha'), model('mistral')], first.state);

  const ids = second.state.knownModelIds;
  assert.deepEqual(ids, [...new Set(ids)], 'no duplicates');
  assert.deepEqual(ids, [...ids].sort(), 'sorted, so the stored state is stable between runs');
});

test('a model with no id falls back to name:tag', () => {
  // The catalog does not always carry an id, and an empty one would collapse
  // every such model onto a single key — every one of them looking known.
  const a = getModelNewsId({ id: '', name: 'llama3', tag: '8b' });
  const b = getModelNewsId({ id: '', name: 'llama3', tag: '70b' });
  assert.notEqual(a, b, 'different tags are different models');
  assert.ok(a && b, 'neither is empty');
});

// Paging. On 2026-10-23 one scan brought 20 new tags, and the list had no
// pages: one family (phonon:de, phonon:en, phonon:40m-es, ...) filled the
// screen a row per tag.

const numbers = (count) => Array.from({ length: count }, (_, i) => i + 1);

test('a page is the slice its number says, with "Showing 21–40 of 63" figures', () => {
  const page = getModelNewsPage(numbers(63), 2, 20);
  assert.deepEqual(page.entries, numbers(40).slice(20));
  assert.deepEqual(
    { page: page.page, pageCount: page.pageCount, total: page.total, first: page.first, last: page.last },
    { page: 2, pageCount: 4, total: 63, first: 21, last: 40 },
  );

  const lastPage = getModelNewsPage(numbers(63), 4, 20);
  assert.deepEqual(lastPage.entries, [61, 62, 63], 'the last page holds what is left');
  assert.deepEqual([lastPage.first, lastPage.last], [61, 63]);
});

test('a remembered page past the end lands on the last page that exists', () => {
  // The page survives leaving the screen; a scan can shrink the list under it.
  assert.equal(getModelNewsPage(numbers(63), 9, 20).page, 4);
  assert.equal(getModelNewsPage(numbers(63), 0, 20).page, 1);
  assert.equal(getModelNewsPage(numbers(63), Number.NaN, 20).page, 1);
});

test('an empty list is page 1 of 1 with nothing showing', () => {
  const page = getModelNewsPage([], 3);
  assert.deepEqual(
    { entries: page.entries, page: page.page, pageCount: page.pageCount, first: page.first, last: page.last },
    { entries: [], page: 1, pageCount: 1, first: 0, last: 0 },
  );
});

test('the default page size is the one the screen uses', () => {
  assert.equal(getModelNewsPage(numbers(MODEL_NEWS_PAGE_SIZE + 1), 1).pageCount, 2);
  assert.equal(getModelNewsPage(numbers(MODEL_NEWS_PAGE_SIZE), 1).pageCount, 1);
});

const phononTags = ['40m-es', '40m-fr', '40m-multilingual', '40m-pt', 'de', 'en', 'es', 'fr', 'multilingual', 'pt'];

function newsItemsFor(catalog, newIds) {
  // Through the real path: a bootstrap scan, then a scan that finds newIds.
  const before = catalog.filter((entry) => !newIds.includes(entry.id));
  const first = reconcileModelNews(before, getEmptyModelNewsState()).state;
  // Later than the bootstrap, so the new ones sort first.
  const state = { ...first, firstSeenById: { ...first.firstSeenById } };
  for (const id of newIds) state.firstSeenById[id] = '2026-10-23T14:26:00.000Z';
  for (const id of Object.keys(first.firstSeenById)) state.firstSeenById[id] = '2026-10-01T09:00:00.000Z';
  return getModelNewsItems(catalog, state, new Set());
}

test("a family that lands as many tags is one row, at its newest tag's place", () => {
  const catalog = [
    model('llama3', '8b'),
    ...phononTags.map((tag) => model('phonon', tag)),
    model('gemma3', '4b'),
  ];
  const items = newsItemsFor(catalog, phononTags.map((tag) => `phonon:${tag}`));
  const grouped = groupModelNews(items);

  assert.equal(grouped.length, 3, 'phonon, llama3, gemma3');
  assert.equal(grouped[0].kind, 'group', 'the newest family comes first');
  assert.equal(grouped[0].group.family, 'phonon');
  assert.equal(grouped[0].group.rows.length, phononTags.length, 'every tag is still reachable under it');
  assert.equal(grouped[0].group.best, grouped[0].group.rows[0], 'the face is the newest tag');
});

test('a family of one stays a plain row that opens the model', () => {
  const items = newsItemsFor([model('llama3', '8b'), model('gemma3', '4b')], []);
  const grouped = groupModelNews(items);
  assert.deepEqual(grouped.map((entry) => entry.kind), ['row', 'row']);
});

test('pages count families, not tags', () => {
  // 30 one-tag families plus phonon's ten tags is 40 tags but 31 rows.
  const singles = numbers(30).map((n) => model(`family${n}`, '7b'));
  const catalog = [...phononTags.map((tag) => model('phonon', tag)), ...singles];
  const grouped = groupModelNews(newsItemsFor(catalog, catalog.map((entry) => entry.id)));

  assert.equal(grouped.length, 31);
  const second = getModelNewsPage(grouped, 2, 20);
  assert.equal(second.pageCount, 2);
  assert.deepEqual([second.first, second.last, second.total], [21, 31, 31]);
});
