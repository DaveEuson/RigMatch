#!/usr/bin/env node
/**
 * Remove imports App.tsx no longer uses after a component moves out.
 *
 * tsc names them precisely, so nothing is guessed. It re-runs until clean,
 * because removing a line shifts every line number after it.
 *
 * THE RULE THAT MATTERS: only ever edit a line that is part of an import
 * statement. Not every "declared but never used" is an import — extracting a
 * component also orphans the helpers only it called, and tsc then points at
 * their `function Name(` declarations. An earlier version of this script
 * happily applied its regex there and stripped the names off two function
 * declarations, leaving `function({` behind. Silent, syntactically broken, and
 * only caught because the next extraction failed to compile.
 *
 * An orphaned declaration is a finding, not a thing to delete: it usually means
 * that component should be extracted next, alongside the one that used it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const path = 'src/App.tsx';

function unusedInApp() {
  let output = '';
  try {
    execSync('npx tsc -b', { encoding: 'utf-8', stdio: 'pipe' });
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  // TS6133 unused value, TS6196 unused type, TS6192 a whole import unused.
  const single = [...output.matchAll(/src[/\\]App\.tsx\((\d+),(\d+)\): error TS6(?:133|196): '([^']+)' is declared but (?:its value is )?never (?:read|used)/g)]
    .map((m) => ({ line: Number(m[1]), name: m[3], whole: false }));
  const whole = [...output.matchAll(/src[/\\]App\.tsx\((\d+),(\d+)\): error TS6192: All imports in import declaration are unused/g)]
    .map((m) => ({ line: Number(m[1]), name: null, whole: true }));
  return [...single, ...whole];
}

/**
 * Is this line inside an import statement? Imports here span several lines, so
 * a bare name on its own line has to be judged by what encloses it.
 */
function insideImport(lines, index) {
  const line = lines[index];
  if (/^\s*import\b/.test(line)) return true;
  for (let i = index; i >= 0 && index - i < 60; i -= 1) {
    if (/^\s*import\b/.test(lines[i])) {
      // An import that has not closed before reaching our line still encloses it.
      const between = lines.slice(i, index + 1).join('\n');
      const closed = /}\s*from\s*'[^']*';/.test(between.slice(0, between.length - line.length));
      return !closed;
    }
    if (/^\s*(export\s+)?(function|const|class|type|interface)\b/.test(lines[i])) return false;
  }
  return false;
}

const skipped = [];

for (let round = 1; round <= 8; round += 1) {
  const unused = unusedInApp();
  if (unused.length === 0) { console.log(`clean after ${round - 1} round(s)`); break; }

  const lines = readFileSync(path, 'utf-8').split('\n');
  const removed = [];
  // Bottom-up so earlier line numbers stay valid.
  for (const { line, name, whole } of [...unused].sort((a, b) => b.line - a.line)) {
    const text = lines[line - 1];
    if (text === undefined) continue;

    if (!insideImport(lines, line - 1)) {
      // Not an import. Report it and leave it exactly as it is.
      skipped.push(`${name ?? '(import)'} at line ${line}: ${text.trim().slice(0, 60)}`);
      continue;
    }

    if (whole) {
      lines.splice(line - 1, 1);
      removed.push('(whole import)');
      continue;
    }
    // A default import IS the whole statement — `import name from '...'`.
    // Stripping just the name leaves `import from '...'`, which is a syntax
    // error the next extraction inherits.
    if (new RegExp(`^\\s*import\\s+${name}\\s+from\\s`).test(text)) {
      lines.splice(line - 1, 1);
      removed.push(`${name} (default)`);
      continue;
    }
    if (new RegExp(`^\\s*(?:type\\s+)?${name},?\\s*$`).test(text)) {
      lines.splice(line - 1, 1);
      removed.push(name);
    } else if (text.includes(`${name},`)) {
      lines[line - 1] = text.replace(new RegExp(`\\b(?:type\\s+)?${name},\\s*`), '');
      removed.push(name);
    } else {
      lines[line - 1] = text.replace(new RegExp(`,?\\s*\\b(?:type\\s+)?${name}\\b`), '');
      removed.push(name);
    }
  }

  if (removed.length === 0) {
    console.log(`round ${round}: nothing left that is safe to touch`);
    break;
  }
  writeFileSync(path, lines.join('\n'));
  console.log(`round ${round}: removed ${removed.length} — ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? ', …' : ''}`);
}

if (skipped.length) {
  console.log('\nLeft alone (not imports — probably wants extracting next):');
  for (const entry of [...new Set(skipped)]) console.log(`   ${entry}`);
}
