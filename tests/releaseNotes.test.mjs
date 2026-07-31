import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { releaseNotes } from '../src/data/releaseNotes.ts';
import {
  findEntry,
  normalizeTag,
  normalizeVersion,
  renderChangelog,
  renderGithubBody,
  renderReleaseTitle,
  renderWhatsNew,
} from '../scripts/build-release-notes.mjs';

test('every shipped version has notes with at least one item', () => {
  for (const entry of releaseNotes) {
    assert.ok(entry.version, 'entry is missing a version');
    assert.ok(entry.label, `${entry.version} is missing a label`);
    assert.ok(entry.notes.length > 0, `${entry.version} lists no changes`);
    for (const note of entry.notes) {
      assert.equal(typeof note, 'string');
      assert.ok(note.trim().length > 0, `${entry.version} has an empty note`);
    }
  }
});

test('versions are unique and ordered newest first', () => {
  const seen = new Set();
  for (const entry of releaseNotes) {
    assert.ok(!seen.has(entry.version), `duplicate entry for ${entry.version}`);
    seen.add(entry.version);
  }

  // Only compare well-formed semver entries; the oldest is the literal "0.0.x".
  const semver = releaseNotes.map((e) => e.version).filter((v) => /^\d+\.\d+\.\d+$/.test(v));
  const rank = (v) => v.split('.').map(Number).reduce((acc, part) => acc * 1000 + part, 0);
  for (let i = 1; i < semver.length; i += 1) {
    assert.ok(rank(semver[i - 1]) > rank(semver[i]), `${semver[i - 1]} should sort above ${semver[i]}`);
  }
});

test('the package version has a release-notes entry', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const entry = findEntry(releaseNotes, pkg.version);
  assert.ok(entry, `no release notes for package.json version ${pkg.version} — the release build would fail`);
});

test('normalizeVersion accepts tags, bare versions, and blanks', () => {
  assert.equal(normalizeVersion('v0.3.7-beta'), '0.3.7');
  assert.equal(normalizeVersion('refs/tags/v0.3.7-beta'), '0.3.7');
  assert.equal(normalizeVersion('0.3.7'), '0.3.7');
  assert.equal(normalizeVersion('v1.10.2-nightly'), '1.10.2');
  assert.equal(normalizeVersion(''), '');
  assert.equal(normalizeVersion(undefined), '');
});

test("the GitHub body leads with what's new, not with download links", () => {
  const entry = findEntry(releaseNotes, '0.3.7');
  const body = renderGithubBody(entry);

  assert.ok(body.startsWith("## What's new in 0.3.7 — "), 'body should open with the changes');
  assert.ok(body.indexOf("## What's new") < body.indexOf('## Downloads'), 'changes must precede downloads');
  assert.ok(body.includes('## Downloads'), 'body still needs the download list');
  assert.ok(body.includes('## macOS first launch'), 'body still needs the macOS unsigned-app steps');
  for (const note of entry.notes) {
    assert.ok(body.includes(note), 'every note should reach the release page');
  }
});

test('renderWhatsNew bullets each note exactly once', () => {
  const entry = { version: '9.9.9', label: 'Test', date: 'Beta build', notes: ['First thing.', 'Second thing.'] };
  const rendered = renderWhatsNew(entry);
  assert.equal(rendered, "## What's new in 9.9.9 — Test\n\n- First thing.\n- Second thing.");
});

test('the release title carries the label, not just the tag', () => {
  const entry = findEntry(releaseNotes, '0.3.7');
  assert.equal(renderReleaseTitle('v0.3.7-beta', entry), 'v0.3.7-beta — One Score, One Grade Table');
  // A version with no label must still produce a usable title rather than "undefined".
  assert.equal(renderReleaseTitle('v9.9.9-beta', { version: '9.9.9', label: '', notes: [] }), 'v9.9.9-beta');
  assert.equal(renderReleaseTitle('v9.9.9-beta', undefined), 'v9.9.9-beta');
});

test('normalizeTag keeps the full tag but rejects non-tags', () => {
  assert.equal(normalizeTag('refs/tags/v0.3.7-beta'), 'v0.3.7-beta');
  assert.equal(normalizeTag('v0.3.7-beta'), 'v0.3.7-beta');
  assert.equal(normalizeTag('0.3.7'), '');
  assert.equal(normalizeTag(''), '');
});

test('the changelog covers every version in the same order', () => {
  const changelog = renderChangelog(releaseNotes);
  assert.ok(changelog.startsWith('# Changelog'));

  let cursor = 0;
  for (const entry of releaseNotes) {
    const heading = `## ${entry.version} — ${entry.label}`;
    const at = changelog.indexOf(heading, cursor);
    assert.ok(at >= 0, `changelog is missing or misorders ${entry.version}`);
    cursor = at;
  }
});
