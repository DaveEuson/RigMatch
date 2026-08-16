#!/usr/bin/env node
/**
 * Verify a packaged build actually contains the fixes that were committed.
 *
 * Building is not shipping. Each probe is a string that exists only because of
 * a specific change, so a missing one names what did not make it in.
 *
 * Two traps this has already fallen into, both guarded now:
 *
 *  - asar.listPackage returns "\dist\assets\index.js"; extractFile wants
 *    "dist\assets\index.js" — leading separator stripped, backslashes KEPT.
 *    Converting them to forward slashes silently extracts nothing.
 *  - With nothing extracted, every "is present" probe fails and every "is
 *    gone" probe passes. An empty scan therefore has to be a hard error, not
 *    a result, or removing something looks confirmed when nothing was read.
 *
 * Usage:  node scripts/verify-package.mjs <path-to-app.asar>
 */

import asar from '@electron/asar';

const pkg = process.argv[2];
if (!pkg) {
  console.error('usage: node scripts/verify-package.mjs <path-to-app.asar>');
  process.exit(2);
}

const entries = asar.listPackage(pkg);
const wanted = entries.filter((entry) => /[\\/]dist[\\/]assets[\\/].*\.(js|css)$/.test(entry));

let js = '';
let css = '';
const failures = [];
for (const entry of wanted) {
  // Strip only the leading separator. Keep the native separators.
  const rel = entry.replace(/^[\\/]+/, '');
  try {
    const text = asar.extractFile(pkg, rel).toString();
    if (rel.endsWith('.css')) css += text; else js += text;
  } catch (error) {
    failures.push(`${rel}: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(`could not read ${failures.length} bundle file(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
if (js.length < 100_000 || css.length < 10_000) {
  console.error(`read only ${js.length} bytes of JS and ${css.length} of CSS from ${wanted.length} file(s) — `
    + 'that is not a real bundle, so no conclusion can be drawn from these probes');
  process.exit(1);
}

console.log(`scanned ${wanted.length} bundle file(s): ${(js.length / 1e6).toFixed(2)} MB JS, ${(css.length / 1e6).toFixed(2)} MB CSS\n`);

/** [label, haystack, needle] — a string that exists only because of one fix. */
const PRESENT = [
  ['host explains a term on hover', js, 'the host explains this above'],
  ['setup says what a model is first', js, 'is a program that runs on your own computer'],
  ['winner board shows the whole lineup', js, 'How the lineup finished'],
  ['live answer scores on Compare', js, 'answers so far'],
  ['lineup-full is a note, not a dead button', js, 'drop one from your lineup'],
  ['stale winner is labelled as previous', js, "not in tonight's lineup"],
  ['licence links are built per model', js, 'ollama.com/library/'],
  ['Gemma keeps its prohibited-use policy', js, 'prohibited_use_policy'],
  ['collapsible stats strip', css, 'top-deck-collapse'],
  // The minifier rewrites media queries to modern range syntax, so
  // "max-height: 900px" in the source ships as "(height<=900px)". Probing for
  // the authored spelling reported this fix missing when it was present.
  ['nav rail compacts on short screens', css, 'height<=900px'],
  ['visible scrollbar on the nav rail', css, 'scrollbar-thumb'],
  ['winner scoreboard styling', css, 'sw-scoreboard'],
  ['answer strip styling', css, 'sw-answer-strip'],
  ['Find ComfyUI for me', js, 'Find ComfyUI for me'],
  ['refused download states its reason', js, 'does not know where ComfyUI is yet'],
  ['plain-words glossary', js, 'A free program that does the actual work'],
  ['quit cleanup: keep only my match', js, 'Keep Only My Match'],
  ['upgrade prompt copy', js, 'New in this version'],
  ['auto-judge note in the run dialog', js, 'no right answer to check against'],
  ['release notes mention the licence fix', js, "links that model's terms"],
];

/** Things that must NOT be in the bundle. */
const ABSENT = [
  ['dead BenchmarkRun panel', js, 'BenchmarkRun'],
];

let missing = 0;
for (const [label, haystack, needle] of PRESENT) {
  const ok = haystack.includes(needle);
  if (!ok) missing += 1;
  console.log(`  ${ok ? 'yes ' : 'NO  '} ${label}`);
}
for (const [label, haystack, needle] of ABSENT) {
  const ok = !haystack.includes(needle);
  if (!ok) missing += 1;
  console.log(`  ${ok ? 'gone' : 'STILL THERE'} ${label}`);
}

console.log(missing === 0
  ? `\nAll ${PRESENT.length + ABSENT.length} probes hold in the packaged bundle.`
  : `\n${missing} probe(s) failed — the package does not match what was committed.`);
process.exit(missing === 0 ? 0 : 1);
