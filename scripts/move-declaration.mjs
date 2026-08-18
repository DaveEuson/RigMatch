#!/usr/bin/env node
/**
 * Move a top-level declaration out of App.tsx and into a component file.
 *
 * Extraction strands the constants and helpers a component was the only caller
 * of. A single consumer does not justify a new lib module — the declaration
 * belongs beside the thing that uses it — so this carries it across rather than
 * leaving it behind or inventing a home for it.
 *
 * The span is found by counting brackets, not by matching a closing pattern:
 * `const X = [...]` ends on `];`, a function on `}`, and a one-liner on its own
 * line, and a single rule covers all three. Both ends are asserted before
 * anything is written, because a mis-cut here is silent — it compiles as long
 * as the halves happen to balance.
 *
 * Usage: node scripts/move-declaration.mjs <DeclName> <ComponentName>
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { scrubSource } from './scrub-source.mjs';

const [name, component] = process.argv.slice(2);
if (!name || !component) throw new Error('usage: <DeclName> <ComponentName>');

const appPath = 'src/App.tsx';
const targetPath = `src/components/${component}.tsx`;
if (!existsSync(targetPath)) throw new Error(`${targetPath} does not exist — extract the component first`);

const source = readFileSync(appPath, 'utf-8');
const lines = source.split('\n');
// Scrubbed once for the whole file, not per line: a block comment or template
// literal spanning lines cannot be read one line at a time. Newlines survive
// scrubbing, so these indices match `lines` exactly.
const codeLines = scrubSource(source).split('\n');
if (codeLines.length !== lines.length) throw new Error('scrubbing changed the line count');

const declPattern = new RegExp(`^(?:export\\s+)?(?:const|let|type|interface|function|class)\\s+${name}\\b`);
const start = lines.findIndex((line) => declPattern.test(line));
if (start === -1) throw new Error(`no top-level declaration of ${name} in ${appPath}`);

function netDepth(code) {
  let depth = 0;
  for (const character of code) {
    if ('{[('.includes(character)) depth += 1;
    if ('}])'.includes(character)) depth -= 1;
  }
  return depth;
}

let depth = 0;
let end = -1;
for (let i = start; i < lines.length; i += 1) {
  depth += netDepth(codeLines[i]);
  if (depth === 0) { end = i; break; }
  if (i - start > 400) break;
}
if (end === -1) throw new Error(`could not find where ${name} ends — brackets never balanced`);

const block = lines.slice(start, end + 1);
if (!declPattern.test(block[0])) throw new Error('start boundary moved underfoot');
if (!/[};)\]]\s*;?\s*$/.test(block[block.length - 1])) {
  throw new Error(`end boundary looks wrong: ${JSON.stringify(block[block.length - 1])}`);
}

// Remove from App.tsx, and any blank line left dangling above it.
let cutFrom = start;
while (cutFrom > 0 && lines[cutFrom - 1].trim() === '') cutFrom -= 1;
const remaining = [...lines.slice(0, cutFrom), ...lines.slice(end + 1)];
writeFileSync(appPath, remaining.join('\n'));

// Insert after the target's import block, so the file still reads imports-first.
const targetLines = readFileSync(targetPath, 'utf-8').split('\n');
let insertAt = 0;
for (let i = 0; i < targetLines.length; i += 1) {
  if (/^import\b/.test(targetLines[i]) || /from\s*'[^']*';\s*$/.test(targetLines[i])) insertAt = i + 1;
}
const note = `/** Moved out of App.tsx with ${component}, its only consumer. */`;
targetLines.splice(insertAt, 0, '', note, ...block);
writeFileSync(targetPath, targetLines.join('\n'));

console.log(`moved ${name} (${block.length} line(s), App.tsx:${start + 1}-${end + 1}) into ${targetPath}`);
