// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEmptyModelNewsState,
  getModelNewsId,
  reconcileModelNews,
} from '../src/lib/modelNews.ts';

// What's New decides a claim the user reads: "3 new models found." Nothing
// tested it before useModelNews was extracted, and the extraction is the moment
// to fix that — the refactor asserts this behaviour is unchanged, so the
// behaviour needs saying out loud somewhere.

const model = (name, tag = 'latest') => ({ id: `${name}:${tag}`, name, tag });

test('the first ever scan announces nothing', () => {
  // Everything is new on a fresh install. Announcing it would greet a first-run
  // user with "347 new models found", which is true of the catalogue and false
  // about their situation.
  const catalogue = [model('llama3'), model('gemma3'), model('qwen2.5')];
  const { isBootstrap, state } = reconcileModelNews(catalogue, getEmptyModelNewsState());

  assert.equal(isBootstrap, true);
  assert.deepEqual(state.latestNewModelIds, [], 'a first run must announce nothing');
  assert.equal(state.knownModelIds.length, 3, 'but it must remember what it saw');
});

test('a model that appears after bootstrap is announced once', () => {
  const first = reconcileModelNews([model('llama3')], getEmptyModelNewsState());
  const second = reconcileModelNews([model('llama3'), model('gemma3')], first.state);

  assert.equal(second.isBootstrap, false);
  assert.deepEqual(second.state.latestNewModelIds, [getModelNewsId(model('gemma3'))]);

  // Scanning again with the same catalogue must not re-announce it.
  const third = reconcileModelNews([model('llama3'), model('gemma3')], second.state);
  assert.deepEqual(third.state.latestNewModelIds, [], 'a known model is not new twice');
});

test('a model that disappears from the catalogue stays known', () => {
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
  // The catalogue does not always carry an id, and an empty one would collapse
  // every such model onto a single key — every one of them looking known.
  const a = getModelNewsId({ id: '', name: 'llama3', tag: '8b' });
  const b = getModelNewsId({ id: '', name: 'llama3', tag: '70b' });
  assert.notEqual(a, b, 'different tags are different models');
  assert.ok(a && b, 'neither is empty');
});
