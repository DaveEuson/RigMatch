#!/usr/bin/env node
/**
 * Remove imports App.tsx no longer uses after a component moves out.
 *
 * tsc names them precisely, so nothing is guessed, and it re-runs until clean
 * because every removal shifts the line numbers after it.
 *
 * Two rules, both learned by breaking App.tsx and rolling it back:
 *
 * 1. ONLY EDIT IMPORTS. Extracting a component also orphans the helpers only
 *    it called, and tsc then points at their `function Name(` declarations. An
 *    earlier version applied its regex there and stripped the names off two
 *    declarations, leaving `function({` — silent, broken, and caught only
 *    because the next extraction failed to compile. Orphaned declarations are
 *    reported instead: they usually want extracting next, not deleting.
 *
 * 2. AN IMPORT IS A STATEMENT, NOT A LINE. They span many lines here. Removing
 *    just the reported line left `import from './x'` for a default import, and
 *    for a wholly-unused multi-line import it deleted the `import {` and left
 *    the body behind as loose identifiers. So statements are parsed first, and
 *    every edit is expressed against a statement's full span.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const path = 'src/App.tsx';

function diagnostics() {
  let output = '';
  try {
    execSync('npx tsc -b', { encoding: 'utf-8', stdio: 'pipe' });
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const named = [...output.matchAll(/src[/\\]App\.tsx\((\d+),\d+\): error TS6(?:133|196): '([^']+)' is declared but (?:its value is )?never (?:read|used)/g)]
    .map((m) => ({ line: Number(m[1]), name: m[2], whole: false }));
  const whole = [...output.matchAll(/src[/\\]App\.tsx\((\d+),\d+\): error TS6192: All imports in import declaration are unused/g)]
    .map((m) => ({ line: Number(m[1]), name: null, whole: true }));
  return [...named, ...whole];
}

/** Every import statement in the file, with the full line span it occupies. */
function importStatements(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*import\b/.test(lines[i])) continue;
    let end = i;
    // A statement ends at the line carrying its `from '...';` (or its own `;`).
    while (end < lines.length && !/from\s*'[^']*';\s*$/.test(lines[end]) && !/^\s*import\s*'[^']*';\s*$/.test(lines[end])) {
      end += 1;
      if (end - i > 200) break;
    }
    found.push({ start: i, end });
    i = end;
  }
  return found;
}

/**
 * Delete `import { } from './x';` husks.
 *
 * Removing names one at a time eventually empties the brace list, and at that
 * point tsc goes quiet: an empty named-import list is a legal side-effect
 * import, so there is no unused name left to report and no TS6192 either. The
 * pruner therefore stopped one step short and left 25 of these behind across
 * the 0.7 extractions before anyone looked.
 *
 * Bare `import './x';` is a real side-effect import and is left alone — only
 * the empty-braces form, which nothing writes on purpose, is removed.
 */
function dropEmptyImports() {
  const lines = readFileSync(path, 'utf-8').split('\n');
  const kept = [];
  const dropped = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const husk = line.match(/^\s*import\s*\{\s*\}\s*from\s*'([^']+)';\s*$/);
    if (husk) { dropped.push(husk[1]); continue; }
    // The multi-line form too: emptying `import {\n  Name,\n} from '...';` of
    // its one name leaves `import {` and `} from '...';` straddling two lines,
    // which the single-line pattern above walks straight past.
    const openHusk = /^\s*import\s*\{\s*$/.test(line)
      && /^\s*\}\s*from\s*'([^']+)';\s*$/.exec(lines[i + 1] ?? '');
    if (openHusk) { dropped.push(openHusk[1]); i += 1; continue; }
    kept.push(line);
  }
  if (dropped.length) {
    writeFileSync(path, kept.join('\n'));
    console.log(`removed ${dropped.length} empty import husk(s): ${dropped.join(', ')}`);
  }
  return dropped.length;
}

const skipped = [];

for (let round = 1; round <= 8; round += 1) {
  const reported = diagnostics();
  if (reported.length === 0) { console.log(`clean after ${round - 1} round(s)`); break; }

  const lines = readFileSync(path, 'utf-8').split('\n');
  const statements = importStatements(lines);
  const owning = (lineNumber) => statements.find((s) => lineNumber - 1 >= s.start && lineNumber - 1 <= s.end);

  const removed = [];
  const wholeSpans = [];
  // Bottom-up so earlier line numbers stay valid as we edit.
  for (const { line, name, whole } of [...reported].sort((a, b) => b.line - a.line)) {
    const statement = owning(line);
    if (!statement) {
      skipped.push(`${name ?? '(import)'} at line ${line}: ${(lines[line - 1] ?? '').trim().slice(0, 60)}`);
      continue;
    }

    // tsc does not always point at the line holding the name. For
    //     import {
    //       RomanceArtBanner,
    //     } from './components/ScoreVisuals';
    // it reports column 1 of the `import {` line. Every branch below then
    // matched nothing, yet the name was still counted as removed — so the loop
    // reported "removed 1" eight times running while the file never changed.
    // Find the name inside the statement instead of trusting the address.
    let at = line - 1;
    if (name && !new RegExp(`\\b${name}\\b`).test(lines[at] ?? '')) {
      const found = [];
      for (let i = statement.start; i <= statement.end; i += 1) {
        if (new RegExp(`\\b${name}\\b`).test(lines[i] ?? '')) found.push(i);
      }
      if (found.length !== 1) {
        skipped.push(`${name}: ${found.length === 0 ? 'not found in' : 'ambiguous within'} its import statement`);
        continue;
      }
      at = found[0];
    }

    const text = lines[at];
    const isDefault = new RegExp(`^\\s*import\\s+${name}\\s+from\\s`).test(text);
    if (whole || isDefault) {
      wholeSpans.push(statement);
      removed.push(`${name ?? '(statement)'}${isDefault ? ' (default)' : ''}`);
      continue;
    }

    if (new RegExp(`^\\s*(?:type\\s+)?${name},?\\s*$`).test(text)) {
      lines[at] = null; // marked, spliced below so spans stay stable
      removed.push(name);
      continue;
    }

    const edited = text.includes(`${name},`)
      ? text.replace(new RegExp(`\\b(?:type\\s+)?${name},\\s*`), '')
      : text.replace(new RegExp(`,?\\s*\\b(?:type\\s+)?${name}\\b`), '');
    // Never claim a removal that did not happen: a no-op edit is what turned
    // this loop into a liar in the first place.
    if (edited === text) {
      skipped.push(`${name}: no edit applied to ${text.trim().slice(0, 60)}`);
      continue;
    }
    lines[at] = edited;
    removed.push(name);
  }

  // Whole statements last and bottom-up, so no span invalidates another.
  for (const span of wholeSpans.sort((a, b) => b.start - a.start)) {
    for (let i = span.start; i <= span.end; i += 1) lines[i] = null;
  }

  if (removed.length === 0) {
    console.log(`round ${round}: nothing left that is safe to touch`);
    break;
  }
  writeFileSync(path, lines.filter((line) => line !== null).join('\n'));
  console.log(`round ${round}: removed ${removed.length} — ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? ', …' : ''}`);
  dropEmptyImports();
}

// Also on the clean path, so husks left by earlier runs get collected.
dropEmptyImports();

if (skipped.length) {
  console.log('\nLeft alone (not inside an import — probably wants extracting next):');
  for (const entry of [...new Set(skipped)]) console.log(`   ${entry}`);
}
