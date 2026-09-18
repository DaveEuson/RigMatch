// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
'use strict';

/**
 * What RigMatch Chat may ask to have made, and where each result is kept.
 *
 * The bridge made pictures only, and wrote every result as a PNG in
 * Pictures\RigMatch. Chat can now ask for a video or audio as well, and each
 * kind goes to the folder a person would look in for it. What comes back has
 * to be the kind that was asked for: a picture job that returns a video is a
 * fault to report, not a file to put in Pictures.
 *
 * Pure, so it is tested without Electron.
 */

const KINDS = new Set(['image', 'video', 'audio']);

/** The kind a request asked for. One that names none is a picture, as every Chat before 0.9 sent. */
function generationKind(value) {
  if (value === undefined || value === null || value === '') return 'image';
  return KINDS.has(value) ? value : null;
}

const MEDIA = {
  'image/png': { kind: 'image', ext: 'png' },
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/webm': { kind: 'video', ext: 'webm' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3' },
  'audio/mp3': { kind: 'audio', ext: 'mp3' },
  'audio/wav': { kind: 'audio', ext: 'wav' },
  'audio/x-wav': { kind: 'audio', ext: 'wav' },
  'audio/flac': { kind: 'audio', ext: 'flac' },
  'audio/ogg': { kind: 'audio', ext: 'ogg' },
};

/** Electron's name for the folder each kind is kept in, under a RigMatch folder of its own. */
const FOLDER = { image: 'pictures', video: 'videos', audio: 'music' };

/** What a data URL says it is, and its bytes, when it is a kind the bridge keeps. */
function parseMediaDataUrl(dataUrl) {
  const text = String(dataUrl ?? '');
  const match = /^data:([a-z]+\/[a-z0-9.+-]+)[^,]*;base64,/i.exec(text);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const media = MEDIA[mime];
  if (!media) return null;
  return { mime, kind: media.kind, ext: media.ext, base64: text.slice(match[0].length) };
}

/** Where a result for a job of this kind is saved, or null when it is not what was asked for. */
function savePlan(kind, dataUrl) {
  const media = parseMediaDataUrl(dataUrl);
  if (!media || media.kind !== kind) return null;
  return { folder: FOLDER[kind], ext: media.ext, base64: media.base64, mime: media.mime };
}

/** The type a saved file is served back as. */
function mimeForFile(file) {
  const ext = String(file ?? '').split('.').pop().toLowerCase();
  const found = Object.entries(MEDIA).find(([, media]) => media.ext === ext);
  return found ? found[0] : 'application/octet-stream';
}

/**
 * What a test Chat asked for names, or null when it names nothing RigMatch tests.
 *
 * Four kinds, because RigMatch tests a chat model one way and each maker
 * another. The renderer decides whether it can test the model named; this only
 * says the request is one.
 */
function testRequest(raw) {
  const kind = ['chat', 'image', 'video', 'audio'].includes(raw?.kind) ? raw.kind : null;
  const model = typeof raw?.model === 'string' ? raw.model.trim() : '';
  if (!kind || !model || model.length > 200) return null;
  return { kind, model };
}

module.exports = { FOLDER, generationKind, mimeForFile, parseMediaDataUrl, savePlan, testRequest };
