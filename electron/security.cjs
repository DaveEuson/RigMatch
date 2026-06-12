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
};
