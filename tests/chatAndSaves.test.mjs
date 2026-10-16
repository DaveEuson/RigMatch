// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const app = read('../src/App.tsx');
/** Whether App.tsx carries a line; a failing match must not print the whole file. */
const has = (pattern) => pattern.test(app);

const { companionFallbackNote, companionLaunchMessage } = await import('../src/lib/companionLaunch.ts');
const { ADVANCED_LAB_STORAGE_KEY } = await import('../src/lib/appConfig.ts');

/**
 * Two findings from the 0.9.7 bug scan: a Lab result that storage refused was
 * lost behind a success toast, and "Chat with <winner>" did nothing visible
 * when RigMatch Chat was already open, or fell back to the in-app chat with no
 * word on why.
 */

/** A localStorage stand-in whose setItem can be made to refuse. */
function installStorage() {
  const store = new Map();
  const storage = {
    full: false,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (storage.full) {
        const err = new Error('quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, v);
    },
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  globalThis.window = { localStorage: storage };
  return storage;
}

beforeEach(() => installStorage());
afterEach(() => { delete globalThis.window; });

const result = (model, score = 80) => ({
  model, challenge: 'code', score, grade: 'B', elapsedMs: 1000, response: '', checks: [], completedAt: '2026-10-12T00:00:00.000Z',
});

test('a result storage refuses is kept for the session and the refusal is reported', async () => {
  const lab = await import('../src/lib/labResults.ts');
  const storage = window.localStorage;
  assert.equal(lab.writeAdvancedLabResults({ a: result('a') }), true);
  assert.equal(lab.labSaveFailure(), null);

  storage.full = true;
  assert.equal(lab.writeAdvancedLabResults({ ...lab.readAdvancedLabResults(), b: result('b') }), false, 'the write says it failed');
  assert.deepEqual(Object.keys(lab.readAdvancedLabResults()), ['a', 'b'], 'the result is not lost');
  assert.deepEqual(Object.keys(lab.labResultsSnapshot()), ['a', 'b'], 'the screens see it');
  assert.match(lab.labSaveFailure() ?? '', /could not be saved/);
  assert.match(lab.labSaveFailure() ?? '', /until RigMatch closes/);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(ADVANCED_LAB_STORAGE_KEY))), ['a'], 'storage holds what it took');

  // Room again: the next write lands the whole map and the warning clears.
  storage.full = false;
  assert.equal(lab.writeAdvancedLabResults({ ...lab.readAdvancedLabResults(), c: result('c') }), true);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(ADVANCED_LAB_STORAGE_KEY))), ['a', 'b', 'c']);
  assert.equal(lab.labSaveFailure(), null);

  // Clear Data drops what was held in memory along with the storage.
  storage.full = true;
  lab.writeAdvancedLabResults({ ...lab.readAdvancedLabResults(), d: result('d') });
  storage.clear();
  lab.refreshLabResults();
  assert.deepEqual(lab.readAdvancedLabResults(), {});
  assert.equal(lab.labSaveFailure(), null);
});

test('the app says so once per refusal', () => {
  assert.equal(has(/const labSaveProblem = useLabSaveFailure\(\);/), true);
  assert.equal(has(/if \(labSaveProblem !== announcedLabSaveProblem\) \{\n\s*setAnnouncedLabSaveProblem\(labSaveProblem\);\n\s*if \(labSaveProblem\) tellUser\(labSaveProblem\);/), true);
});

test('when RigMatch Chat does not open, the in-app chat says why it is here instead', () => {
  for (const reason of ['not-found', 'spawn-failed', 'bridge-taken', 'missing-libraries', undefined]) {
    const note = companionFallbackNote({ ok: false, reason });
    assert.match(note, /^RigMatch Chat did not open/, String(reason));
    assert.match(note, /here instead/, String(reason));
    assert.equal(note.includes('\n'), false, 'one line, for a toast');
    // The same cause the full message gives.
    assert.equal(companionLaunchMessage({ ok: false, reason }) !== null, true);
  }
  assert.match(companionFallbackNote({ ok: false, reason: 'bridge-taken' }), /another RigMatch/i);
  assert.match(companionFallbackNote({ ok: false, reason: 'spawn-failed' }), /would not start/);
  assert.match(companionFallbackNote({ ok: false }), /not found/);
});

test('"Chat with" says where the chat is when RigMatch Chat is already open, and why when it is not', () => {
  // The main process answers { ok: true, reason: 'already running' } rather
  // than starting a second copy; the renderer used to do nothing with it.
  const body = app.slice(app.indexOf('const openChatWith = useCallback'), app.indexOf('const openChatWith = useCallback') + 1200);
  assert.equal(/if \(result\.reason === 'already running'\) tellUser\(/.test(body), true, 'an open companion is pointed at');
  assert.equal(/setChatOpen\(true\);\n\s*tellUser\(companionFallbackNote\(result\)\);/.test(body), true, 'the fallback says why');
  assert.equal(/if \(!result\?\.ok\) setChatOpen\(true\);/.test(body), false, 'the silent fallback is gone');
  // The top bar's Chat button, too.
  const topBar = app.slice(app.indexOf('const openChatApp = useCallback'), app.indexOf('const openChatApp = useCallback') + 700);
  assert.equal(/result\.reason === 'already running'/.test(topBar), true);
});
