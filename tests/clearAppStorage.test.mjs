import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readRendererSource } from '../scripts/renderer-source.mjs';

// "Clear Data" removed a hand-written list of six keys while the app wrote
// twenty-four, then said "RigMatch app data cleared." Left behind were model
// notes, run history, goals, ComfyUI paths — and a saved OpenRouter API key.
// These tests pin the two properties that stop that returning: the sweep takes
// the whole namespace, and nothing is stored outside the namespace.

/** A localStorage good enough to sweep, including the re-indexing behaviour. */
function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    snapshot: () => Object.fromEntries(map),
  };
}

async function withStorage(entries, run) {
  const storage = fakeStorage(entries);
  const had = 'window' in globalThis;
  const previous = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    const { clearAppStorage, APP_STORAGE_PREFIX } = await import('../src/lib/safeStorage.ts');
    return run({ storage, clearAppStorage, APP_STORAGE_PREFIX });
  } finally {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  }
}

test('the sweep removes every namespaced key, whatever it is', async () => {
  await withStorage({
    'rigmatch:history:v1': '[]',
    'rigmatch:openrouter-key:v1': 'sk-secret',
    'rigmatch:model-notes:v1': '{}',
    'rigmatch:comfy-folder:v1': 'C:/comfy',
    'rigmatch:a-key-invented-tomorrow:v9': 'x',
  }, ({ storage, clearAppStorage }) => {
    const removed = clearAppStorage();
    assert.equal(removed.length, 5);
    assert.deepEqual(storage.snapshot(), {}, 'nothing of ours survives');
  });
});

test('the interface mode survives, so clearing data does not demote the user', async () => {
  // Two keys, one decision: which interface you drive the app with is not data
  // about your models. getSavedUiMode() falls back to 'beginner' when its key is
  // missing, and hasChosenInterfaceMode() is a bare presence check — so losing
  // either one puts an Advanced user back in Simple Mode on the next launch, or
  // re-asks a question they already answered.
  await withStorage({
    'rigmatch:ui-mode:v1': 'advanced',
    'rigmatch:mode-splash:v1': 'chosen',
    'rigmatch:history:v1': '[]',
  }, ({ storage, clearAppStorage }) => {
    clearAppStorage();
    assert.deepEqual(storage.snapshot(), {
      'rigmatch:ui-mode:v1': 'advanced',
      'rigmatch:mode-splash:v1': 'chosen',
    });
  });
});

test('anything kept back is named in the dialog the user reads', () => {
  // The keep list is only honest while the copy admits to it. Adding a key here
  // without saying so is how "cleared" starts quietly meaning "mostly cleared".
  const source = fs.readFileSync('src/lib/safeStorage.ts', 'utf8');
  const kept = [...source.matchAll(/^\s*'(rigmatch:[^']+)',\s*$/gm)].map((m) => m[1]);
  assert.ok(kept.length > 0, 'this test is meaningless if it parses nothing');

  const dialog = fs.readFileSync('src/components/dialogs.tsx', 'utf8');
  const danger = fs.readFileSync('src/components/UtilityPanel.tsx', 'utf8');
  // Each kept key must be accounted for by a phrase the user actually reads.
  const promised = {
    'rigmatch:ui-mode:v1': /Simple or Advanced/,
    'rigmatch:mode-splash:v1': /Simple or Advanced/,
    'rigmatch:first-run-tutorial:v1': /getting-started guide/,
  };
  const unexplained = kept.filter((key) => !(key in promised));
  assert.deepEqual(unexplained, [], 'a new keep needs its own sentence in both dialogs, then an entry here');

  for (const [file, text] of [['dialogs.tsx', dialog], ['UtilityPanel.tsx', danger]]) {
    for (const key of kept) {
      assert.match(text, promised[key], `${file} must tell the user that ${key} is kept`);
    }
  }
});

test('a stored API key does not survive the wipe', async () => {
  // Called out on its own because it is the one with a consequence beyond
  // tidiness: someone clearing their data before passing the laptop on.
  await withStorage({ 'rigmatch:openrouter-key:v1': 'sk-live-do-not-keep' }, ({ storage, clearAppStorage }) => {
    clearAppStorage();
    assert.equal(storage.getItem('rigmatch:openrouter-key:v1'), null);
  });
});

test('other applications on the same origin are left alone', async () => {
  await withStorage({
    'rigmatch:history:v1': '[]',
    'theme': 'dark',
    'some-other-app:token': 'keep-me',
  }, ({ storage, clearAppStorage }) => {
    clearAppStorage();
    assert.deepEqual(storage.snapshot(), { theme: 'dark', 'some-other-app:token': 'keep-me' });
  });
});

test('every key is removed even though removal re-indexes the store', async () => {
  // localStorage.key(i) shifts as entries disappear, so removing inside the
  // scan skips every other key — the classic way a sweep half-works.
  const many = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`rigmatch:key-${i}:v1`, String(i)]),
  );
  await withStorage(many, ({ storage, clearAppStorage }) => {
    assert.equal(clearAppStorage().length, 20);
    assert.equal(storage.length, 0, 'a re-indexing bug would leave about half behind');
  });
});

test('the wipe calls the sweep rather than listing keys by hand', () => {
  const app = readRendererSource();
  assert.match(app, /clearAppStorage\(\)/, 'confirmClearData must sweep');
  const wipe = app.slice(app.indexOf('const confirmClearData'), app.indexOf('const requestDeleteModel'));
  assert.doesNotMatch(
    wipe,
    /localStorage\.removeItem\(/,
    'listing keys by hand inside the wipe is what left sixteen of them behind',
  );
});

test('nothing is stored outside the namespace the sweep can reach', () => {
  // The sweep is complete only while every key carries the prefix. A key
  // written without it would be invisible to the wipe and to this file.
  const offenders = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const [, key] of text.matchAll(/(?:setItem|writeLocal|writeLocalJson)\(\s*'([^']+)'/g)) {
        if (!key.startsWith('rigmatch:')) offenders.push(`${full}: ${key}`);
      }
    }
  };
  walk('src');
  assert.deepEqual(offenders, [], 'these keys would survive "Clear Data" unnoticed');
});
