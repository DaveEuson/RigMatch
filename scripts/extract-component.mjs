// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Move one top-level component out of App.tsx into its own file.
 *
 * Line-based, with both boundaries asserted before anything is written: a
 * previous attempt at string-surgery on this file swept an entire component
 * into the wrong place, and it was only caught because the result did not
 * compile. Nothing here trusts a pattern to find the end of a function.
 *
 * Imports are deliberately NOT guessed. The file is written with a placeholder
 * header, and `tsc -b` is then the authority on what is missing — the same
 * approach that found the dead subtree behind BenchmarkRun.
 *
 * Usage: node extract-component.mjs <Name> <startLine> <endLine>
 */

const [name, startArg, endArg] = process.argv.slice(2);
if (!name || !startArg || !endArg) throw new Error('usage: <Name> <startLine> <endLine>');
const start = Number(startArg);
const end = Number(endArg);

const appPath = 'src/App.tsx';
const outPath = `src/components/${name}.tsx`;
if (existsSync(outPath)) throw new Error(`${outPath} already exists`);

const lines = readFileSync(appPath, 'utf-8').split('\n');

// 1-indexed, inclusive. Assert both ends before touching anything.
const first = lines[start - 1];
const last = lines[end - 1];
if (!first.startsWith(`function ${name}(`)) {
  throw new Error(`line ${start} is "${first.slice(0, 60)}", expected "function ${name}("`);
}
if (last !== '}') throw new Error(`line ${end} is "${last}", expected a bare closing brace`);

const body = lines.slice(start - 1, end);

const header = `// EXTRACTION-IN-PROGRESS: imports resolved by tsc -b, see the commit message.
`;
writeFileSync(outPath, `${header}\nexport ${body.join('\n')}\n`);

// Remove from App.tsx, plus one trailing blank line if that is what follows.
const after = lines[end] === '' ? 1 : 0;
lines.splice(start - 1, end - start + 1 + after);
writeFileSync(appPath, lines.join('\n'));

console.log(`moved ${end - start + 1} lines to ${outPath}`);
console.log(`App.tsx is now ${lines.length} lines`);
console.log(`\nNext: add "import { ${name} } from './components/${name}';" to App.tsx,`);
console.log('then run tsc -b and add what it names.');
