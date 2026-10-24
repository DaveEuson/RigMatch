// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '::1']);
const MODEL_NAME_PATTERN = /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$/i;
const DEFAULT_DEV_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

function assertLocalhostUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid Ollama URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Ollama URL must use http(s)');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  if (!LOCALHOST_NAMES.has(host)) {
    throw new Error('Ollama URL must point to localhost');
  }
}

function assertValidModelName(model) {
  if (typeof model !== 'string' || !model.trim()) {
    throw new Error('No model selected');
  }

  const trimmed = model.trim();
  if (trimmed.length > 200) {
    throw new Error('Model name is too long');
  }

  if (/[\x00-\x1f\x7f\s\\]/.test(trimmed) || trimmed.includes('..') || trimmed.includes('//')) {
    throw new Error('Model name contains unsupported characters');
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || !MODEL_NAME_PATTERN.test(trimmed)) {
    throw new Error('Model name is not valid');
  }

  return trimmed;
}

function isTrustedRendererUrl(rawUrl, options = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const devOrigins = options.devOrigins || DEFAULT_DEV_ORIGINS;
  if (options.isDev && devOrigins.has(parsed.origin)) {
    return true;
  }

  if (parsed.protocol !== 'file:') {
    return false;
  }

  if (!options.packagedIndexPath) {
    return true;
  }

  try {
    return path.resolve(fileURLToPath(parsed)) === path.resolve(options.packagedIndexPath);
  } catch {
    return false;
  }
}

// Electron grants every permission a renderer asks for unless a handler says
// otherwise, which sat oddly beside contextIsolation, the sandbox, the CSP and
// the host allowlists. RigMatch needs three: the microphone, for the listening
// test; notifications, for What's New's "tell me about new models" switch,
// which asks only when someone turns it on; and writing to the clipboard, for
// every Copy button. Everything else — camera, geolocation, clipboard reads,
// MIDI, USB, serial — is refused, and refused audibly rather than silently, so
// a future feature that needs one fails loudly in the main log instead of
// mysteriously in the renderer.
const ALLOWED_PERMISSIONS = new Set(['media', 'audioCapture', 'notifications', 'clipboard-sanitized-write']);

/**
 * Why a renderer permission is refused, or null to grant it. `details` is what
 * Electron passes the request and check handlers; `isTrustedUrl` says whether a
 * URL is RigMatch's own page.
 *
 * Copy failed everywhere in the desktop app ("refused clipboard-sanitized-write")
 * until the clipboard was on the list. It is granted to RigMatch's own page
 * only: the App Builder and demo previews run model-written code in frames, and
 * a frame is never the main frame.
 */
function permissionRefusal(permission, details = {}, { isTrustedUrl = () => false } = {}) {
  if (!ALLOWED_PERMISSIONS.has(permission)) return 'not in ALLOWED_PERMISSIONS';
  // "media" is the camera as well as the microphone. Only sound is needed,
  // and before this the camera queried as granted.
  if (permission === 'media') {
    const types = details.mediaTypes ?? (details.mediaType ? [details.mediaType] : []);
    if (types.some((type) => type !== 'audio')) return `only audio is allowed, not ${types.join(', ')}`;
  }
  if (permission === 'clipboard-sanitized-write' && !(details.isMainFrame === true && isTrustedUrl(details.requestingUrl))) {
    return `only RigMatch's own page may write to the clipboard, not ${String(details.requestingUrl ?? 'an unknown page').slice(0, 120)}`;
  }
  return null;
}

function isExpectedInstallerPath(installerPath, options = {}) {
  if (typeof installerPath !== 'string' || !installerPath) return false;
  if (typeof options.expectedPath !== 'string' || !options.expectedPath) return false;
  if (typeof options.tempDir !== 'string' || !options.tempDir) return false;

  const resolved = path.resolve(installerPath);
  const expected = path.resolve(options.expectedPath);
  const tempDir = path.resolve(options.tempDir);
  const expectedName = options.platform === 'darwin' ? 'Ollama-darwin.zip' : 'OllamaSetup.exe';

  return resolved === expected &&
    path.dirname(resolved) === tempDir &&
    path.basename(resolved) === expectedName;
}

module.exports = {
  assertLocalhostUrl,
  assertValidModelName,
  isExpectedInstallerPath,
  isTrustedRendererUrl,
  permissionRefusal,
};
