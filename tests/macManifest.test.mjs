import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertBothArches,
  mergeManifests,
  parseManifest,
  renderManifest,
} from '../scripts/merge-mac-manifest.mjs';

// Verbatim from the published v0.3.8-beta release — the arm64-only manifest
// that leaves Intel Macs unable to update.
const ARM64_YML = `version: 0.3.8
files:
  - url: RigMatch.AI-0.3.8-mac-arm64.zip
    sha512: UsvaytnkFYaqVi65DAhYfFxRzGPZMTwAabEMU7lObOou4a/hrywY7oVj42TORtrzcr2j/BK+o3ndowe2oAp0Kw==
    size: 139002741
  - url: RigMatch.AI-0.3.8-mac-arm64.dmg
    sha512: /VQy3P2vZje2a11Ky3A9Zsyuk5fk5ApjVxcoyPPIwqeT5SXUdVIS4eTEI3iqJsK/NaDhhyddT/o8J9ePwjg/Aw==
    size: 278527718
path: RigMatch.AI-0.3.8-mac-arm64.zip
sha512: UsvaytnkFYaqVi65DAhYfFxRzGPZMTwAabEMU7lObOou4a/hrywY7oVj42TORtrzcr2j/BK+o3ndowe2oAp0Kw==
releaseDate: '2026-08-03T05:53:49.840Z'
`;

const X64_YML = `version: 0.3.8
files:
  - url: RigMatch.AI-0.3.8-mac-x64.zip
    sha512: aaaaBBBBccccDDDDeeeeFFFFggggHHHHiiiiJJJJkkkkLLLLmmmmNNNNooooPPPP==
    size: 141000000
  - url: RigMatch.AI-0.3.8-mac-x64.dmg
    sha512: qqqqRRRRssssTTTTuuuuVVVVwwwwXXXXyyyyZZZZ0000111122223333444455==
    size: 282000000
path: RigMatch.AI-0.3.8-mac-x64.zip
sha512: aaaaBBBBccccDDDDeeeeFFFFggggHHHHiiiiJJJJkkkkLLLLmmmmNNNNooooPPPP==
releaseDate: '2026-08-03T05:55:10.000Z'
`;

test('a real published manifest parses', () => {
  const m = parseManifest(ARM64_YML);
  assert.equal(m.version, '0.3.8');
  assert.equal(m.files.length, 2);
  assert.equal(m.files[0].url, 'RigMatch.AI-0.3.8-mac-arm64.zip');
  assert.equal(m.files[0].size, '139002741');
  assert.equal(m.files[1].url, 'RigMatch.AI-0.3.8-mac-arm64.dmg');
  assert.equal(m.path, 'RigMatch.AI-0.3.8-mac-arm64.zip');
  assert.equal(m.releaseDate, '2026-08-03T05:53:49.840Z', 'quotes must be stripped');
  // A sha512 ending in "==" must not lose its padding.
  assert.ok(m.sha512.endsWith('=='));
});

test('blockMapSize and other extra keys survive a round trip', () => {
  const withBlockMap = `version: 0.3.8
files:
  - url: App-arm64.zip
    sha512: abc==
    size: 100
    blockMapSize: 4242
path: App-arm64.zip
sha512: abc==
releaseDate: '2026-08-03T00:00:00.000Z'
`;
  const round = parseManifest(renderManifest(parseManifest(withBlockMap)));
  assert.equal(round.files[0].blockMapSize, '4242');
  assert.equal(round.files[0].size, '100');
});

test('merging lists both architectures, arm64 first', () => {
  const merged = mergeManifests([parseManifest(ARM64_YML), parseManifest(X64_YML)]);

  assert.equal(merged.version, '0.3.8');
  assert.deepEqual(merged.files.map((f) => f.url), [
    'RigMatch.AI-0.3.8-mac-arm64.zip',
    'RigMatch.AI-0.3.8-mac-arm64.dmg',
    'RigMatch.AI-0.3.8-mac-x64.zip',
    'RigMatch.AI-0.3.8-mac-x64.dmg',
  ]);
  // Legacy top-level fields keep pointing at arm64, as they do today.
  assert.equal(merged.path, 'RigMatch.AI-0.3.8-mac-arm64.zip');
  assert.equal(merged.releaseDate, '2026-08-03T05:55:10.000Z', 'newest release date wins');
});

test('merge order does not matter', () => {
  const a = mergeManifests([parseManifest(ARM64_YML), parseManifest(X64_YML)]);
  const b = mergeManifests([parseManifest(X64_YML), parseManifest(ARM64_YML)]);
  assert.deepEqual(a.files.map((f) => f.url), b.files.map((f) => f.url));
  assert.equal(a.path, b.path);
});

test('an Intel Mac finds a candidate in the merged manifest', () => {
  const merged = mergeManifests([parseManifest(ARM64_YML), parseManifest(X64_YML)]);
  // Mirrors MacUpdater.filterFilesForArch for a non-arm64 Mac.
  const forIntel = merged.files.filter((f) => !f.url.includes('arm64'));
  assert.equal(forIntel.length, 2, 'this is exactly what was empty before the fix');
  assert.ok(forIntel.every((f) => f.url.includes('x64')));

  const forArm = merged.files.filter((f) => f.url.includes('arm64'));
  assert.equal(forArm.length, 2);
});

