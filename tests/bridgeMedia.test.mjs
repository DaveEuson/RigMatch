// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { FOLDER, generationKind, mimeForFile, parseMediaDataUrl, savePlan } = require('../electron/bridgeMedia.cjs');

/**
 * RigMatch Chat can ask for a picture, a video or audio. These lock what it may
 * ask for, where each result is kept, and that a result is filed only when it
 * is what was asked for.
 */

test('a request names what it wants made, and one that names nothing is a picture', () => {
  assert.equal(generationKind(undefined), 'image', 'every Chat before 0.9 sent no kind');
  assert.equal(generationKind(''), 'image');
  assert.equal(generationKind('image'), 'image');
  assert.equal(generationKind('video'), 'video');
  assert.equal(generationKind('audio'), 'audio');
  assert.equal(generationKind('speech'), null);
  assert.equal(generationKind('../../windows'), null);
  assert.equal(generationKind(['video']), null);
});

test('each kind is kept where a person would look for it', () => {
  assert.deepEqual(FOLDER, { image: 'pictures', video: 'videos', audio: 'music' });
  assert.deepEqual(savePlan('video', 'data:video/mp4;base64,AAAA'), { folder: 'videos', ext: 'mp4', base64: 'AAAA', mime: 'video/mp4' });
  assert.equal(savePlan('audio', 'data:audio/mpeg;base64,AAAA')?.ext, 'mp3');
  assert.equal(savePlan('audio', 'data:audio/mpeg;base64,AAAA')?.folder, 'music');
  assert.equal(savePlan('image', 'data:image/png;base64,AAAA')?.folder, 'pictures');
  assert.equal(parseMediaDataUrl('data:audio/wav;charset=binary;base64,AAAA')?.ext, 'wav', 'parameters before base64 are allowed');
});

test('a result that is not what was asked for is refused rather than filed', () => {
  assert.equal(savePlan('image', 'data:video/mp4;base64,AAAA'), null);
  assert.equal(savePlan('audio', 'data:text/html;base64,PGh0bWw+'), null);
  assert.equal(savePlan('video', 'not a data url'), null);
  assert.equal(savePlan('video', undefined), null);
});

test('a saved file is served back as what it is', () => {
  assert.equal(mimeForFile('C:/Users/me/Videos/RigMatch/gen-1.mp4'), 'video/mp4');
  assert.equal(mimeForFile('gen-2.mp3'), 'audio/mpeg');
  assert.equal(mimeForFile('gen-3.PNG'), 'image/png');
  assert.equal(mimeForFile('gen-4.exe'), 'application/octet-stream');
});
