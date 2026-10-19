// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readTokenCounts } from '../rigmatch-chat/src/lib/contextWindow.ts';

/**
 * RigMatch Chat fixes from the 2026-10-18 bug scan.
 */

test('end-of-reply counts are read under the names the Rust side sends', () => {
  assert.deepEqual(
    readTokenCounts({ type: 'done', promptTokens: 812, evalTokens: 64 }),
    { promptTokens: 812, evalTokens: 64 },
  );
});

test('a count that is not a number is refused, not stored as a measurement', () => {
  // The old shape: snake_case fields, so promptTokens was undefined and the
  // meter read "Memory NaN / 4K".
  assert.equal(readTokenCounts({ type: 'done', prompt_tokens: 812, eval_tokens: 64 }), null);
  assert.equal(readTokenCounts({ type: 'done', promptTokens: '812', evalTokens: 64 }), null);
  assert.equal(readTokenCounts({ type: 'done', promptTokens: Number.NaN, evalTokens: 64 }), null);
  assert.equal(readTokenCounts({ type: 'done', promptTokens: 812, evalTokens: -1 }), null);
  assert.equal(readTokenCounts(null), null);
});
