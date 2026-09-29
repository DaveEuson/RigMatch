#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Refuse a Linux build that needs a newer C library than the oldest system
 * RigMatch supports.
 *
 * A Linux binary asks for the glibc of the machine it was built on. Built on
 * Ubuntu 24.04, RigMatch Chat asked for glibc 2.39: RigMatch itself started on
 * Ubuntu 22.04 (2.35), Debian 12 (2.36), Linux Mint 21, Pop!_OS 22.04 or a
 * Jetson on JetPack 6, but Chat would not open, and nothing said so until the
 * AppImage catalog's test did. The builds now run on Ubuntu 22.04; this makes
 * the floor a checked number instead of an accident of which runner GitHub
 * calls "latest".
 *
 * Reads every ELF file's required symbol versions with objdump, which every
 * GitHub Ubuntu runner has.
 *
 * Usage:  node scripts/check-glibc-floor.mjs [dir ...]
 *         (default: release/*-unpacked and companions)
 */

import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Ubuntu 22.04's glibc. Raising it drops every system older than the new floor. */
export const GLIBC_FLOOR = '2.35';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The newest GLIBC_x.y a symbol table asks for, or null if it asks for none. */
export function newestGlibc(objdumpOutput) {
  let newest = null;
  for (const [, version] of objdumpOutput.matchAll(/GLIBC_(\d+(?:\.\d+)+)/g)) {
    if (!newest || compareVersions(version, newest) > 0) newest = version;
  }
  return newest;
}

function isElf(path) {
  const fd = openSync(path, 'r');
  try {
    const magic = Buffer.alloc(4);
    return readSync(fd, magic, 0, 4, 0) === 4 && magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  } finally {
    closeSync(fd);
  }
}

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile() && statSync(path).size > 0) yield path;
  }
}

function defaultDirs() {
  const release = join(root, 'release');
  const unpacked = existsSync(release)
    ? readdirSync(release).filter((name) => name.endsWith('-unpacked')).map((name) => join(release, name))
    : [];
  return [...unpacked, join(root, 'companions')].filter((dir) => existsSync(dir));
}

function main() {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : defaultDirs();
  if (!dirs.length) {
    console.error('No Linux build output found (release/*-unpacked, companions). Build first.');
    process.exit(1);
  }
  let checked = 0;
  const tooNew = [];
  for (const dir of dirs) {
    for (const path of files(dir)) {
      if (!isElf(path)) continue;
      let output;
      try {
        output = execFileSync('objdump', ['-T', path], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        continue; // Static or not a dynamic object: it asks the system for nothing.
      }
      checked += 1;
      const newest = newestGlibc(output);
      if (newest && compareVersions(newest, GLIBC_FLOOR) > 0) tooNew.push({ path: relative(root, path), newest });
    }
  }
  console.log(`glibc floor ${GLIBC_FLOOR}: checked ${checked} Linux binaries in ${dirs.map((d) => relative(root, d) || '.').join(', ')}`);
  if (tooNew.length) {
    for (const { path, newest } of tooNew) console.error(`  needs glibc ${newest}: ${path}`);
    console.error(`\n${tooNew.length} binary(ies) would not start on a system with glibc ${GLIBC_FLOOR}. Build on Ubuntu 22.04 (see release.yml).`);
    process.exit(1);
  }
  if (!checked) {
    console.error('Found no dynamic Linux binaries to check — is this the right folder?');
    process.exit(1);
  }
  console.log('Every binary runs on the floor.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
