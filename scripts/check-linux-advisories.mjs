#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Refuse to build for Linux while a Linux-only advisory is still open.
 *
 * The glib VariantStrIter unsoundness reaches RigMatch only through the GTK
 * stack, which Windows never compiles. That made it correct to ship 0.6.0 for
 * Windows and wrong to forget about it — so the reminder lives on the Linux
 * build itself rather than in someone's memory.
 *
 * It re-reads the lockfile every time instead of trusting the note: if glib has
 * moved to a fixed version, or a [patch.crates-io] has been added, this says so
 * and gets out of the way.
 *
 * See docs/advisory-glib-variantstriter.md for the full analysis.
 *
 * Usage:  node scripts/check-linux-advisories.mjs [--force]
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const forced = process.argv.includes('--force');
const NOTE = 'docs/advisory-glib-variantstriter.md';

const lockPath = join(root, 'rigmatch-chat/src-tauri/Cargo.lock');
if (!existsSync(lockPath)) {
  console.log('No Tauri lockfile — nothing to check.');
  process.exit(0);
}
const lock = readFileSync(lockPath, 'utf-8');

/** The resolved version of a crate in the lockfile, if present. */
function lockedVersion(name) {
  const match = lock.match(new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"`));
  return match ? match[1] : null;
}

const compare = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};

const glib = lockedVersion('glib');
const gtk = lockedVersion('gtk');
const tauri = lockedVersion('tauri');

console.log('Linux advisory check');
console.log(`  glib  ${glib ?? '(absent)'}`);
console.log(`  gtk   ${gtk ?? '(absent)'}`);
console.log(`  tauri ${tauri ?? '(absent)'}\n`);

if (!glib) {
  console.log('glib is no longer in the lockfile — the advisory cannot apply. Delete');
  console.log(`${NOTE} and this check.`);
  process.exit(0);
}

// The fix landed in 0.20.0.
if (compare(glib, '0.20.0') >= 0) {
  console.log(`glib is ${glib}, which carries the VariantStrIter fix.`);
  console.log(`The advisory is resolved: delete ${NOTE} and drop this check from`);
  console.log('the linux build scripts.');
  process.exit(0);
}

// A local patch is the other legitimate way out.
const manifest = join(root, 'rigmatch-chat/src-tauri/Cargo.toml');
const patched = existsSync(manifest)
  && /\[patch\.crates-io\][\s\S]*?\bglib\b/.test(readFileSync(manifest, 'utf-8'));
if (patched) {
  console.log(`glib is ${glib} but Cargo.toml carries a [patch.crates-io] entry for it.`);
  console.log('Confirm the patch actually contains the &p -> &mut p fix, then proceed.');
  process.exit(0);
}

console.error(`glib ${glib} is affected by the VariantStrIter unsoundness (fixed in 0.20.0),`);
console.error('and this is a LINUX build — the GTK stack that pulls glib in is compiled here,');
console.error('unlike on Windows where it is absent entirely.\n');
console.error(`Read ${NOTE}. It records why this was accepted for Windows and what the`);
console.error('two ways out are: patch glib locally, or re-check whether gtk3-rs has moved\n');
console.error('past 0.18.2 (it was frozen there as of December 2024).\n');
console.error('If you have decided to ship anyway, run the build with:');
console.error('  npm run dist:linux -- --force        (or set RIGMATCH_ALLOW_ADVISORIES=1)');

if (forced || process.env.RIGMATCH_ALLOW_ADVISORIES === '1') {
  console.error('\n--force given: continuing with the advisory open.');
  process.exit(0);
}
process.exit(1);
