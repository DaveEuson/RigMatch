// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEBIAN_PACKAGES } = require('../electron/companionLibraries.cjs');
const FpmTarget = require('app-builder-lib/out/targets/FpmTarget').default;

/**
 * The Linux packages have to open on a stock Ubuntu 22.04 or 24.04. Two did
 * not, and the AppImage catalog test and the 0.9.1 install smoke found them:
 * the .deb did not ask for RigMatch Chat's WebKitGTK libraries, and the
 * AppImage used the old runtime, which needs libfuse2 that those systems no
 * longer install.
 */
const build = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).build;

test('the .deb asks for every library RigMatch Chat needs', () => {
  const depends = build.deb?.depends ?? [];
  for (const pkg of Object.values(DEBIAN_PACKAGES)) assert.ok(depends.includes(pkg), `deb.depends is missing ${pkg}`);
});

test('the .deb still asks for everything Electron needs', () => {
  // A depends list replaces electron-builder's defaults rather than adding
  // to them. If electron-builder adds a default, this names it.
  const defaults = FpmTarget.prototype.getDefaultDepends.call(null, 'deb');
  assert.ok(defaults.length > 0, 'could not read electron-builder\'s default .deb dependencies');
  for (const pkg of defaults) assert.ok(build.deb.depends.includes(pkg), `deb.depends dropped electron-builder's default ${pkg}`);
});

test('the AppImage uses the runtime that needs no libfuse2', () => {
  // "0.0.0", or no setting, is the old runtime.
  assert.match(build.toolsets?.appimage ?? '0.0.0', /^[1-9]\d*\./);
});

test('the install smoke opens the AppImage the way a double-click does', () => {
  // Extracting an AppImage needs no FUSE, so extracting it proved nothing.
  const smoke = readFileSync(new URL('../.github/workflows/post-release-install-smoke.yml', import.meta.url), 'utf-8');
  assert.match(smoke, /for pkg in libfuse2 libfuse2t64; do/);
  assert.match(smoke, /"\$APPIMAGE" --appimage-mount/);
});
