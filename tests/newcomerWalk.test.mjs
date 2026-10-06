// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { chooseLineup, isSpecialistModel, CHOOSE_FOR_ME_DOWNLOAD_GB } from '../src/lib/chooseLineup.ts';
import { hostLine } from '../src/lib/hostScript.ts';

/**
 * What a walk through Simple Mode from a fresh install found, as a newcomer
 * meets it (2026-10-06): "Choose for me" queued 56 GB, a safety classifier
 * topped the list, the host said all was well beside "We couldn't find
 * Ollama", and "Chat with" opened a card of terminal recipes over the chat.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const wizard = read('../src/components/SimpleWizard.tsx');
const app = read('../src/App.tsx');

const card = (name, sizeGb, installed = false) => ({ name, row: { displayName: name, sizeGb, installed } });

test('"Choose for me" keeps new downloads near 20 GB, taking smaller cards further down', () => {
  // The 12 GB card's list as the walk saw it: big ones first.
  const cards = [card('a', 6.9), card('b', 6.7), card('c', 6.6), card('d', 6.6), card('e', 6.5), card('f', 2.0), card('g', 1.3), card('h', 0.8)];
  const picks = chooseLineup(cards);
  const total = picks.reduce((sum, c) => sum + c.row.sizeGb, 0);
  assert.ok(total <= CHOOSE_FOR_ME_DOWNLOAD_GB, `${total} GB queued`);
  assert.deepEqual(picks.map((c) => c.name), ['a', 'b', 'f', 'g', 'h']);
});

test('"Choose for me" seats models already on the PC first, and never more than five', () => {
  const cards = [card('big', 9), card('mine', 4, true), card('small', 2), card('also-mine', 3, true)];
  assert.deepEqual(chooseLineup(cards).map((c) => c.name), ['mine', 'also-mine', 'big', 'small']);
  const many = Array.from({ length: 9 }, (_, i) => card(`m${i}`, 1, true));
  assert.equal(chooseLineup(many).length, 5);
});

test('"Choose for me" still seats two when every card is over the budget', () => {
  const cards = [card('huge', 30), card('large', 22), card('larger', 25)];
  assert.deepEqual(chooseLineup(cards).map((c) => c.name), ['large', 'larger']);
});

test('the Pick cards are what "Choose for me" chooses from, for the goal on screen', () => {
  assert.match(wizard, /onClick=\{\(\) => onChooseForMe\(filtered\)\}/);
  assert.match(wizard, /Not sure\? Choose for me/);
  assert.match(app, /chooseLineup\(cards\)/);
});

test('safety classifiers and document readers stay out of a newcomer\'s lineup', () => {
  for (const name of ['deepseek-ocr:3b', 'glm-ocr', 'granite4.1-guardian:8b', 'granite3-guardian', 'llama-guard3:8b', 'shieldgemma:9b', 'gpt-oss-safeguard:20b']) {
    assert.ok(isSpecialistModel(name), name);
  }
  for (const name of ['qwen3:14b', 'gemma3:4b', 'llama3.2:3b', 'granite4:3b', 'socrates:7b', 'mistral-small:22b']) {
    assert.ok(!isSpecialistModel(name), name);
  }
  assert.match(app, /canJoinComparison\(row\) && !isSpecialistModel\(row\.displayName\)/);
});

test('without Ollama, the host and the page say the same thing, and the safety note stays true', () => {
  assert.match(hostLine('setupNoOllama'), /needs Ollama/);
  assert.match(wizard, /setupAttempted && !ollamaReady \? hostLine\('setupNoOllama'\)/);
  // What the check found stays on screen when Ollama is missing.
  assert.match(wizard, /\{\(checked \|\| failed\) && !isScanning && \(/);
  // Directly under "Install Ollama for me" it said nothing gets installed.
  assert.match(wizard, /Ollama installs like any other program/);
  assert.doesNotMatch(wizard, /Nothing is installed system-wide/);
});

test('the computer check reports in plain words', () => {
  assert.doesNotMatch(app, /desktop bridge|preview fallback|Catalog fallback/);
  assert.match(app, /`Checked your computer\./);
});

test('the host warns about self-marking only when a judge marks its own answer', () => {
  assert.match(wizard, /progress\.questionJudge === progress\.currentModel/);
});

test('"Chat with" the winner opens the chat, not the victory card', () => {
  const body = app.slice(app.indexOf('const openChatWithWinner'), app.indexOf('const shareTarget'));
  assert.match(body, /openChatWith\(model\)/);
  assert.doesNotMatch(body, /setChosenModel/);
});
