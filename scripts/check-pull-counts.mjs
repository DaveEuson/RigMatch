#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Does ollama.com still serve the pull counts the Popularity column needs?
 *
 * The check that was missing. That markup has changed three times, and the
 * breakage is silent every time: model names keep parsing, every pull count
 * comes back null, `hasAnyPullData` goes false, and the Popularity column
 * quietly renames itself Speed. A whole column changes meaning and nothing
 * fails — which is how it reached a user, who reported the column as simply
 * not telling him anything.
 *
 * tests/ollamaPullCounts.test.mjs pins the parser against captured markup and
 * needs no network. Only the live page can say whether the markup is still
 * that shape, so this runs from `npm run sweep:net`.
 *
 * The patterns are read out of electron/main.cjs rather than copied, because a
 * copy would pass while the shipped scraper stayed broken.
 *
 * Usage:  node scripts/check-pull-counts.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY_URL = 'https://ollama.com/library';
/** Below this share, the column silently stops being Popularity. */
const MIN_SHARE = 0.8;

function shippedPatterns() {
  const main = readFileSync(join(root, 'electron/main.cjs'), 'utf-8');
  const block = /const pullMatch = ([\s\S]*?);\n/.exec(main)?.[1];
  if (!block) throw new Error('the pull-count fallback chain is no longer recognisable in electron/main.cjs');

  const literals = [...block.matchAll(/section\.match\((\/(?:\\.|[^/\\])+\/[a-z]*)\)/g)].map((m) => m[1]);
  if (literals.length === 0) throw new Error('no pull-count patterns found in electron/main.cjs');

  return literals.map((literal) => {
    const lastSlash = literal.lastIndexOf('/');
    return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));
  });
}

const res = await fetch(LIBRARY_URL, { headers: { 'user-agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error(`${LIBRARY_URL} answered ${res.status}`);
const html = await res.text();

const patterns = shippedPatterns();
let named = 0;
let counted = 0;
for (const section of html.split(/<li[\s>]/i)) {
  if (!/href=["']\/library\/[a-zA-Z0-9._-]+["']/i.test(section)) continue;
  named += 1;
  if (patterns.some((pattern) => pattern.test(section))) counted += 1;
}

if (named < 50) {
  throw new Error(`only ${named} models found on the library page — the page shape changed entirely, `
    + 'so the catalogue scrape needs looking at before the pull counts do');
}

const share = counted / named;
if (share <= MIN_SHARE) {
  throw new Error(`${counted} of ${named} models yield a pull count. Below ${MIN_SHARE * 100}% the `
    + 'Popularity column silently becomes Speed, so the scrape patterns in electron/main.cjs need '
    + `updating for whatever ${LIBRARY_URL} now serves`);
}

process.stdout.write(`${counted}/${named} models carry a pull count\n`);
