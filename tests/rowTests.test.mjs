// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { rowSkillTest } = await import('../src/lib/rowTests.ts');

/**
 * A model's own Test runs the test of the channel it is on: the listening test
 * on Listens to audio, a test picture on Reads images. A model that cannot take
 * the channel's test keeps the questions, rather than being offered a test that
 * must fail.
 */

const hears = { displayName: 'gemma4:e2b', capabilities: ['completion', 'vision', 'audio'] };
const sees = { displayName: 'qwen3.5:9b', capabilities: ['completion', 'vision'] };
const chats = { displayName: 'mistral:7b', capabilities: ['completion'] };

test('on Listens to audio, a model that can hear is played the listening test', () => {
  assert.equal(rowSkillTest('listening', hears, true), 'listening');
});

test('on Reads images, a model that can see is shown a test picture', () => {
  assert.equal(rowSkillTest('reading', sees, true), 'reading');
  // A model that can do both takes whichever the channel is about.
  assert.equal(rowSkillTest('reading', hears, true), 'reading');
});

test("a model that cannot take the channel's test keeps the questions", () => {
  assert.equal(rowSkillTest('listening', sees, true), null);
  assert.equal(rowSkillTest('reading', chats, true), null);
});

test('every other channel keeps the questions', () => {
  for (const channel of ['all', 'chat', 'code', 'images', 'video']) {
    assert.equal(rowSkillTest(channel, hears, true), null, channel);
  }
});

test('only a model on this machine, and only through Ollama', () => {
  assert.equal(rowSkillTest('listening', hears, false), null);
  assert.equal(rowSkillTest('listening', { ...hears, localProvider: 'lm-studio' }, true), null);
  assert.equal(rowSkillTest('reading', { ...sees, runtime: 'comfyui' }, true), null);
});

test('with nothing reported, a vision name still counts, but hearing never comes from a name', () => {
  assert.equal(rowSkillTest('reading', { displayName: 'llama3.2-vision:11b' }, true), 'reading');
  assert.equal(rowSkillTest('listening', { displayName: 'whisper-large:latest' }, true), null);
});
