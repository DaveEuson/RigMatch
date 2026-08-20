// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The version is declared in six places. Keeping them in step has failed twice
 * already — once badly enough to earn a commit called "Align version references
 * to 0.2.4", and again when the Chat companion sat at 0.4.1 through two releases
 * and shipped inside 0.4.3 installers reporting itself as 0.4.1.
 *
 * Nothing about a missed one is visible at build time: the app compiles, the
 * installer builds, and the wrong number just turns up in bundle metadata and
 * the About box. So assert it instead.
 *
 * package.json is the source of truth — it is what electron-builder uses for
 * `artifactName` and what the release workflow tags against.
 */

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

const expected = readJson('package.json').version;

/** Pull a single capture group out of a file, failing loudly if absent. */
function extract(rel, pattern, label) {
  const match = read(rel).match(pattern);
  assert.ok(match, `could not find ${label} in ${rel} — the declaration moved, so this guard is no longer checking anything`);
  return match[1];
}

test('the release version is declared consistently everywhere', () => {
  assert.match(expected, /^\d+\.\d+\.\d+$/, 'package.json version should be a plain semver');

  const declarations = {
    'src/lib/appConfig.ts (APP_VERSION)':
      extract('src/lib/appConfig.ts', /APP_VERSION\s*=\s*'([^']+)'/, 'APP_VERSION'),

    'src/api.ts (APP_VERSION)':
      extract('src/api.ts', /APP_VERSION\s*=\s*'([^']+)'/, 'APP_VERSION'),

    'rigmatch-chat/package.json':
      readJson('rigmatch-chat/package.json').version,

    // The [package] version, not a dependency's — anchor on the section header.
    'rigmatch-chat/src-tauri/Cargo.toml':
      extract('rigmatch-chat/src-tauri/Cargo.toml', /\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/, '[package] version'),

    'rigmatch-chat/src-tauri/tauri.conf.json':
      readJson('rigmatch-chat/src-tauri/tauri.conf.json').version,

    // Cargo rewrites this on build; a stale lock means someone edited Cargo.toml
    // by hand and never ran cargo, which `cargo build --locked` would reject.
    'rigmatch-chat/src-tauri/Cargo.lock':
      extract('rigmatch-chat/src-tauri/Cargo.lock', /name = "rigmatch-chat"\nversion = "([^"]+)"/, 'rigmatch-chat lock entry'),
  };

  const wrong = Object.entries(declarations)
    .filter(([, value]) => value !== expected)
    .map(([where, value]) => `${where} = ${value}`);

  assert.deepEqual(wrong, [], `these disagree with package.json (${expected})`);
});

test('the changelog has an entry for the current version', () => {
  // A release whose notes are missing fails the build at tag time, deep into a
  // five-platform matrix. Catching it in `npm test` is cheaper.
  const notes = read('src/data/releaseNotes.ts');
  assert.ok(
    notes.includes(`version: '${expected}'`),
    `src/data/releaseNotes.ts has no entry for ${expected} — add one before tagging`,
  );
});
