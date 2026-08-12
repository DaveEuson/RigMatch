import test from 'node:test';
import assert from 'node:assert/strict';

import { COMFY_DEFAULT_BASE_URL, normalizeComfyUrl } from '../src/lib/comfySettings.ts';

test('what a person actually types is accepted', () => {
  assert.equal(normalizeComfyUrl('localhost:8188'), 'http://localhost:8188');
  assert.equal(normalizeComfyUrl('127.0.0.1:8189'), 'http://127.0.0.1:8189');
  assert.equal(normalizeComfyUrl('http://127.0.0.1:8188'), 'http://127.0.0.1:8188');
  assert.equal(normalizeComfyUrl('  localhost:9000  '), 'http://localhost:9000');
});

test('a bare port is accepted, since that is the only thing most people change', () => {
  assert.equal(normalizeComfyUrl('8189'), 'http://127.0.0.1:8189');
  assert.equal(normalizeComfyUrl('80'), 'http://127.0.0.1:80');
  assert.equal(normalizeComfyUrl('99999'), null);
});

test('a remote address is refused', () => {
  // ComfyUI has no authentication. Pointing a benchmark at someone else's box
  // makes their GPU render pictures for a stranger.
  assert.equal(normalizeComfyUrl('192.168.1.50:8188'), null);
  assert.equal(normalizeComfyUrl('http://example.com:8188'), null);
  assert.equal(normalizeComfyUrl('https://comfy.example.com'), null);
});

test('a non-http scheme is refused', () => {
  assert.equal(normalizeComfyUrl('file:///etc/passwd'), null);
  assert.equal(normalizeComfyUrl('ftp://localhost:8188'), null);
});

test('a trailing slash or stray path cannot leak into a request path', () => {
  // `${base}/prompt` must not become `//prompt` or `/some/path/prompt`.
  assert.equal(normalizeComfyUrl('http://127.0.0.1:8188/'), 'http://127.0.0.1:8188');
  assert.equal(normalizeComfyUrl('http://127.0.0.1:8188/some/path'), 'http://127.0.0.1:8188');
});

test('empty input yields null so the caller keeps its default', () => {
  assert.equal(normalizeComfyUrl(''), null);
  assert.equal(normalizeComfyUrl('   '), null);
  assert.equal(normalizeComfyUrl('not a url at all !!'), null);
});

test('the default stays on ComfyUI own port', () => {
  // Moving off 8188 would not dodge a collision — RigMatch connects to a
  // ComfyUI someone else started, so a different default just finds nothing.
  assert.equal(COMFY_DEFAULT_BASE_URL, 'http://127.0.0.1:8188');
});
