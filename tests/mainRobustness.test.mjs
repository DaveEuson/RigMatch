import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

test('a pull is cut off by silence, not by a fixed total time', () => {
  assert.doesNotMatch(main, /const timeoutMs = 1000 \* 60 \* 45;/);
  assert.match(main, /const stallMs = 1000 \* 60 \* 10;/);
  // Every chunk of progress resets the clock.
  assert.match(main, /if \(value\) \{\n\s*keepAlive\(\);/);
  assert.match(main, /nothing arrived for \$\{Math\.round\(stallMs \/ 60000\)\} minutes/);
});

test('a close prompt nobody can answer no longer makes the window unclosable', () => {
  assert.match(main, /win\.webContents\.isCrashed\(\) \|\| Date\.now\(\) - askedAt > 15000/);
  assert.match(main, /closePromptStartedAt\.delete\(win\.id\);/);
});

test('a status broadcast to a frame that is gone cannot strand a run', () => {
  assert.match(main, /try \{ win\.webContents\.send\('benchmark:status', payload\); \} catch \{ \/\* frame is gone \*\/ \}/);
});

test('Chat is tried from every candidate, and one launch at a time', () => {
  assert.match(main, /firstFailure = firstFailure \?\? started;/);
  assert.match(main, /return firstFailure \?\? \{ ok: false, reason: 'not-found' \};/);
  assert.match(main, /if \(openingChatApp\) return openingChatApp;\n\s*openingChatApp = launchChatApp\(event\)\.finally/);
});
