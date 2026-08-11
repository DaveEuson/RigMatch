import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /offerableTaskFilters/, 'chips should be filtered by what exists');
  assert.match(app, /rows\.some\(\(row\) => modelMatchesTask\(row, chip\.id\)\)/);
  assert.match(app, /chip\.id === taskFilter \|\|/, 'the active chip must never disappear under the user');

  const catalog = fs.readFileSync('src/lib/modelCatalog.ts', 'utf8');
  assert.match(catalog, /id: 'videogen'/, 'the chip definition stays, ready for when it can be filled');
});