test('the arm64-only manifest is rejected rather than published', () => {
  const merged = mergeManifests([parseManifest(ARM64_YML)]);
  assert.throws(() => assertBothArches(merged), /must list both architectures/);
});

test('mismatched versions are refused', () => {
  const stale = parseManifest(X64_YML.replace('version: 0.3.8', 'version: 0.3.7'));
  assert.throws(
    () => mergeManifests([parseManifest(ARM64_YML), stale]),
    /disagree on version/,
    'a stale artifact must not produce a manifest mixing two releases',
  );
});

test('rendered output is valid input (round trip is stable)', () => {
  const merged = mergeManifests([parseManifest(ARM64_YML), parseManifest(X64_YML)]);
  const rendered = renderManifest(merged);
  const reparsed = parseManifest(rendered);

  assert.equal(reparsed.version, merged.version);
  assert.deepEqual(reparsed.files.map((f) => f.url), merged.files.map((f) => f.url));
  assert.deepEqual(reparsed.files.map((f) => f.sha512), merged.files.map((f) => f.sha512));
  assert.equal(reparsed.path, merged.path);
  assert.equal(reparsed.releaseDate, merged.releaseDate);

  // Sizes must stay unquoted so they parse as numbers.
  assert.match(rendered, /^\s+size: 139002741$/m);
  assert.ok(!/size: '/.test(rendered), 'quoting size would break electron-updater');
});

test('empty input fails loudly', () => {
  assert.throws(() => mergeManifests([]), /No Mac manifests/);
});

// ── real local build output (Apple M4) ───────────────────────────────────────

// Verbatim from `electron-builder --mac` on an M4 — the first latest-mac.yml
// generated outside a GitHub runner. It confirms the root cause: electron-builder
// emits a manifest for the arch it just built, so CI's two Mac runners each write
// one under the same name and one overwrites the other.
const M4_LOCAL_BUILD = `version: 0.3.10
files:
  - url: RigMatch.AI-0.3.10-mac-arm64.zip
    sha512: XdCIHu2b64eNP1HBmYr98XIEdzPS7JO6TY00xzPe47wQqfJGrt2Kq7i82fFgmc6zRhuar6JPw6OlKCbEQiYOJg==
    size: 131246374
  - url: RigMatch.AI-0.3.10-mac-arm64.dmg
    sha512: duQ8J7FtCTxfUfjZELNnN1jOhcHUIYICxS7dmn0xTdk+1JI3spcPvQ33bzS9QZywUNtB5JXCy+eZm3GagEFZjA==
    size: 262937960
path: RigMatch.AI-0.3.10-mac-arm64.zip
sha512: XdCIHu2b64eNP1HBmYr98XIEdzPS7JO6TY00xzPe47wQqfJGrt2Kq7i82fFgmc6zRhuar6JPw6OlKCbEQiYOJg==
releaseDate: '2026-08-04T18:18:46.318Z'
`;

test('a single-arch build produces exactly the manifest that broke Intel Macs', () => {
  const parsed = parseManifest(M4_LOCAL_BUILD);
  assert.equal(parsed.files.length, 2);
  assert.ok(parsed.files.every((f) => f.url.includes('arm64')), 'arm64 only, as electron-builder intends');

  // On its own this is the published-0.3.8 state: an Intel Mac filtering out
  // arm64 files is left with nothing to download.
  const forIntel = parsed.files.filter((f) => !f.url.includes('arm64'));
  assert.equal(forIntel.length, 0, 'this is the bug, reproduced from a real build');

  assert.throws(() => assertBothArches(mergeManifests([parsed])), /must list both architectures/);
});

test('merging the real arm64 build with an Intel one fixes it', () => {
  const intel = parseManifest(M4_LOCAL_BUILD
    .replace(/mac-arm64/g, 'mac-x64')
    .replace(/XdCIHu2b/g, 'IntelZipA')
    .replace(/duQ8J7Ft/g, 'IntelDmgB'));

  const merged = mergeManifests([parseManifest(M4_LOCAL_BUILD), intel]);
  assert.equal(assertBothArches(merged), true);
  assert.equal(merged.files.length, 4);

  // Both architectures now resolve, which is the whole point.
  assert.equal(merged.files.filter((f) => f.url.includes('arm64')).length, 2);
  assert.equal(merged.files.filter((f) => !f.url.includes('arm64')).length, 2);

  // The real arm64 checksums survive the merge untouched.
  const armZip = merged.files.find((f) => f.url === 'RigMatch.AI-0.3.10-mac-arm64.zip');
  assert.equal(armZip.sha512, 'XdCIHu2b64eNP1HBmYr98XIEdzPS7JO6TY00xzPe47wQqfJGrt2Kq7i82fFgmc6zRhuar6JPw6OlKCbEQiYOJg==');
  assert.equal(armZip.size, '131246374');
});
