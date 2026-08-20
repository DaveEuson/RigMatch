// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  pickLatestRigmatchRelease,
  hasNewerRigmatchRelease,
  normalizeReleaseVersion,
  compareVersions,
  isNightlyRelease,
} = require('../electron/updates.cjs');

// Mirrors the live DaveEuson/RigMatch.AI release history as of 2026-07-01,
// after the workflow fix that publishes -beta tags with prerelease=false.
const RELEASES = [
  { tag_name: 'v0.2.5-beta', name: 'v0.2.5-beta', prerelease: false, draft: false, published_at: '2026-06-28T16:53:52Z' },
  { tag_name: 'v0.2.4-nightly.1', name: 'v0.2.4-nightly.1', prerelease: true, draft: false, published_at: '2026-06-22T03:41:16Z' },
  { tag_name: 'v0.2.4-beta', name: 'v0.2.4-beta', prerelease: false, draft: false, published_at: '2026-06-21T18:59:33Z' },
  { tag_name: 'v0.2.3-nightly.2', name: 'v0.2.3-nightly.2', prerelease: true, draft: false, published_at: '2026-06-21T16:19:50Z' },
  { tag_name: 'v0.2.2', name: 'v0.2.2', prerelease: false, draft: false, published_at: '2026-06-19T05:08:06Z' },
];

test('release channel picks the newest stable -beta tag, not an older plain release', () => {
  const latest = pickLatestRigmatchRelease(RELEASES, 'release');
  assert.equal(latest.tag_name, 'v0.2.5-beta');
});

test('a 0.2.4 install is offered the 0.2.5 release', () => {
  const latest = pickLatestRigmatchRelease(RELEASES, 'release');
  const latestVersion = normalizeReleaseVersion(latest.tag_name);
  assert.equal(latestVersion, '0.2.5');
  assert.equal(hasNewerRigmatchRelease({
    currentVersion: '0.2.4',
    latestVersion,
    currentTag: 'v0.2.4',
    latestTag: latest.tag_name,
    channel: 'release',
    isPrerelease: latest.prerelease,
  }), true);
});

test('a 0.2.6 install reports no update available', () => {
  const latest = pickLatestRigmatchRelease(RELEASES, 'release');
  assert.equal(hasNewerRigmatchRelease({
    currentVersion: '0.2.6',
    latestVersion: normalizeReleaseVersion(latest.tag_name),
    currentTag: 'v0.2.6',
    latestTag: latest.tag_name,
    channel: 'release',
    isPrerelease: latest.prerelease,
  }), false);
});

test('nightly channel prefers the newest nightly build', () => {
  const latest = pickLatestRigmatchRelease(RELEASES, 'nightly');
  assert.equal(latest.tag_name, 'v0.2.4-nightly.1');
});

test('regression: -beta releases wrongly flagged prerelease fall back to old stable (the 0.2.4 updater bug)', () => {
  // Before the release-workflow fix, GitHub marked v0.2.4/0.2.5-beta as
  // prereleases; the release channel then reported v0.2.2 as latest and told
  // a 0.2.4 install it was up to date. This documents that failure mode.
  const buggyReleases = RELEASES.map((release) =>
    release.tag_name.includes('-beta') ? { ...release, prerelease: true } : release);
  const latest = pickLatestRigmatchRelease(buggyReleases, 'release');
  assert.equal(latest.tag_name, 'v0.2.2');
  assert.equal(hasNewerRigmatchRelease({
    currentVersion: '0.2.4',
    latestVersion: normalizeReleaseVersion(latest.tag_name),
    currentTag: 'v0.2.4',
    latestTag: latest.tag_name,
    channel: 'release',
    isPrerelease: latest.prerelease,
  }), false);
});

test('drafts are never offered', () => {
  const withDraft = [
    { tag_name: 'v0.9.9', name: 'v0.9.9', prerelease: false, draft: true, published_at: '2026-07-01T00:00:00Z' },
    ...RELEASES,
  ];
  assert.equal(pickLatestRigmatchRelease(withDraft, 'release').tag_name, 'v0.2.5-beta');
});

test('version helpers handle tags, prefixes, and suffixes', () => {
  assert.equal(normalizeReleaseVersion('v0.2.5-beta'), '0.2.5');
  assert.equal(normalizeReleaseVersion('RigMatch 0.3.0'), '0.3.0');
  assert.equal(compareVersions('0.2.10', '0.2.9') > 0, true);
  assert.equal(isNightlyRelease({ tag_name: 'v0.2.4-nightly.1' }), true);
  assert.equal(isNightlyRelease({ tag_name: 'v0.2.5-beta' }), false);
});
