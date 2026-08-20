// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  dropChat,
  dropTranscripts,
  writeLocal,
  writeLocalJson,
  writeLocalJsonWithFallback,
} from '../src/lib/safeStorage.ts';

/** Minimal localStorage stand-in with a byte budget, so quota can be provoked. */
function installStorage({ budget = Infinity, blocked = false } = {}) {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        if (blocked) {
          const err = new Error('storage blocked');
          err.name = 'SecurityError';
          throw err;
        }
        const used = [...store.entries()].reduce((n, [key, val]) => (key === k ? n : n + key.length + val.length), 0);
        if (used + k.length + v.length > budget) {
          const err = new Error('quota exceeded');
          err.name = 'QuotaExceededError';
          throw err;
        }
        store.set(k, v);
      },
      removeItem: (k) => store.delete(k),
    },
  };
  return store;
}

beforeEach(() => installStorage());
afterEach(() => { delete globalThis.window; });

test('a normal write succeeds and round-trips', () => {
  const store = installStorage();
  assert.equal(writeLocal('k', 'v'), true);
  assert.equal(store.get('k'), 'v');
  assert.equal(writeLocalJson('j', { a: 1 }), true);
  assert.deepEqual(JSON.parse(store.get('j')), { a: 1 });
});

test('a quota failure returns false instead of throwing', () => {
  installStorage({ budget: 20 });
  assert.doesNotThrow(() => writeLocal('key', 'x'.repeat(500)));
  assert.equal(writeLocal('key', 'x'.repeat(500)), false);
});

test('blocked storage returns false instead of throwing', () => {
  installStorage({ blocked: true });
  assert.equal(writeLocal('k', 'v'), false);
  assert.equal(writeLocalJson('k', { a: 1 }), false);
});

test('a missing window never throws', () => {
  delete globalThis.window;
  assert.equal(writeLocal('k', 'v'), false);
  assert.equal(writeLocalJson('k', {}), false);
});

test('unserializable values fail closed rather than throwing', () => {
  installStorage();
  const circular = {};
  circular.self = circular;
  assert.doesNotThrow(() => writeLocalJson('k', circular));
  assert.equal(writeLocalJson('k', circular), false);
});

test('the fallback ladder writes the first candidate that fits', () => {
  const store = installStorage({ budget: 120 });
  const big = { pad: 'x'.repeat(400) };
  const medium = { pad: 'x'.repeat(200) };
  const small = { pad: 'x'.repeat(10) };

  const index = writeLocalJsonWithFallback('h', [() => big, () => medium, () => small]);
  assert.equal(index, 2, 'should fall through to the only candidate that fits');
  assert.deepEqual(JSON.parse(store.get('h')), small);
});

test('the ladder reports -1 when nothing fits, and writes nothing', () => {
  const store = installStorage({ budget: 5 });
  const index = writeLocalJsonWithFallback('h', [() => ({ pad: 'x'.repeat(100) })]);
  assert.equal(index, -1);
  assert.equal(store.has('h'), false);
});

test('later candidates are not built unless needed', () => {
  installStorage();
  let builtSecond = false;
  const index = writeLocalJsonWithFallback('h', [
    () => ({ ok: true }),
    () => { builtSecond = true; return {}; },
  ]);
  assert.equal(index, 0);
  assert.equal(builtSecond, false, 'trimming is expensive; it must be deferred');
});

test('a throwing candidate is skipped rather than aborting the ladder', () => {
  const store = installStorage();
  const index = writeLocalJsonWithFallback('h', [
    () => { throw new Error('trim blew up'); },
    () => ({ recovered: true }),
  ]);
  assert.equal(index, 1);
  assert.deepEqual(JSON.parse(store.get('h')), { recovered: true });
});

test('dropping transcripts keeps every score and drops only the text', () => {
  const history = {
    selectedModel: 'qwen2.5:7b',
    benchmarkByModel: {
      'qwen2.5:7b': {
        model: 'qwen2.5:7b',
        completedAt: '2026-08-03T00:00:00Z',
        scores: { total: 88, grade: 'A', speed: 90, sobriety: 88, stability: 92, fit: 80 },
        prompts: [
          { id: 'q1', label: 'JSON/tool output', sobrietyScore: 91, elapsedMs: 900, prompt: 'a'.repeat(3000), response: 'b'.repeat(9000) },
        ],
      },
    },
  };

  const trimmed = dropTranscripts(history);
  const kept = trimmed.benchmarkByModel['qwen2.5:7b'];

  assert.deepEqual(kept.scores, history.benchmarkByModel['qwen2.5:7b'].scores, 'scores must survive');
  assert.equal(kept.prompts[0].sobrietyScore, 91, 'per-question scores must survive');
  assert.equal(kept.prompts[0].label, 'JSON/tool output', 'labels must survive');
  assert.equal(kept.prompts[0].elapsedMs, 900, 'timings must survive');
  assert.equal(kept.prompts[0].response, '', 'answer text is what gets dropped');
  assert.equal(kept.prompts[0].prompt, '');
  assert.equal(trimmed.selectedModel, 'qwen2.5:7b', 'unrelated fields are untouched');

  // Must not mutate the live in-memory state.
  assert.equal(history.benchmarkByModel['qwen2.5:7b'].prompts[0].response.length, 9000);
  assert.ok(JSON.stringify(trimmed).length < JSON.stringify(history).length / 2);
});

test('dropping transcripts tolerates missing or malformed prompt lists', () => {
  assert.doesNotThrow(() => dropTranscripts({}));
  assert.doesNotThrow(() => dropTranscripts({ benchmarkByModel: { m: {} } }));
  const odd = dropTranscripts({ benchmarkByModel: { m: { prompts: null } } });
  assert.deepEqual(odd.benchmarkByModel.m.prompts, []);
});

test('dropping chat clears transcripts without touching the rest', () => {
  const history = { chatMessagesByModel: { m: [{ id: '1', content: 'hi' }] }, modelScores: { m: { total: 80 } } };
  const trimmed = dropChat(history);
  assert.deepEqual(trimmed.chatMessagesByModel, {});
  assert.deepEqual(trimmed.modelScores, { m: { total: 80 } });
  assert.equal(history.chatMessagesByModel.m.length, 1, 'must not mutate live state');
});
