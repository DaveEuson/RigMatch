#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Remove CSS for class names nothing renders any more.
 *
 * The hazard is the selector list. `.dead, .live { ... }` must lose only its
 * dead half, and `.model-panel .contestants-command-deck, .model-panel .rig` is
 * one selector that dies and one that must not. Deleting whole rules by
 * grepping for the class name would take live styling with it, silently, in a
 * 15,000-line stylesheet where nobody would notice until a screen looked wrong.
 *
 * So this parses: braces are matched, comments are skipped rather than counted,
 * at-rules recurse, and a rule dies only when every one of its selectors did.
 * An at-rule left with an empty body goes too.
 *
 * The last step is the one that matters — it re-derives the full selector list
 * from the output and asserts that every selector which vanished mentions one
 * of the doomed classes. A parser bug that ate a live rule fails the run
 * instead of shipping.
 *
 * Usage: node scripts/prune-orphan-css.mjs <file.css> <class> [class...]
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [file, ...orphans] = process.argv.slice(2);
if (!file || orphans.length === 0) throw new Error('usage: <file.css> <class> [class...]');

const mentionsOrphan = (selector) =>
  orphans.some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(selector));

/** Skip a /* ... *​/ comment starting at i; returns the index just past it. */
function pastComment(css, i) {
  const close = css.indexOf('*/', i + 2);
  return close === -1 ? css.length : close + 2;
}

const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * Split a selector list on top-level commas — `:is(a, b)` holds together.
 *
 * Comments come out first. A prelude like `/* Each item, and its badge *​/
 * .side-menu-item` splits on the comma *inside the comment* otherwise, and the
 * fragment "and its badge *​/ .side-menu-item" is then neither a valid selector
 * nor recognisable as the one it came from. The control run caught this by
 * reporting "its badge value" as a live selector about to be lost.
 */
function splitSelectors(rawPrelude) {
  const prelude = withoutComments(rawPrelude);
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < prelude.length; i += 1) {
    const c = prelude[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    if (c === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += c;
  }
  parts.push(current);
  return parts;
}

function parse(css) {
  const nodes = [];
  let buffer = '';
  let i = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = pastComment(css, i);
      buffer += css.slice(i, end);
      i = end;
      continue;
    }
    if (css[i] === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '/' && css[j + 1] === '*') { j = pastComment(css, j); continue; }
        if (css[j] === '{') depth += 1;
        else if (css[j] === '}') { depth -= 1; if (depth === 0) break; }
        j += 1;
      }
      nodes.push({ kind: 'block', prelude: buffer, inner: css.slice(i + 1, j) });
      buffer = '';
      i = j + 1;
      continue;
    }
    if (css[i] === ';' && buffer.trimStart().startsWith('@')) {
      nodes.push({ kind: 'text', text: `${buffer};` });
      buffer = '';
      i += 1;
      continue;
    }
    buffer += css[i];
    i += 1;
  }
  if (buffer) nodes.push({ kind: 'text', text: buffer });
  return nodes;
}

let rulesDropped = 0;
let selectorsDropped = 0;

function render(nodes) {
  let out = '';
  for (const node of nodes) {
    if (node.kind === 'text') { out += node.text; continue; }

    const isAtRule = node.prelude.trimStart().startsWith('@');
    if (isAtRule) {
      const inner = render(parse(node.inner));
      // An at-rule whose every child died has nothing left to say.
      if (inner.trim() === '') { rulesDropped += 1; continue; }
      out += `${node.prelude}{${inner}}`;
      continue;
    }

    const selectors = splitSelectors(node.prelude);
    const kept = selectors.filter((s) => !mentionsOrphan(s));
    if (kept.length === selectors.length) {
      out += `${node.prelude}{${node.inner}}`;
      continue;
    }
    selectorsDropped += selectors.length - kept.length;
    if (kept.length === 0) { rulesDropped += 1; continue; }
    // Rebuild from the survivors, keeping the original leading whitespace.
    const lead = node.prelude.match(/^\s*/)[0];
    out += `${lead}${kept.map((s) => s.trim()).join(',\n' + lead.replace(/^\n+/, ''))} {${node.inner}}`;
  }
  return out;
}

/** Every selector in a stylesheet, for the before/after comparison. */
function allSelectors(css) {
  const found = [];
  const walk = (list) => {
    for (const node of list) {
      if (node.kind !== 'block') continue;
      if (node.prelude.trimStart().startsWith('@')) { walk(parse(node.inner)); continue; }
      for (const selector of splitSelectors(node.prelude)) {
        const clean = selector.trim();
        if (clean) found.push(clean);
      }
    }
  };
  walk(parse(css));
  return found;
}

const before = readFileSync(file, 'utf-8');
const after = render(parse(before));

const beforeSelectors = allSelectors(before);
const afterSelectors = allSelectors(after);

// Multiset difference: a selector appearing twice must still appear twice.
const remaining = [...afterSelectors];
const vanished = [];
for (const selector of beforeSelectors) {
  const at = remaining.indexOf(selector);
  if (at === -1) vanished.push(selector);
  else remaining.splice(at, 1);
}

const wrongful = vanished.filter((s) => !mentionsOrphan(s));
if (wrongful.length) {
  throw new Error(`refusing to write — these live selectors would be lost:\n  ${wrongful.join('\n  ')}`);
}
if (remaining.length) {
  throw new Error(`refusing to write — selectors appeared that were not there before:\n  ${remaining.join('\n  ')}`);
}

const stillThere = orphans.filter((c) => new RegExp(`\\.${c}(?![\\w-])`).test(after));
if (stillThere.length) throw new Error(`still present after pruning: ${stillThere.join(', ')}`);

writeFileSync(file, after);
console.log(`${file}: dropped ${rulesDropped} rule(s) and ${selectorsDropped} selector(s) from lists`);
console.log(`${vanished.length} selector(s) removed, every one of them naming a dead class`);
console.log(`${before.split('\n').length} lines -> ${after.split('\n').length}`);
