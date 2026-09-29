// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GLIBC_FLOOR, compareVersions, newestGlibc } from '../scripts/check-glibc-floor.mjs';

/**
 * Built on Ubuntu 24.04, RigMatch Chat needed glibc 2.39 and would not open on
 * Ubuntu 22.04, Debian 12 or JetPack 6. The Linux builds moved to 22.04 and a
 * check after the build holds the floor; these pin both halves.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');

test('the newest glibc a binary asks for is read from its symbol table', () => {
  // Trimmed `objdump -T` output from the 0.9.0 RigMatch Chat built on 24.04.
  const objdump = [
    '0000000000000000      DF *UND*  0000000000000000 (GLIBC_2.2.5) free',
    '0000000000000000      DF *UND*  0000000000000000 (GLIBC_2.34) __libc_start_main',
    '0000000000000000      DF *UND*  0000000000000000 (GLIBC_2.39) pidfd_spawnp',
    '0000000000000000      DF *UND*  0000000000000000 (GLIBC_2.17) clock_gettime',
  ].join('\n');
  assert.equal(newestGlibc(objdump), '2.39');
  assert.equal(newestGlibc('0000 DF *UND* (GCC_3.0) _Unwind_Resume'), null, 'not every versioned symbol is glibc');
});

test('versions compare as numbers, not text', () => {
  assert.ok(compareVersions('2.39', '2.35') > 0);
  assert.ok(compareVersions('2.4', '2.35') < 0, '2.4 is older than 2.35, though it sorts after it as text');
  assert.equal(compareVersions('2.35', '2.35.0'), 0);
  assert.ok(compareVersions('2.2.5', '2.35') < 0);
});

test('the floor is Ubuntu 22.04, and both Linux builds run on it', () => {
  assert.equal(GLIBC_FLOOR, '2.35');
  const release = read('../.github/workflows/release.yml');
  assert.match(release, /- os: ubuntu-22\.04\n\s+platform: linux\n\s+artifact: linux-x64/);
  assert.match(release, /- os: ubuntu-22\.04-arm\n\s+platform: linux\n\s+artifact: linux-arm64/);
  assert.doesNotMatch(release, /- os: ubuntu-(?:latest|24\.04[^\n]*)\n\s+platform: linux/, 'a Linux build is back on a newer Ubuntu');
  assert.match(release, /run: node scripts\/check-glibc-floor\.mjs/);
});

test('the install smoke checks the oldest supported Ubuntu actually loads the binaries', () => {
  const smoke = read('../.github/workflows/post-release-install-smoke.yml');
  assert.match(smoke, /- os: ubuntu-22\.04\n/);
  assert.match(smoke, /- os: ubuntu-22\.04-arm\n/);
  assert.match(smoke, /if grep -q "not found" <<<"\$out"; then missing=1; fi/);
});
