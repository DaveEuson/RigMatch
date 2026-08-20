// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRendererSource } from '../scripts/renderer-source.mjs';


/**
 * The "Makes images" and "Makes video" filters, checked against what actually
 * exists rather than what the names suggest.
 *
 * Measured against a live Ollama and ollama.com: of the 14 models installed
 * here, the 233 in the library, and the 3 in the community namespace, "Makes
 * images" returned three — one of which, `x/canary`, matched only because the
 * rule accepted anything under `x/`. "Makes video" returned nothing anywhere,
 * because Ollama has no video generation to find.
 *
 * The matchers are lifted out of the source rather than imported, because
 * modelCatalog pulls in the whole app's module graph and these two functions
 * are pure string tests.
 */
function loadMatcher(name) {
  const src = fs.readFileSync('src/lib/modelCatalog.ts', 'utf8');
  const start = src.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} not found in modelCatalog.ts`);
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end + 2)
    .replace('export function', 'function')
    .replace(/\(([a-zA-Z]+): string\)/, '($1)')
    .replace(/\): boolean \{/, ') {');
  return new Function(`${body}\nreturn ${name};`)();
}

const isImage = loadMatcher('isLikelyImageGenerationModel');
const isVideo = loadMatcher('isLikelyVideoGenerationModel');

test('the real image generators on Ollama are recognised', () => {
  // The two that exist, as published in the community namespace.
  assert.equal(isImage('x/flux2-klein'), true);
  assert.equal(isImage('x/z-image-turbo'), true);
  // And the same models published anywhere else.
  assert.equal(isImage('flux2-klein:latest'), true);
  assert.equal(isImage('someone/stable-diffusion-3.5'), true);
  assert.equal(isImage('sdxl-turbo'), true);
});

test('living in the community namespace is not a capability', () => {
  // The bug: `x/` is Ollama's community namespace and says nothing about what
  // a model does. It made `x/canary` a third of everything "Makes images"
  // returned, and would mislabel every model added to that namespace.
  assert.equal(isImage('x/canary'), false);
  assert.equal(isImage('x/llama3.2'), false);
  assert.equal(isImage('x/some-random-finetune'), false);
});

test('models that read images are not confused with models that make them', () => {
  for (const name of ['deepseek-ocr:latest', 'bakllava:latest', 'gemma3:4b',
                      'qwen2.5-vl:7b', 'llava:13b', 'nomic-embed-text']) {
    assert.equal(isImage(name), false, `${name} reads or encodes, it does not generate`);
  }
});

test('nothing on Ollama satisfies "Makes video"', () => {
  // Searched for video, wan, ltx, cogvideo and hunyuan: every hit was a model
  // that *understands* video, or an unrelated name collision. The filter is
  // hidden while this is true, and returns on its own if that changes.
  for (const name of ['ahmadwaqar/smolvlm2-500m-video', 'ahmadwaqar/smolvlm2-256m-video',
                      'library/wizardlm2', 'SimonPu/Hunyuan-MT-Chimera-7B', 'Dreagonmon/hy-mt1.5']) {
    assert.equal(isVideo(name), false, `${name} is not a video generator`);
  }
});

test('a genuine video generator would still be recognised', () => {
  // So the hidden filter reappears the day one lands, rather than staying dead.
  for (const name of ['wan2.1-t2v', 'ltx-video', 'cogvideox-5b', 'mochi-1', 'hunyuan-video']) {
    assert.equal(isVideo(name), true, `${name} should match`);
  }
});

test('the chip is hidden by the catalogue, not deleted from the code', () => {
  // Deleting it would mean noticing by hand if video generation ever arrives.
  // Every renderer source, not App.tsx alone: this guard is about behaviour
  // that exists somewhere in the UI, and pinning it to one file made it fail
  // the moment ModelCabinet was extracted — a false alarm about a refactor
  // rather than a real regression.
  const app = readRendererSource();
  assert.match(app, /offerableTaskFilters/, 'chips should be filtered by what exists');
  assert.match(app, /rows\.some\(\(row\) => modelMatchesTask\(row, chip\.id\)\)/);
  assert.match(app, /chip\.id === taskFilter \|\|/, 'the active chip must never disappear under the user');

  const catalog = fs.readFileSync('src/lib/modelCatalog.ts', 'utf8');
  assert.match(catalog, /id: 'videogen'/, 'the chip definition stays, ready for when it can be filled');
});

// ── Capability-based detection ───────────────────────────────────────────────
//
// Ollama reports what a model can do from /api/show. Vocabulary observed on
// 0.32.9 against the models installed here:
//   x/flux2-klein  -> ['image']                  (note: no 'completion')
//   llama3.2:3b    -> ['completion', 'tools']
//   bakllava       -> ['completion', 'vision']
//   deepseek-ocr   -> ['completion', 'vision']

function loadCapabilityFns() {
  const src = fs.readFileSync('src/lib/modelCatalog.ts', 'utf8');
  const grab = (name) => {
    const start = src.indexOf(`export function ${name}(`);
    assert.ok(start >= 0, `${name} not found`);
    const end = src.indexOf('\n}', start);
    return src.slice(start, end + 2)
      .replace('export function', 'function')
      .replace(/\(row: CapabilityBearing\): boolean \{/, '(row) {')
      // The signature can carry an intersection type — the annotation runs to
      // the LAST "): boolean {" on the line, so match greedily.
      .replace(/\(row: CapabilityBearing & .+\): boolean \{/, '(row) {')
      .replace(/\(row: CapabilityBearing\): string\[\] \| null \{/, '(row) {')
      .replace(/\(model: string\): boolean \{/, '(model) {');
  };
  const body = ['getModelCapabilities', 'isLikelyImageGenerationModel', 'canGenerateText', 'isImageGenerationModel']
    .map(grab).join('\n');
  return new Function(`${body}\nreturn { getModelCapabilities, canGenerateText, isImageGenerationModel };`)();
}

const { canGenerateText, isImageGenerationModel } = loadCapabilityFns();

test('what the provider reports beats what the name suggests', () => {
  // A model called "canary" that reports completion is a chat model, whatever
  // namespace it sits in — and this is the case the name rule got wrong.
  const canary = { displayName: 'x/canary', capabilities: ['completion'] };
  assert.equal(isImageGenerationModel(canary), false);
  assert.equal(canGenerateText(canary), true);

  // And a model whose name says nothing is still caught when it reports image.
  const unnamed = { displayName: 'x/mystery-model', capabilities: ['image'] };
  assert.equal(isImageGenerationModel(unnamed), true);
});

test('an image model is kept out of anything that would ask it to answer', () => {
  // Measured on 0.32.9: generating returns "image generation models are not
  // currently supported" and chatting returns "does not support chat". Ollama
  // distributes them without being able to run them, so offering one means a
  // guaranteed failure scored against the model.
  const flux = { displayName: 'x/flux2-klein', capabilities: ['image'] };
  assert.equal(canGenerateText(flux), false, 'must never reach a benchmark or a chat');
  assert.equal(isImageGenerationModel(flux), true);
});

test('capabilities are read from the installed model when the row carries one', () => {
  const row = { displayName: 'something', installedModel: { capabilities: ['image'] } };
  assert.equal(isImageGenerationModel(row), true);
  assert.equal(canGenerateText(row), false);
});

test('models that can answer are recognised as such', () => {
  for (const caps of [['completion'], ['completion', 'tools'], ['completion', 'vision']]) {
    const row = { displayName: 'whatever', capabilities: caps };
    assert.equal(canGenerateText(row), true, `${caps} should be runnable`);
    assert.equal(isImageGenerationModel(row), false);
  }
});

test('a provider that reports nothing falls back to the name, not to a refusal', () => {
  // The browsable catalogue cannot be asked, and an older Ollama has no
  // capabilities field. Assuming "cannot run" there would empty the app.
  assert.equal(canGenerateText({ displayName: 'llama3.2:3b' }), true);
  assert.equal(canGenerateText({ displayName: 'mistral:7b', capabilities: [] }), true);
  assert.equal(canGenerateText({ displayName: 'x/flux2-klein' }), false, 'the name still catches known generators');
  assert.equal(isImageGenerationModel({ displayName: 'x/canary' }), false);
});

test('only models that report audio are offered a listening test', () => {
  // Verified on 0.32.9: gemma4:e2b reports 'audio' and transcribed a 42-word
  // passage at 90/100. gemma3:4b reports 'vision' but not 'audio', and the
  // identical request failed with "Failed to load image or audio file" — a
  // guaranteed error that would be scored against the model.
  const src = fs.readFileSync('src/lib/modelCatalog.ts', 'utf8');
  const start = src.indexOf('export function canHearAudio(');
  assert.ok(start >= 0, 'canHearAudio not found');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end + 2)
    .replace('export function', 'function')
    .replace(/\(row: CapabilityBearing\): boolean \{/, '(row) {');
  const getCaps = 'function getModelCapabilities(row) { const r = row.capabilities ?? row.installedModel?.capabilities; return Array.isArray(r) && r.length > 0 ? r : null; }';
  const canHearAudio = new Function(`${getCaps}\n${body}\nreturn canHearAudio;`)();

  assert.equal(canHearAudio({ capabilities: ['completion', 'vision', 'audio', 'tools', 'thinking'] }), true, 'gemma4:e2b');
  assert.equal(canHearAudio({ capabilities: ['completion', 'vision'] }), false, 'gemma3:4b reads images but cannot hear');
  assert.equal(canHearAudio({ capabilities: ['completion', 'tools'] }), false);
  // No name fallback: nothing in a name reliably says a model can hear, and
  // guessing wrong produces the 400.
  assert.equal(canHearAudio({ displayName: 'some-audio-model:7b' }), false);
  assert.equal(canHearAudio({}), false);
});
