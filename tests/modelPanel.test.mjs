// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { describeAbilities, describeFitPlainly, getSelectedContestantBlurb, getHardwareFit } from '../src/lib/modelCatalog.ts';
import { describeQuantization } from '../src/lib/modelVariants.ts';

/**
 * The Models panel, set beside LM Studio's page for the same model, said less
 * and said it in jargon: "Sweet spot" where LM Studio says "Full GPU Offload
 * Possible", no quantization on the download, nothing about tools or images,
 * nothing about what the model is for, and the headroom sentence twice.
 */
const NBSP = ' ';
const row = (extra = {}) => ({
  id: 'llama3.2:3b',
  name: 'llama3.2',
  tag: '3b',
  displayName: 'llama3.2:3b',
  params: '3B',
  sizeGb: 2,
  installed: true,
  ready: true,
  ...extra,
});

test('the fit says what will happen on this card, with the numbers', () => {
  assert.equal(describeFitPlainly(row(), 12), `Runs fully on your graphics card, with room to spare (2${NBSP}GB${NBSP}of${NBSP}12${NBSP}GB)`);
  assert.equal(describeFitPlainly(row({ sizeGb: 9 }), 12), `Runs fully on your graphics card (9${NBSP}GB${NBSP}of${NBSP}12${NBSP}GB)`);
  assert.match(describeFitPlainly(row({ sizeGb: 11 }), 12), /^Only just fits on your graphics card/);
  assert.match(describeFitPlainly(row({ sizeGb: 13 }), 12), /^Bigger than your graphics card, so part of it runs on the processor and it is slower/);
  assert.match(describeFitPlainly(row({ sizeGb: 40, params: '70B' }), 12), /^Too big for this PC/);
  assert.equal(describeFitPlainly(row({ sizeGb: null }), 12), 'Its size is unknown, so RigMatch cannot tell yet');
  assert.equal(describeFitPlainly(row({ sizeGb: 3 }), 0), 'Small enough to try. RigMatch could not read your graphics card');
});

test('the plain fit agrees with the rating it replaces', () => {
  // Same thresholds as getHardwareFit, so the panel never says "runs fully"
  // beside a table pill that says "Tight".
  for (const sizeGb of [1, 6.9, 7, 9.6, 9.7, 12, 13.8, 14]) {
    const tone = getHardwareFit(row({ sizeGb }), 12).tone;
    const plain = describeFitPlainly(row({ sizeGb }), 12);
    if (tone === 'sweet-spot' || tone === 'good') assert.match(plain, /^Runs fully/, `${sizeGb} GB`);
    else assert.doesNotMatch(plain, /^Runs fully/, `${sizeGb} GB`);
  }
});

test('what a model can do comes from its provider, in plain words', () => {
  assert.deepEqual(describeAbilities(row({ installedModel: { capabilities: ['completion', 'tools'] } })), ['Chat', 'Uses tools']);
  assert.deepEqual(
    describeAbilities(row({ displayName: 'gemma3:4b', installedModel: { capabilities: ['completion', 'vision'] } })),
    ['Chat', 'Sees images'],
  );
  assert.deepEqual(describeAbilities(row({ installedModel: { capabilities: ['completion', 'tools', 'thinking'] } })), ['Chat', 'Uses tools', 'Thinks before answering']);
});

test('a model that cannot chat says so instead of claiming it can', () => {
  assert.deepEqual(describeAbilities(row({ displayName: 'nomic-embed-text:latest', installedModel: { capabilities: ['embedding'] } })), ['Turns text into search data. It does not chat']);
  assert.deepEqual(
    describeAbilities(row({ displayName: 'starcoder2:3b', installedModel: { capabilities: ['completion'], chatFormat: false } })),
    ['Completes text, but cannot chat'],
  );
  assert.deepEqual(describeAbilities(row({ generationKind: 'image' })), ['Makes images']);
  assert.deepEqual(describeAbilities(row({ displayName: 'x/flux2-klein:latest', installedModel: { capabilities: ['image'] } })), ['Makes images']);
});

test('a model is described the same before and after it is installed', () => {
  // Nothing reports a chat format until a model is installed, so the catalog
  // said "Chat" for starcoder2 and "cannot chat" once it had downloaded.
  const notInstalled = { installed: false, ready: false, installedModel: undefined, capabilities: ['completion'] };
  assert.deepEqual(describeAbilities(row({ displayName: 'starcoder2:3b', ...notInstalled })), ['Completes text, but cannot chat']);
  assert.deepEqual(describeAbilities(row({ displayName: 'codegemma:2b', ...notInstalled })), ['Completes text, but cannot chat']);
  assert.deepEqual(describeAbilities(row({ displayName: 'deepseek-ocr:3b', ...notInstalled, capabilities: ['completion', 'vision'] })), ['Reads the text in pictures. It does not chat']);
  assert.deepEqual(describeAbilities(row({ displayName: 'codegemma:7b', ...notInstalled })), ['Chat'], 'only the 2b is completion-only');
});

test('a model ruled out on its size class does not quote numbers that say it fits', () => {
  const said = describeFitPlainly(row({ displayName: 'llama3.3:70b-instruct-q2_K', params: '70B', sizeGb: 26 }), 32);
  assert.equal(said, 'Too big for this PC: a 70B model needs a much bigger graphics card');
  assert.doesNotMatch(said, /26/);
});

test('an installed model\'s quantization is explained like a tag\'s', () => {
  assert.equal(describeQuantization('Q4_K_M').label, 'Q4_K_M');
  assert.match(describeQuantization('Q4_K_M').plain, /Most people should take this one/);
  assert.match(describeQuantization('Q8_0').plain, /Barely squeezed/);
  assert.match(describeQuantization('IQ3_XS').plain, /Squeezed down a long way/);
  assert.match(describeQuantization('F16').plain, /Not squeezed down/);
  assert.match(describeQuantization('BF16').plain, /Not squeezed down/);
  assert.equal(describeQuantization(undefined), null);
  assert.equal(describeQuantization('MXFP4'), null, 'nothing rather than a guess');
});

test('the headroom sentence is said once, on the Fit line', () => {
  const fit = getHardwareFit(row(), 12);
  const blurb = getSelectedContestantBlurb(row(), { archetype: '', specialties: [] }, undefined, fit);
  assert.equal(blurb, 'llama3.2:3b is installed and ready to test.');
  assert.doesNotMatch(blurb, /headroom/);
  const panel = readFileSync(new URL('../src/components/SelectedContestantCard.tsx', import.meta.url), 'utf8');
  assert.match(panel, /\{fitCaution && <span>\{fitCaution\}<\/span>\}/, 'the caution under the fit is only for a fit that needs one');
  assert.match(panel, /row\.description && <p className="contestant-description">/, 'what it is for, from its Ollama page');
  assert.match(panel, /<dt>Can do<\/dt>/);
});
