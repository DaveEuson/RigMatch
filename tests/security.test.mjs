import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const security = require('../electron/security.cjs');

test('localhost URL validation accepts only local http(s) Ollama URLs', () => {
  for (const url of [
    'http://localhost:11434',
    'http://127.0.0.1:11434',
    'http://[::1]:11434',
    'https://localhost:11434',
  ]) {
    assert.doesNotThrow(() => security.assertLocalhostUrl(url), url);
  }

  for (const url of [
    'file://localhost/etc/passwd',
    'ftp://localhost:11434',
    'http://localhost.evil.test:11434',
    'http://192.168.1.10:11434',
    'http://example.com',
    'not a url',
  ]) {
    assert.throws(() => security.assertLocalhostUrl(url), /Ollama URL|Invalid Ollama URL/, url);
  }
});

test('model name validation rejects malformed or dangerous inputs', () => {
  for (const model of [
    'llama3.2:3b',
    'qwen2.5:7b',
    'hf.co/example/model-name:q4_k_m',
    'deepseek-r1:7b',
  ]) {
    assert.equal(security.assertValidModelName(model), model);
  }

  for (const model of [
    '',
    '   ',
    '../model',
    'model name',
    'https://example.com/model',
    'model\\name',
    'model\nname',
    'a'.repeat(201),
  ]) {
    assert.throws(() => security.assertValidModelName(model), /model/i, String(model));
  }
});

test('installer launch guard accepts only the installer downloaded by this session', () => {
  const tempDir = path.resolve('C:/Temp/RigMatch');
  const expectedPath = path.join(tempDir, 'OllamaSetup.exe');

  assert.equal(security.isExpectedInstallerPath(expectedPath, {
    expectedPath,
    tempDir,
    platform: 'win32',
  }), true);

  assert.equal(security.isExpectedInstallerPath(path.join(tempDir, 'other.exe'), {
    expectedPath,
    tempDir,
    platform: 'win32',
  }), false);

  assert.equal(security.isExpectedInstallerPath(path.join(tempDir, '..', 'OllamaSetup.exe'), {
    expectedPath,
    tempDir,
    platform: 'win32',
  }), false);
});

test('trusted renderer URL validation allows packaged file and local dev origins only', () => {
  const packagedIndexPath = path.resolve('dist/index.html');
  const packagedUrl = pathToFileURL(packagedIndexPath).toString();

  assert.equal(security.isTrustedRendererUrl(packagedUrl, { packagedIndexPath }), true);
  assert.equal(security.isTrustedRendererUrl('http://127.0.0.1:5173', { isDev: true, packagedIndexPath }), true);
  assert.equal(security.isTrustedRendererUrl('http://localhost:5173', { isDev: true, packagedIndexPath }), true);

  assert.equal(security.isTrustedRendererUrl('http://127.0.0.1:5174', { isDev: true, packagedIndexPath }), false);
  assert.equal(security.isTrustedRendererUrl('https://evil.test', { isDev: true, packagedIndexPath }), false);
  assert.equal(security.isTrustedRendererUrl(pathToFileURL(path.resolve('other.html')).toString(), { packagedIndexPath }), false);
});
