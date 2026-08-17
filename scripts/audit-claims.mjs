#!/usr/bin/env node
/**
 * Find copy that asserts something the app may not actually know.
 *
 * The bug that prompted this: selecting "A video maker" said "No contestants
 * can make video on this PC" while two video makers shipped in the catalogue
 * and ran fine. The Pick grid excludes generation models deliberately, and the
 * copy turned that deliberate absence into a claim about the user's hardware.
 *
 * That is the shape to hunt: an ABSOLUTE — no, none, cannot, never, always,
 * every, all, only — about the machine, the models, or privacy, written in a
 * place that is only looking at a filtered subset of the truth.
 *
 * This cannot decide what is false. It finds the sentences worth a human
 * reading, which is the point: the alternative is nobody ever re-reading them.
 *
 * Usage:  node scripts/audit-claims.mjs [--all]
 *         --all lists every user-facing string, not just the absolutes.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const showAll = process.argv.includes('--all');

/** The words that turn an observation into a promise. */
const ABSOLUTE = /\b(no|none|nothing|never|cannot|can't|won't|unable|always|every|all|only|guaranteed|impossible)\b/i;

/** Subjects worth being careful about: the machine, the models, privacy. */
const SUBJECT = /\b(pc|computer|machine|rig|gpu|graphics card|vram|memory|disk|model|models|contestant|contestants|hardware|cloud|internet|account|upload|private|local)\b/i;

/**
 * Claims already established as true, so they stop crowding the report.
 * Each one is true because of an architectural fact, not a hope.
 */
const KNOWN_GOOD = [
  /nothing is installed system-wide/i,   // models go to a folder RigMatch manages
  /no account, no cloud/i,               // there is no backend to have an account with
  /nothing leaves this computer/i,       // inference is local
  /stays on your (pc|computer)/i,
  /prompts stay on this computer/i,
];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (/\.(tsx|ts)$/.test(full) && !/\.test\./.test(full)) files.push(full);
  }
};
walk('src');

/**
 * Blank out comments, preserving length and newlines so line numbers hold.
 *
 * Without this the audit reports its own documentation: a comment explaining
 * that a claim USED to be false gets flagged as the claim still being made.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (line, lead) => lead + ' '.repeat(line.length - lead.length));
}

/** Quoted literals and JSX text, long enough to be a sentence. */
function strings(source) {
  const found = [];
  for (const match of source.matchAll(/(['"`])((?:[^\\\n]|\\.){14,240}?)\1/g)) {
    found.push({ text: match[2], index: match.index });
  }
  for (const match of source.matchAll(/>\s*([A-Z][^<>{}\n]{18,240}?)\s*</g)) {
    found.push({ text: match[1], index: match.index });
  }
  return found;
}

const looksLikeCode = (text) => (
  /^[a-z-]+(\s[a-z-]+)*$/.test(text)
  || /[{}<>$]|=>|\/\//.test(text)
  || /^[\w./-]+$/.test(text)
  || /^https?:/.test(text)
  || !/\s/.test(text)
);

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

const findings = [];
for (const file of files) {
  const source = withoutComments(readFileSync(file, 'utf-8'));
  for (const { text, index } of strings(source)) {
    if (looksLikeCode(text)) continue;
    if (KNOWN_GOOD.some((ok) => ok.test(text))) continue;
    if (!showAll && !(ABSOLUTE.test(text) && SUBJECT.test(text))) continue;
    findings.push({
      file: relative(process.cwd(), file).split('\\').join('/'),
      line: lineOf(source, index),
      text: text.replace(/\s+/g, ' ').trim(),
    });
  }
}

// The same sentence in several places is one thing to judge, not five.
const seen = new Map();
for (const finding of findings) {
  const key = finding.text.toLowerCase();
  if (!seen.has(key)) seen.set(key, { ...finding, count: 1 });
  else seen.get(key).count += 1;
}
const unique = [...seen.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

/**
 * The highest-risk shape, called out separately: a NEGATIVE claim about what
 * the machine or its models can do. This is the class the video bug belonged
 * to, and the class most likely to talk someone out of a working feature.
 */
const NEGATIVE_CAPABILITY = /\b(no|none|nothing|cannot|can't|unable)\b[^.!?]{0,40}\b(can|could|fit|fits|run|runs|work|works|support|supports|make|makes|do|does)\b/i;
const worrying = unique.filter((finding) => NEGATIVE_CAPABILITY.test(finding.text));

console.log(`${unique.length} distinct claim(s) worth re-reading, from ${files.length} files.\n`);
console.log(`Of those, ${worrying.length} deny a capability — the shape that told this PC it`);
console.log('could not make video while two video makers sat in the catalogue:\n');
for (const finding of worrying) {
  console.log(`  ${finding.file}:${finding.line}${finding.count > 1 ? `  (x${finding.count})` : ''}`);
  console.log(`    "${finding.text.slice(0, 140)}${finding.text.length > 140 ? '…' : ''}"`);
}

if (showAll || process.argv.includes('--rest')) {
  console.log('\nThe rest:\n');
  for (const finding of unique.filter((f) => !worrying.includes(f))) {
    console.log(`  ${finding.file}:${finding.line}`);
    console.log(`    "${finding.text.slice(0, 140)}${finding.text.length > 140 ? '…' : ''}"`);
  }
}

console.log('\nA denial is only safe when it names the subset it is true of:');
console.log('  good — "No Ollama chat model fits this computer yet"');
console.log('  bad  — "No models fit this computer" (which models? checked how?)');
