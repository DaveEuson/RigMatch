// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * Why RigMatch Chat would not start on Linux, found before starting it.
 *
 * RigMatch Chat is a WebKitGTK app, and a system without WebKitGTK 4.1 cannot
 * load it. The loader's error went nowhere: the companion is launched detached
 * with its output ignored, so the Chat button did nothing and said nothing.
 * The 0.9.1 install smoke found it on stock Ubuntu. `ldd` names what is missing
 * without starting anything.
 */

// The Debian and Ubuntu packages that provide what RigMatch Chat links
// against beyond Electron's own needs. The .deb declares the same packages.
const DEBIAN_PACKAGES = {
  'libwebkit2gtk-4.1.so.0': 'libwebkit2gtk-4.1-0',
  'libjavascriptcoregtk-4.1.so.0': 'libjavascriptcoregtk-4.1-0',
  'libsoup-3.0.so.0': 'libsoup-3.0-0',
};

/** The libraries `ldd` could not find, in the order it listed them. */
function missingLibraries(lddOutput) {
  return [...String(lddOutput ?? '').matchAll(/^\s*(\S+)\s+=>\s+not found\s*$/gm)].map((m) => m[1]);
}

/** The packages that provide them, for the ones this file knows. */
function debianPackagesFor(libraries) {
  return [...new Set(libraries.map((library) => DEBIAN_PACKAGES[library]).filter(Boolean))];
}

module.exports = { missingLibraries, debianPackagesFor, DEBIAN_PACKAGES };
