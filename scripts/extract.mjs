#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Move one component out of App.tsx, end to end.
 *
 * Wraps the four steps that were being run by hand: cut the lines, wire the
 * import, let tsc name the imports the new file needs, then let tsc name the
 * ones App.tsx no longer does. Every step defers to the compiler rather than
 * to a guess about what the code uses.
 *
 * It finds the component's own boundaries and asserts them, so a mistyped span
 * fails before anything is written — string-surgery on this file has silently
 * moved the wrong lines before.
 *
 * Usage:  node scripts/extract.mjs <ComponentName>
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const name = process.argv[2];
if (!name) throw new Error('usage: node scripts/extract.mjs <ComponentName>');

const appPath = 'src/App.tsx';
const outPath = `src/components/${name}.tsx`;
if (existsSync(outPath)) throw new Error(`${outPath} already exists`);

const run = (args) => execFileSync('node', args, { encoding: 'utf-8', stdio: 'pipe' });

// --- boundaries -------------------------------------------------------------
const lines = readFileSync(appPath, 'utf-8').split('\n');
const start = lines.findIndex((line) => line.startsWith(`function ${name}(`));
if (start === -1) throw new Error(`no top-level "function ${name}(" in App.tsx`);
let end = -1;
for (let i = start; i < lines.length; i += 1) {
  if (lines[i] === '}') { end = i; break; }
}
if (end === -1) throw new Error(`could not find the end of ${name}`);
console.log(`${name}: lines ${start + 1}-${end + 1} (${end - start + 1})`);

console.log(run(['scripts/extract-component.mjs', name, String(start + 1), String(end + 1)]).trim().split('\n')[0]);

// --- wire the import --------------------------------------------------------
{
  const app = readFileSync(appPath, 'utf-8');
  const anchor = "import { RunWarningModal } from './components/RunWarningModal';";
  if (!app.includes(anchor)) throw new Error('import anchor missing from App.tsx');
  writeFileSync(appPath, app.replace(anchor, `${anchor}\nimport { ${name} } from './components/${name}';`));
}

// --- imports in, imports out ------------------------------------------------
const resolved = run(['scripts/resolve-imports.mjs', name]);
console.log(resolved.trim().split('\n').filter(Boolean).join('\n'));
console.log(run(['scripts/prune-imports.mjs']).trim());

// --- did it work? -----------------------------------------------------------
let errors = '';
try {
  execFileSync('npx', ['tsc', '-b'], { encoding: 'utf-8', stdio: 'pipe', shell: true });
} catch (error) {
  errors = `${error.stdout ?? ''}${error.stderr ?? ''}`;
}
const remaining = errors.split('\n').filter((line) => /error TS/.test(line));
console.log(remaining.length === 0
  ? `\n${name} extracted cleanly. App.tsx is now ${readFileSync(appPath, 'utf-8').split('\n').length} lines.`
  : `\n${remaining.length} error(s) left for a human:\n${remaining.slice(0, 8).join('\n')}`);
process.exitCode = remaining.length === 0 ? 0 : 1;
