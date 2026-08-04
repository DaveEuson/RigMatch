import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatThroughput, scoreToToks } from '../src/lib/format.ts';

// The speed sub-score maps 100 tok/s to 100 and clamps, so it cannot be read
// back as a rate: on a 12GB card every model at or above 100 tok/s scores 100.
// These lock the rule that display prefers the rate actually measured.

test('uses the measured rate rather than inferring one from the sub-score', () => {
  // Real readings from an RTX 4070 on an idle card. All three saturate `speed`,
  // yet they differ by more than 3x -- inferring a rate would erase that.
  assert.equal(formatThroughput({ speed: 100, tokensPerSecond: 364.9 }), '365 tok/s');
  assert.equal(formatThroughput({ speed: 100, tokensPerSecond: 127.4 }), '127 tok/s');
  assert.equal(formatThroughput({ speed: 100, tokensPerSecond: 108.6 }), '109 tok/s');
});

test('keeps a decimal for slow models where whole numbers lose too much', () => {
  // A contended run: 10.7 tok/s must not round to a bare "11" that reads as the
  // same measurement as 10.0.
  assert.equal(formatThroughput({ speed: 6, tokensPerSecond: 10.7 }), '10.7 tok/s');
  assert.equal(formatThroughput({ speed: 2, tokensPerSecond: 3.42 }), '3.4 tok/s');
});

test('falls back to the estimate only when no rate was saved', () => {
  // Scores recorded before the field existed.
  assert.equal(formatThroughput({ speed: 100 }), scoreToToks(100));
  assert.equal(formatThroughput({ speed: 40 }), '~2 tok/s');
});

test('ignores unusable saved values instead of printing them', () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      formatThroughput({ speed: 100, tokensPerSecond: bad }),
      scoreToToks(100),
      `${bad} should fall back, not render`,
    );
  }
});

test('the fallback claims a floor, never an exact figure', () => {
  // The old text said "~20 tok/s", which read as a measurement and was wrong by
  // up to 18x for a fast model. It must not imply an upper bound.
  assert.equal(scoreToToks(100), '20+ tok/s');
  assert.doesNotMatch(scoreToToks(100), /^~/);
});
