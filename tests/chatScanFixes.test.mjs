// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readTokenCounts } from '../rigmatch-chat/src/lib/contextWindow.ts';

/**
 * RigMatch Chat fixes from the 2026-10-18 bug scan. App.tsx is a React
 * component that needs Tauri to run, so its parts are checked in the source;
 * everything that could move into a library module is imported and run.
 */

const app = readFileSync(new URL('../rigmatch-chat/src/App.tsx', import.meta.url), 'utf-8');
/** The body of one `const name = useCallback(...)` in App.tsx. */
const callback = (name) => {
  const start = app.indexOf(`const ${name} = useCallback(`);
  assert.notEqual(start, -1, `${name} not found in App.tsx`);
  const end = app.indexOf('\n  }, [', start);
  return app.slice(start, end);
};

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

test('an attachment is sent with one message, not every message after it', () => {
  const send = callback('sendMessage');
  const built = send.indexOf('const userMsg: AppMessage');
  const cleared = send.indexOf('if (usableAttachment) setAttachment(null);');
  assert.ok(built !== -1 && cleared > built, 'sendMessage clears the attachment once the turn holds it');
  assert.ok(cleared < send.indexOf('await streamChat('), 'cleared before the reply streams');
});
