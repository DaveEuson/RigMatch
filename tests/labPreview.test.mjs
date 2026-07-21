import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSandboxedPreviewHtml } from '../src/lib/labPreview.ts';

const CSP = 'Content-Security-Policy';

test('CSP is the first meta parsed, even when the model HTML mentions <head in a comment', () => {
  // Regression: locating the model's own <head> let a "<head" inside a comment
  // (or string) shift the CSP into an inert position, dropping network blocking.
  const model = '<!-- <head> decoy --><!doctype html><html><head><title>Game</title></head><body><script>1</script></body></html>';
  const wrapped = buildSandboxedPreviewHtml(model);
  const cspAt = wrapped.indexOf(CSP);
  assert.ok(cspAt !== -1, 'CSP is present');
  // The CSP must come before any of the model-supplied markup.
  assert.ok(cspAt < wrapped.indexOf('decoy'), 'CSP precedes the model comment');
  assert.ok(cspAt < wrapped.indexOf('<title>'), 'CSP precedes the model head content');
});

test('model scripts and canvas survive the wrap (the app can still run)', () => {
  const model = '<canvas></canvas><script>const x = 1;</script>';
  const wrapped = buildSandboxedPreviewHtml(model);
  assert.ok(wrapped.includes('<canvas></canvas>'));
  assert.ok(wrapped.includes('const x = 1;'));
  assert.ok(wrapped.startsWith('<!doctype html>'));
});
