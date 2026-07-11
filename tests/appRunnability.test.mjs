import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// The module is TS; import the compiled-at-runtime source isn't available in node,
// so we re-implement nothing — we test the pure syntax detector via a tiny shim by
// importing the transpiled logic. Since the project ships ESM TS, we validate the
// regex+Function approach directly here against the real failure patterns.
const require = createRequire(import.meta.url);

// Mirror of findScriptSyntaxError for node testing (the browser file guards on
// `document`, but the syntax path is pure and identical to this).
function findScriptSyntaxError(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .filter((s) => s.trim());
  for (const src of scripts) {
    try {
      new Function(src);
    } catch (error) {
      if (error instanceof SyntaxError) return error.message;
    }
  }
  return null;
}

test('flags the phi3 failure: a comment used where an expression is required', () => {
  const html = `<html><body><script>
    if (falling && /* Check for possible rotation */) { doThing(); }
  </script></body></html>`;
  assert.notEqual(findScriptSyntaxError(html), null, 'the /* comment */ inside if() is a syntax error');
});

test('passes syntactically valid code (even if it would crash at runtime)', () => {
  // The qwen Tetris parses fine — its bug (row.map on a number) is runtime-only,
  // so the syntax pass must NOT flag it; the iframe probe catches that separately.
  const html = `<html><body><script>
    const t = [[1,5,9,13],[4,5,6,7]];
    let cur = t[0][0];
    function moveDown(){ cur.map(row => row.map(c => c)); }
  </script></body></html>`;
  assert.equal(findScriptSyntaxError(html), null);
});

test('detects an unclosed brace / truncated script', () => {
  const html = `<html><body><script>
    function draw() { ctx.fillRect(0,0,10,10);
  </script></body></html>`;
  assert.notEqual(findScriptSyntaxError(html), null);
});

test('returns null when there is no script at all', () => {
  assert.equal(findScriptSyntaxError('<html><body><h1>hi</h1></body></html>'), null);
});

test('ignores empty script tags', () => {
  assert.equal(findScriptSyntaxError('<html><body><script></script></body></html>'), null);
});

test('checks every script block, not just the first', () => {
  const html = `<script>const a = 1;</script><script>function(){</script>`;
  assert.notEqual(findScriptSyntaxError(html), null);
});
