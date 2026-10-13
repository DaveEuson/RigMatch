import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { pickJustChatModel } = await import('../src/lib/justChat.ts');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

const row = (displayName, sizeGb, extra = {}) => ({
  id: displayName, name: displayName, displayName, tag: displayName.split(':')[1] ?? 'latest',
  params: displayName.split(':')[1] ?? '4b', sizeGb, pack: 'x', source: 'x', live: false,
  installed: false, ready: false, installLabel: '', canDownload: true, ...extra,
});

test('an installed recommended chat model wins, with no download', () => {
  const choice = pickJustChatModel([row('gemma3:4b', 3.3, { installed: true }), row('llama3.2:3b', 2.0)], 12);
  assert.equal(choice.model, 'gemma3:4b');
  assert.equal(choice.installed, true);
});

test('nothing installed: the first recommended model that can be downloaded', () => {
  const choice = pickJustChatModel([row('llama3.2:3b', 2.0), row('gemma3:4b', 3.3)], 12);
  assert.equal(choice.model, 'gemma3:4b');
  assert.equal(choice.installed, false);
  assert.equal(choice.sizeGb, 3.3);
});

test('a model already on the PC is preferred over a download, even if it was not on the list', () => {
  const choice = pickJustChatModel([
    row('gemma3:4b', 3.3),
    row('qwen3:8b', 5.2, { installed: true }),
  ], 12);
  assert.equal(choice.model, 'qwen3:8b');
  assert.equal(choice.installed, true);
});

test('picture, video and embedding models are never offered to chat with', () => {
  const choice = pickJustChatModel([
    row('z-image-turbo', 14.58, { installed: true, runtime: 'comfyui', generationKind: 'image' }),
    row('nomic-embed-text:latest', 0.3, { installed: true, capabilities: ['embedding'] }),
    row('llama3.2:3b', 2.0),
  ], 12);
  assert.equal(choice.model, 'llama3.2:3b');
});

test('a cloud-only or unsized model is not something to download', () => {
  assert.equal(pickJustChatModel([row('gemma3:4b', 3.3, { cloudOnly: true })], 12), null);
  assert.equal(pickJustChatModel([row('gemma3:4b', null)], 12), null);
  assert.equal(pickJustChatModel([row('gemma3:4b', 3.3, { canDownload: false })], 12), null);
});

test('a card that holds nothing comfortably is offered nothing, not a model that will not run', () => {
  assert.equal(pickJustChatModel([row('qwen3:14b', 9.3, { installed: true })], 4), null);
});

test('Setup and Pick carry the door, and the download goes through the same consent', () => {
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /Just want to chat\?/);
  assert.match(wizard, /Skip the show: just let me chat/);
  const app = read('../src/App.tsx');
  assert.match(app, /requestThirdPartyModelDownloads\(\[row\]\);/);
  assert.match(app, /justChat=\{justChatForWizard\}\n\s*onJustChat=\{startJustChat\}/);
  // Declining or failing must not leave the app waiting to open a chat.
  assert.match(app, /if \(!stillComing\) setJustChatTarget\(null\);/);
});
