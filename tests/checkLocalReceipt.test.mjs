// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/TopDeck.tsx', import.meta.url), 'utf-8');

/**
 * Check Local has to show that it ran.
 *
 * It rescanned, spun briefly, and returned a card identical to the one before —
 * so on a fast machine with nothing changed, pressing it had no observable
 * effect at all. Reported as "this doesn't really tell us more", which was
 * exactly right: it told you nothing, twice.
 *
 * Simple Mode's equivalent, "Check my computer", has always answered with three
 * named findings. Advanced Mode's answered with a spinner.
 */

test('the result is stamped when the scan ends, not read during render', () => {
  // Reading a clock in render is impure — the same rule that redirected the
  // Added column away from "3 days ago" — and a relative label would go stale
  // sitting on screen. A time captured at the moment of the scan stays true.
  assert.match(source, /if \(wasScanning\.current && !isScanning\)/,
    'the receipt is no longer stamped on the scan finishing');
  assert.doesNotMatch(
    source.replace(/^[^\n]*useEffect[\s\S]*?\}, \[isScanning[^\]]*\]\);/m, ''),
    /Date\.now\(\)|new Date\(\)/,
    'a clock is being read outside the scan-completion effect, which is impure in render',
  );
});

test('it reports what was found, not merely that something happened', () => {
  // "Checked" alone is barely better than nothing. The count is what makes a
  // second press meaningful: it either confirms the first or moves.
  assert.match(source, /models? found|no local models found/,
    'the receipt no longer says what the check found');
});

test('the stamp is precise enough that two presses differ', () => {
  // Without seconds, two presses inside the same minute produce an identical
  // line and the button appears to do nothing again — the exact bug, returned.
  // Verified in the browser: 23:23:02 then 23:23:05.
  const stamp = /toLocaleTimeString\([^)]*\{[^}]*\}/.exec(source)?.[0] ?? '';
  assert.match(stamp, /second:/, 'the receipt would repeat itself within a minute');
});

test('the receipt is hidden while a scan is in flight', () => {
  // Showing the previous result next to a spinner reads as the new result.
  assert.match(source, /lastChecked && !isScanning/,
    'a stale receipt can now sit beside a running scan');
});
