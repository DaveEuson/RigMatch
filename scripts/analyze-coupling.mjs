#!/usr/bin/env node
/**
 * How expensive is it to move a component out of App.tsx?
 *
 * Size is not the answer — a 900-line component that only touches its props is
 * a clean cut, and a 200-line one that reaches into fifteen module-scope
 * helpers is not. This reports, per component, which identifiers it uses that
 * are declared elsewhere in the file, because each of those is either an import
 * to add or a helper to move with it.
 *
 * Usage:  node scripts/analyze-coupling.mjs [componentName]
 */

import { readFileSync } from 'node:fs';

const source = readFileSync('src/App.tsx', 'utf-8');
const lines = source.split('\n');
const only = process.argv[2];

/** Top-level declarations and the line span each occupies. */
function declarations() {
  const found = [];
  const pattern = /^(?:export\s+)?(?:async\s+)?(function|const|type|interface|class)\s+([A-Za-z_$][\w$]*)/;
  for (let i = 0; i < lines.length; i += 1) {
    const match = pattern.exec(lines[i]);
    if (match) found.push({ kind: match[1], name: match[2], start: i });
  }
  for (let i = 0; i < found.length; i += 1) {
    found[i].end = (i + 1 < found.length ? found[i + 1].start : lines.length) - 1;
    found[i].size = found[i].end - found[i].start + 1;
  }
  return found;
}

const decls = declarations();
const byName = new Map(decls.map((d) => [d.name, d]));

/** Identifiers imported at the top of the file — already portable. */
const imported = new Set();
for (const match of source.matchAll(/^import\s+(?:type\s+)?\{([^}]+)\}\s+from/gm)) {
  for (const part of match[1].split(',')) {
    const name = part.trim().split(/\s+as\s+/).pop().trim();
    if (name) imported.add(name);
  }
}
for (const match of source.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from/gm)) imported.add(match[1]);

const REACT_ETC = new Set(['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'Fragment']);

function analyze(decl) {
  const body = lines.slice(decl.start, decl.end + 1).join('\n');
  const used = new Set();
  for (const match of body.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) used.add(match[1]);

  const localHelpers = [];
  const importsNeeded = new Set();
  for (const name of used) {
    if (name === decl.name) continue;
    if (byName.has(name)) localHelpers.push(name);
    else if (imported.has(name) && !REACT_ETC.has(name)) importsNeeded.add(name);
  }
  return { localHelpers: [...new Set(localHelpers)].sort(), importsNeeded: [...importsNeeded].sort() };
}

const candidates = decls
  .filter((d) => d.kind === 'function' && /^[A-Z]/.test(d.name) && d.name !== 'App')
  .filter((d) => (only ? d.name === only : d.size >= 90))
  .sort((a, b) => b.size - a.size);

console.log(`App.tsx: ${lines.length} lines, ${decls.length} top-level declarations\n`);
console.log('Extraction cost per component — lower "in-file deps" is a cleaner cut:\n');

for (const decl of candidates) {
  const { localHelpers, importsNeeded } = analyze(decl);
  console.log(`${decl.name}  (${decl.size} lines, ${decl.start + 1}-${decl.end + 1})`);
  console.log(`   in-file deps: ${localHelpers.length}${localHelpers.length ? '  -> ' + localHelpers.slice(0, 10).join(', ') + (localHelpers.length > 10 ? ', …' : '') : ''}`);
  console.log(`   imports to carry: ${importsNeeded.length}\n`);
}
