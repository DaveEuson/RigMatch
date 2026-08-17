import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Give an extracted component the imports it needs, by asking the compiler
 * which names are missing and App.tsx where each one came from.
 *
 * Guessing the import list by reading the code is how you end up importing
 * from the wrong module or missing a type-only import. tsc knows the names;
 * App.tsx knows the sources. Neither has to be inferred.
 *
 * Usage: node resolve-imports.mjs <ComponentName>
 */

const name = process.argv[2];
if (!name) throw new Error('usage: <ComponentName>');
const target = `src/components/${name}.tsx`;

/** Every "Cannot find name 'X'" the compiler reports for the target file. */
function missingNames() {
  let output = '';
  try {
    execSync('npx tsc -b', { encoding: 'utf-8', stdio: 'pipe' });
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const names = new Set();
  const escaped = target.replace(/[/\\]/g, '[/\\\\]');
  const pattern = new RegExp(`${escaped}\\(\\d+,\\d+\\): error TS2304: Cannot find name '([^']+)'`, 'g');
  for (const match of output.matchAll(pattern)) names.add(match[1]);
  // TS2552 ("did you mean") and TS2749 (value used as type) name things too.
  const alt = new RegExp(`${escaped}\\(\\d+,\\d+\\): error TS(?:2552|2749|2503): [^']*'([^']+)'`, 'g');
  for (const match of output.matchAll(alt)) names.add(match[1]);
  return [...names];
}

/** Where App.tsx imports a given name from, and whether it is type-only. */
function sourceOf(appSource, wanted) {
  const blocks = [...appSource.matchAll(/^import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+'([^']+)';/gm)];
  for (const [, typeOnly, names, from] of blocks) {
    for (const raw of names.split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const local = part.split(/\s+as\s+/).pop().trim().replace(/^type\s+/, '');
      if (local === wanted) {
        return { from, typeOnly: Boolean(typeOnly) || /^type\s/.test(part), spec: part };
      }
    }
  }
  const def = appSource.match(new RegExp(`^import\\s+${wanted}\\s+from\\s+'([^']+)';`, 'm'));
  if (def) return { from: def[1], default: true };
  return null;
}

const app = readFileSync('src/App.tsx', 'utf-8');
const missing = missingNames();
console.log(`${missing.length} unresolved name(s) in ${name}.tsx`);

const byModule = new Map();
const unresolved = [];
for (const wanted of missing) {
  const found = sourceOf(app, wanted);
  if (!found) { unresolved.push(wanted); continue; }
  // Paths shift one level deeper moving into components/.
  const from = found.from.startsWith('./') && !found.from.startsWith('./components/')
    ? found.from.replace('./', '../')
    : found.from.startsWith('./components/') ? found.from.replace('./components/', './') : found.from;
  const key = `${from}|${found.typeOnly ? 'type' : 'value'}|${found.default ? 'default' : 'named'}`;
  if (!byModule.has(key)) byModule.set(key, { from, typeOnly: found.typeOnly, isDefault: found.default, names: [] });
  byModule.get(key).names.push(found.default ? wanted : (found.spec ?? wanted));
}

const lines = [];
for (const entry of [...byModule.values()].sort((a, b) => a.from.localeCompare(b.from))) {
  if (entry.isDefault) {
    for (const n of entry.names) lines.push(`import ${n} from '${entry.from}';`);
  } else {
    // Strip a per-name `type` modifier: inside `import type { ... }` it is
    // both redundant and a compile error.
    const cleaned = entry.names.map((n) => (entry.typeOnly ? n.replace(/^type\s+/, '') : n));
    const list = [...new Set(cleaned)].sort().join(', ');
    lines.push(`import ${entry.typeOnly ? 'type ' : ''}{ ${list} } from '${entry.from}';`);
  }
}

if (unresolved.length) {
  console.log(`\nNOT found in App.tsx's imports — these are declared IN App.tsx and must move or be exported:`);
  for (const n of unresolved) console.log(`   ${n}`);
}

const source = readFileSync(target, 'utf-8');
const header = '// EXTRACTION-IN-PROGRESS: imports resolved by tsc -b, see the commit message.\n';
// On a second pass the placeholder is already gone, and replace() would then
// silently write nothing while still reporting success — so prepend instead.
// That exact false green cost a debugging round: "wrote 2 import lines" while
// the file kept failing on the two names those lines were meant to supply.
const written = source.includes(header)
  ? source.replace(header, `${lines.join('\n')}\n`)
  : `${lines.join('\n')}\n${source}`;
writeFileSync(target, written);
console.log(`\nwrote ${lines.length} import line(s) into ${target}${source.includes(header) ? '' : ' (prepended)'}`);
