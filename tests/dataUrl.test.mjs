// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dataUrlToBlob } from '../src/lib/dataUrl.ts';

/**
 * The Lab's clips arrive from ComfyUI as base64 data: URLs and play from Blob
 * URLs. Turning one into the other used fetch(), which the app's own
 * Content-Security-Policy refuses for data: — so no clip ever played in the
 * desktop app. These pin the replacement, and the policy that made it needed.
 */

test('a base64 video comes back as the same bytes, with its type', async () => {
  const bytes = Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112, 255, 128, 1]);
  const blob = dataUrlToBlob(`data:video/mp4;base64,${Buffer.from(bytes).toString('base64')}`);
  assert.equal(blob.type, 'video/mp4');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test('a plain-text data URL is decoded rather than read as base64', async () => {
  const blob = dataUrlToBlob('data:text/plain,hello%20there');
  assert.equal(blob.type, 'text/plain');
  assert.equal(await blob.text(), 'hello there');
});

test('anything that is not a data URL is refused rather than guessed at', () => {
  assert.throws(() => dataUrlToBlob('https://example.com/clip.mp4'), /Not a data URL/);
  assert.throws(() => dataUrlToBlob('data:video/mp4;base64'), /Not a data URL/);
});

test('the app still refuses to fetch data: URLs, which is why this exists', () => {
  // If connect-src ever allows data:, fetch() would work again and this
  // helper would be optional rather than required. Until then, no renderer
  // code may fetch a data: URL.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
  const connect = /connect-src ([^;]+);/.exec(html)?.[1] ?? '';
  assert.ok(connect, 'index.html declares connect-src');
  assert.ok(!/\bdata:/.test(connect), 'connect-src now allows data:; revisit dataUrlToBlob');
});
