// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { describeRunFailure, showStoppedMessage } from '../src/lib/runFailure.ts';
import { getModelScore } from '../src/lib/modelCatalog.ts';

/**
 * Found by a bug scan after LM Studio models started appearing in Simple Mode
 * and winning shows: the flows around them still assumed Ollama.
 */
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const wizard = readFileSync(new URL('../src/components/SimpleWizard.tsx', import.meta.url), 'utf8');
const dialogs = readFileSync(new URL('../src/components/dialogs.tsx', import.meta.url), 'utf8');
const modelPage = readFileSync(new URL('../src/components/ModelPage.tsx', import.meta.url), 'utf8');

test('a failed run names the program the model runs in', () => {
  assert.equal(describeRunFailure('Error: Cannot reach local AI service at http://127.0.0.1:1234.', 'LM Studio').reason, 'The connection to LM Studio was lost.');
  assert.match(describeRunFailure('Error: 400 Bad Request from http://127.0.0.1:1234/api/v1/chat: something odd', 'LM Studio').reason, /^LM Studio reported: something odd$/);
  assert.equal(describeRunFailure('Error: Cannot reach local AI service at http://127.0.0.1:11434.').reason, 'The connection to Ollama was lost.', 'Ollama by default, as before');
  // The address used to be cut at its port's colon, leaving "11434/api/generate:" in front.
  assert.equal(describeRunFailure('Error: 500 Internal Server Error from http://127.0.0.1:11434/api/generate: llama runner exploded').reason, 'Ollama reported: llama runner exploded');
});

test('a model ejected in LM Studio mid-show is said plainly, not as a 500', () => {
  // Measured on a real LM Studio: unloading during a show returns this.
  const said = describeRunFailure("Error invoking remote method 'benchmark:run': Error: 500 Internal Server Error from http://127.0.0.1:1234/api/v1/chat: Model unloaded by user or API request.", 'LM Studio');
  assert.equal(said.reason, 'It was unloaded in LM Studio partway through. Run it again, and leave it loaded until the test ends.');
});

test('a show that lost its provider names it, and both when both went', () => {
  const failures = [{ model: 'llama-3.2-3b-instruct', kind: 'unreachable', reason: '' }];
  const providerOf = (model) => (model.includes(':') ? 'Ollama' : 'LM Studio');
  assert.match(showStoppedMessage(failures, false, (m) => m, providerOf).message, /^The connection to LM Studio was lost before any model finished\. Check that LM Studio is still running/);
  const both = [...failures, { model: 'llama3.2:3b', kind: 'unreachable', reason: '' }];
  assert.match(showStoppedMessage(both, false, (m) => m, providerOf).message, /LM Studio and Ollama was lost .* Check that both are still running/);
  assert.match(showStoppedMessage([{ model: 'x:1b', kind: 'unreachable', reason: '' }], false, (m) => m).message, /Check that Ollama is still running/);
});

test('an untested LM Studio model does not borrow a newer release\'s score', () => {
  const scores = { 'qwen/qwen3-4b-2507': { model: 'qwen/qwen3-4b-2507', total: 88 } };
  assert.equal(getModelScore({ displayName: 'qwen/qwen3-4b', name: 'qwen/qwen3-4b', tag: 'latest' }, scores), undefined);
  // The rule it was written for still holds: a more specific Ollama tag.
  const tagged = { 'qwen2.5:7b-instruct': { model: 'qwen2.5:7b-instruct', total: 90 } };
  assert.equal(getModelScore({ displayName: 'qwen2.5:7b', name: 'qwen2.5', tag: '7b' }, tagged)?.total, 90);
});

test('Simple Mode offers no downloads without Ollama, and LM Studio models in every round', () => {
  assert.match(app, /\.filter\(\(row\) => row\.installed \|\| ollama\.ready\)/);
  assert.doesNotMatch(app, /row\.localProvider !== 'lm-studio'\)/);
  assert.match(app, /lmStudioOnly=\{!ollama\.ready && lmStudio\.ready\}/);
  assert.match(wizard, /<FoundRow label="LM Studio" value="Found and running/);
  assert.match(wizard, /lmStudioOnly \? \(/, 'the setup screen no longer says Ollama is running when only LM Studio is');
});

test('skill rounds run LM Studio models on LM Studio, and their judge on its own program', () => {
  assert.match(app, /for \(const model of models\) \{/);
  assert.doesNotMatch(app, /sit it out/);
  // Every runner is sent the model's own address, never Ollama's by default.
  for (const runner of ['runAdvancedAppBuilderChallenge', 'runCodeChallenge', 'runAdvancedVisionChallenge', 'runAdvancedListeningChallenge']) {
    assert.doesNotMatch(app, new RegExp(`${runner}\\(\\s*(job\\.)?model, ollama\\.baseUrl`), runner);
  }
  assert.match(app, /baseUrl: judgeEndpoints\[effectiveJudge\.model\]\?\.baseUrl \?\? ollama\.baseUrl/);
});

test('Chat with an LM Studio model opens the app\'s own chat, and the winner\'s buttons act on the winner', () => {
  assert.match(app, /if \(isDesktopRuntime && !inLmStudio\) \{\s*void agentArcadeApi\.openChatApp\(\)/);
  assert.match(app, /const model = wizardWinner\?\.model \?\? topRigPick\?\.row\.displayName;/);
  assert.match(app, /\{shareWinnerOpen && shareTarget && \(/);
  assert.match(app, /onChat=\{\(\) => openChatWith\(selectedModel\)\}/);
  assert.doesNotMatch(modelPage, /openChatApp/, 'the model page goes through the same chooser');
});

test('the match window gives LM Studio\'s instructions for an LM Studio match', () => {
  assert.match(dialogs, /inLmStudio \? `lms load \$\{model\}` : `ollama run \$\{model\}`/);
  assert.match(dialogs, /'localhost:1234\/v1' : 'localhost:11434\/v1'/);
  assert.match(dialogs, /import lmstudio as lms/);
  assert.doesNotMatch(dialogs, /models and Ollama settings are unchanged/, 'the line under the picture too');
  assert.match(app, /inLmStudio=\{modelRows\.find\(\(r\) => r\.displayName === chosenModel\)\?\.localProvider === 'lm-studio'\}/);
});
