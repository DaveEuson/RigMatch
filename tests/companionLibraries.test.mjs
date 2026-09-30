// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { companionLaunchMessage } from '../src/lib/companionLaunch.ts';

const require = createRequire(import.meta.url);
const { missingLibraries, debianPackagesFor } = require('../electron/companionLibraries.cjs');

/**
 * On a Linux system without WebKitGTK 4.1, the Chat button did nothing and
 * said nothing: the companion could not load, and its launch was detached with
 * the loader's error thrown away. The 0.9.1 install smoke found it on every
 * stock Ubuntu runner. The fixture is that run's ldd output, trimmed.
 */
const LDD_ON_STOCK_UBUNTU = [
  '\tlinux-vdso.so.1 (0x00007ffd3a5f2000)',
  '\tlibssl.so.3 => /lib/x86_64-linux-gnu/libssl.so.3 (0x00007f356555c000)',
  '\tlibdbus-1.so.3 => /lib/x86_64-linux-gnu/libdbus-1.so.3 (0x00007f3564cef000)',
  '\tlibwebkit2gtk-4.1.so.0 => not found',
  '\tlibgtk-3.so.0 => /lib/x86_64-linux-gnu/libgtk-3.so.0 (0x00007f3564400000)',
  '\tlibsoup-3.0.so.0 => not found',
  '\tlibgio-2.0.so.0 => /lib/x86_64-linux-gnu/libgio-2.0.so.0 (0x00007f3564225000)',
  '\tlibjavascriptcoregtk-4.1.so.0 => not found',
  '\tlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f3563e00000)',
  '\t/lib64/ld-linux-x86-64.so.2 (0x00007f3565f78000)',
].join('\n');

test('ldd output names exactly the libraries that are missing', () => {
  assert.deepEqual(missingLibraries(LDD_ON_STOCK_UBUNTU), [
    'libwebkit2gtk-4.1.so.0',
    'libsoup-3.0.so.0',
    'libjavascriptcoregtk-4.1.so.0',
  ]);
  assert.deepEqual(missingLibraries(LDD_ON_STOCK_UBUNTU.replace(/ => not found/g, ' => /usr/lib/x.so')), []);
  // No ldd, or no output from it: nothing to report, and Chat launches as before.
  for (const empty of ['', undefined, null]) assert.deepEqual(missingLibraries(empty), []);
});

test('each missing library maps to the package that provides it', () => {
  assert.deepEqual(debianPackagesFor(missingLibraries(LDD_ON_STOCK_UBUNTU)), [
    'libwebkit2gtk-4.1-0',
    'libsoup-3.0-0',
    'libjavascriptcoregtk-4.1-0',
  ]);
  assert.deepEqual(debianPackagesFor(['libwebkit2gtk-4.1.so.0', 'libunknown.so.9']), ['libwebkit2gtk-4.1-0']);
});

test('the message names what is missing and the command that fixes it', () => {
  const libraries = missingLibraries(LDD_ON_STOCK_UBUNTU);
  const message = companionLaunchMessage({ ok: false, reason: 'missing-libraries', libraries, packages: debianPackagesFor(libraries) });
  for (const library of libraries) assert.match(message, new RegExp(library.replace(/\./g, '\\.')));
  assert.match(message, /sudo apt install libwebkit2gtk-4\.1-0 libsoup-3\.0-0 libjavascriptcoregtk-4\.1-0/);
  // It is not a missing companion: the file is right where it should be.
  assert.doesNotMatch(message, /not found|tauri build/i);
});

test('without apt it names the libraries and no command', () => {
  const message = companionLaunchMessage({ ok: false, reason: 'missing-libraries', libraries: ['libwebkit2gtk-4.1.so.0'], packages: [] });
  assert.match(message, /libwebkit2gtk-4\.1\.so\.0/);
  assert.match(message, /WebKitGTK 4\.1/);
  assert.doesNotMatch(message, /sudo|apt/);
});

test('Linux checks the libraries before it starts Chat', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');
  const handler = main.slice(main.indexOf("ipcMain.handle('app:openChatApp'"), main.indexOf('async function companionMissingLibraries'));
  const check = handler.indexOf('await companionMissingLibraries(candidate, cleanEnv)');
  assert.ok(check > 0, 'the Chat launch no longer checks for missing libraries');
  assert.ok(check < handler.indexOf('spawn(candidate'), 'Chat starts before its libraries are checked');
  assert.match(handler, /return \{ ok: false, reason: 'missing-libraries', libraries, packages \}/);
});
