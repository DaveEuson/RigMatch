#!/usr/bin/env node

// Merge the two Mac update manifests into the single latest-mac.yml that
// electron-updater actually requests.
//
// Both Mac runners emit a file named latest-mac.yml, so they overwrite each
// other when the release job merges artifacts — leaving a manifest listing only
// arm64. MacUpdater.filterFilesForArch then does
//   files.filter(file => !isArm64File(file))
// on an Intel Mac, which returns an empty list, so the update fails outright.
//
// The fix is NOT arch-specific manifest names: electron-updater asks for exactly
// "latest-mac.yml" (Provider.getChannelFilePrefix returns "-mac" for darwin with
// no arch suffix) and filters the file list by architecture itself. So one
// manifest must list every Mac artifact, both arches.
//
// Each build stages its manifest as latest-mac-<artifact>.yml; this merges them.
//
//   node scripts/merge-mac-manifest.mjs release
//
// Dependency-free on purpose: the release job has no node_modules installed.

import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Minimal reader for the electron-builder update manifest shape:
 *
 *   version: 0.3.8
 *   files:
 *     - url: Foo.zip
 *       sha512: ...
 *       size: 123
 *   path: Foo.zip
 *   sha512: ...
 *   releaseDate: '...'
 *
 * Deliberately not a general YAML parser — it only needs to round-trip a file
 * this repo's own build produced minutes earlier.
 */
export function parseManifest(text) {
  const manifest = { version: '', files: [], path: '', sha512: '', releaseDate: '' };
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let inFiles = false;
  let current = null;

  const unquote = (value) => value.trim().replace(/^['"]|['"]$/g, '');

  for (const line of lines) {
    if (!line.trim()) continue;

    if (/^files:\s*$/.test(line)) { inFiles = true; continue; }

    // A new top-level key ends the files block.
    if (/^[a-zA-Z]/.test(line)) {
      inFiles = false;
      current = null;
      const match = line.match(/^([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/);
      if (match) {
        const [, key, raw] = match;
        if (key in manifest && key !== 'files') manifest[key] = unquote(raw);
      }
      continue;
    }

    if (!inFiles) continue;

    const item = line.match(/^\s*-\s*([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/);
    if (item) {
      current = {};
      manifest.files.push(current);
      current[item[1]] = unquote(item[2]);
      continue;
    }
    const prop = line.match(/^\s+([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/);
    if (prop && current) current[prop[1]] = unquote(prop[2]);
  }

  return manifest;
}

// Values are emitted unquoted: `size` and `blockMapSize` must parse as numbers,
// and quoting a sha512 would change it.
export function renderManifest(manifest) {
  const out = [`version: ${manifest.version}`, 'files:'];
  for (const file of manifest.files) {
    out.push(`  - url: ${file.url}`);
    for (const key of Object.keys(file)) {
      if (key === 'url') continue;
      out.push(`    ${key}: ${file[key]}`);
    }
  }
  out.push(`path: ${manifest.path}`);
  out.push(`sha512: ${manifest.sha512}`);
  out.push(`releaseDate: '${manifest.releaseDate}'`);
  return `${out.join('\n')}\n`;
}

const isArm64 = (file) => (file.url || '').includes('arm64');

/**
 * One manifest listing every Mac artifact. arm64 files lead so that the legacy
 * top-level `path`/`sha512` keep pointing at the arm64 build exactly as they do
 * today; modern electron-updater reads `files` and filters by arch, which is
 * what makes Intel work again.
 *
 * Numbers must not be quoted — `size` is read as a number.
 */
export function mergeManifests(manifests) {
  const present = manifests.filter((m) => m && m.files?.length);
  if (!present.length) throw new Error('No Mac manifests to merge');

  const versions = [...new Set(present.map((m) => m.version))];
  if (versions.length > 1) {
    throw new Error(`Mac manifests disagree on version: ${versions.join(', ')} — refusing to publish a mixed update manifest`);
  }

  const files = [];
  const seen = new Set();
  for (const file of [...present.flatMap((m) => m.files.filter(isArm64)), ...present.flatMap((m) => m.files.filter((f) => !isArm64(f)))]) {
    if (seen.has(file.url)) continue;
    seen.add(file.url);
    files.push(file);
  }

  // Prefer the arm64 manifest's legacy fields; fall back to the first present.
  const primary = present.find((m) => m.files.some(isArm64)) ?? present[0];
  const releaseDate = present
    .map((m) => m.releaseDate)
    .filter(Boolean)
    .sort()
    .pop() ?? '';

  return { version: versions[0], files, path: primary.path, sha512: primary.sha512, releaseDate };
}

export function assertBothArches(merged) {
  const hasArm = merged.files.some(isArm64);
  const hasX64 = merged.files.some((f) => !isArm64(f));
  if (!hasArm || !hasX64) {
    throw new Error(
      `latest-mac.yml must list both architectures (arm64: ${hasArm}, x64: ${hasX64}).\n` +
        'An arch-incomplete manifest silently breaks auto-update for the missing one:\n' +
        'MacUpdater filters the file list by arch and finds nothing.',
    );
  }
  return true;
}

async function main() {
  const dir = process.argv[2] || 'release';
  const entries = await readdir(dir);
  const staged = entries.filter((name) => /^latest-mac-.+\.yml$/.test(name)).sort();

  if (!staged.length) {
    console.error(`No staged Mac manifests (latest-mac-*.yml) found in ${dir}/.`);
    process.exit(1);
  }

  const manifests = [];
  for (const name of staged) {
    manifests.push(parseManifest(await readFile(path.join(dir, name), 'utf8')));
    console.log(`  read ${name}`);
  }

  const merged = mergeManifests(manifests);
  assertBothArches(merged);

  await writeFile(path.join(dir, 'latest-mac.yml'), renderManifest(merged), 'utf8');
  for (const name of staged) await unlink(path.join(dir, name));

  console.log(`Wrote ${dir}/latest-mac.yml for ${merged.version} listing ${merged.files.length} files:`);
  for (const file of merged.files) console.log(`   ${file.url}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
