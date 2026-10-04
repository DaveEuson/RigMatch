#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Classes a stylesheet defines that no source file can produce.
 *
 * The redesign left 5,500 lines of App.css styling elements nothing rendered
 * any more; tests/noOrphanCss.test.mjs runs this so it cannot build up again.
 * A class is live when its name appears as a token in the code (strings, JSX,
 * templates; comments do not count), when a template builds it from a prefix
 * (`grade-${tone}`), or when a library renders it (lucide's icons).
 *
 * To remove what it finds: node scripts/prune-orphan-css.mjs <file.css> <class...>
 *
 * Usage: node scripts/find-orphan-css.mjs [dir]   (default: src)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out); else out.push(path);
  }
  return out;
};

const code = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const LIBRARY_CLASSES = [/^lucide/];

/** { 'path/to/file.css': ['dead-class', ...] } for every stylesheet under `dir`. */
export function findOrphanClasses(dir, extraSources = []) {
  const files = walk(dir);
  const sources = [...files.filter((f) => /\.(tsx?|jsx?|html)$/.test(f)), ...extraSources];
  const source = sources.map((f) => code(readFileSync(f, 'utf8'))).join('\n');
  const tokens = new Set(source.match(/[A-Za-z_][\w-]*/g));
  const prefixes = [
    ...[...source.matchAll(/([A-Za-z_][\w-]*-)\$\{/g)].map((m) => m[1]),
    ...[...source.matchAll(/['"`]([A-Za-z_][\w-]*-)['"`]\s*\+/g)].map((m) => m[1]),
  ];
  const report = {};
  for (const file of files.filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/url\([^)]*\)/g, 'url()')
      .replace(/"[^"]*"|'[^']*'/g, '""');
    const classes = new Set();
    for (const [, prelude] of css.matchAll(/([^{}]+)\{/g)) {
      if (/^\s*@/.test(prelude)) continue;
      for (const [, name] of prelude.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) classes.add(name);
    }
    const dead = [...classes].filter((name) => !tokens.has(name)
      && !prefixes.some((p) => name.startsWith(p))
      && !LIBRARY_CLASSES.some((re) => re.test(name)));
    if (dead.length) report[relative(process.cwd(), file).replace(/\\/g, '/')] = dead.sort();
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'src';
  const extra = dir === 'src' ? ['index.html'] : [];
  const report = findOrphanClasses(dir, extra);
  for (const [file, dead] of Object.entries(report)) console.log(`${file}: ${dead.join(' ')}`);
  console.log(Object.keys(report).length ? '' : 'No stylesheet defines a class nothing renders.');
  process.exit(Object.keys(report).length ? 1 : 0);
}
