// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The pull counts behind the Popularity column, scraped from ollama.com.
 *
 * This is the third time that markup has changed, and every time the failure is
 * silent in the same way: model names keep parsing, every `pulls` comes back
 * null, `hasAnyPullData` goes false, and the Popularity column quietly renames
 * itself Speed. A column changed meaning and no test failed.
 *
 * The patterns are read out of main.cjs rather than copied here — a copy would
 * pass while the shipped scraper stayed broken, which is the exact failure mode
 * being guarded against.
 */

const source = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8');

/** Every `section.match(/.../i)` in the pull-count fallback chain, in order. */
function shippedPullPatterns() {
  const block = source.match(/const pullMatch = ([\s\S]*?);\n/)?.[1];
  assert.ok(block, 'the pull-count fallback chain is no longer recognisable in main.cjs');
  const literals = [...block.matchAll(/section\.match\((\/(?:\\.|[^/\\])+\/[a-z]*)\)/g)].map((m) => m[1]);
  assert.ok(literals.length >= 1, 'no pull-count patterns found');
  return literals.map((literal) => {
    const lastSlash = literal.lastIndexOf('/');
    return new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));
  });
}

const firstMatch = (html) => {
  for (const pattern of shippedPullPatterns()) {
    const m = html.match(pattern);
    if (m) return m[1];
  }
  return null;
};

// Captured from ollama.com on 2026-08-28. The number and the word "Pulls" sit
// in separate spans joined by a non-breaking space, which is what defeated the
// previous `([\d.]+[KMBkmb])\s+Pulls` pattern.
const CURRENT = `
  <p class="my-4 flex space-x-5 text-[13px] font-medium text-neutral-500">
    <span class="flex items-center">
      <svg class="mr-1.5 h-[14px] w-[14px]"></svg>
      <span >39.9M</span> <span class="hidden sm:flex">&nbsp;Pulls</span>
    </span>
  </p>`;

test('the shipped patterns parse the markup ollama.com serves today', () => {
  assert.equal(firstMatch(CURRENT), '39.9M');
});

test('the older shapes still parse, so a revert does not break it again', () => {
  // Kept as fallbacks. ollama.com has gone back and forth before, and dropping
  // the old patterns would trade one silent breakage for another.
  const alpine = '<span x-test-pull-count class="...">1.2M</span>';
  const json = '{"name":"gemma3","pullCount":39900000}';
  const plainText = '<div>4.5M Pulls</div>';

  assert.equal(firstMatch(alpine), '1.2M');
  assert.equal(firstMatch(json), '39900000');
  assert.equal(firstMatch(plainText), '4.5M');
});

test('a card with no pull count yields nothing rather than a wrong number', () => {
  // Better a blank cell than a number belonging to a neighbouring model.
  assert.equal(firstMatch('<li><a href="/library/thing">thing</a></li>'), null);
  assert.equal(firstMatch(''), null);
});

test('the count is not confused with the other stats beside it', () => {
  // The same row carries Tags and Updated, in identical span markup. A pattern
  // that matched on shape alone would happily return "17" tags as the pulls.
  const fullRow = `
    <span class="flex items-center"><span >39.9M</span> <span class="hidden sm:flex">&nbsp;Pulls</span></span>
    <span class="flex items-center"><span >17</span> <span class="hidden sm:flex">&nbsp;Tags</span></span>
    <span class="flex items-center"><span >2 weeks ago</span></span>`;
  assert.equal(firstMatch(fullRow), '39.9M');
});
