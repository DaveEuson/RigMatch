import test from 'node:test';
import assert from 'node:assert/strict';

// The module chain reaches api.ts, which picks its bridge off `window` when it
// loads. Nothing here calls the bridge; this just lets the import succeed
// outside a browser.
globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };

const { judgeCandidates, imagePromptById, toLabResult } = await import('../src/lib/imageGenChallenge.ts');
const { IMAGE_BENCHMARK_PROMPTS } = await import('../src/lib/imageGenScoring.ts');

const vision = (name) => ({ name, capabilities: ['completion', 'vision'] });
const text = (name) => ({ name, capabilities: ['completion'] });

test('only models that can see are offered as judges', () => {
  const judges = judgeCandidates([text('qwen2.5:7b'), vision('gemma3:4b'), text('mistral:7b')]);
  assert.deepEqual(judges, ['gemma3:4b']);
});

test('an OCR specialist never becomes the default judge', () => {
  // It carries the vision capability and will answer, but it is built to read
  // documents rather than to say whether a lighthouse is red — and the first
  // entry here is what most runs are scored by.
  const judges = judgeCandidates([vision('deepseek-ocr:latest'), vision('gemma3:4b')]);
  assert.equal(judges[0], 'gemma3:4b');
  assert.ok(judges.includes('deepseek-ocr:latest'), 'it should still be selectable');
});

test('the llava family never becomes the default judge', () => {
  // Measured against a generated lighthouse: asked "is there a lighthouse?
  // answer only Yes or No", gemma3:4b said "Yes" and bakllava said "1". An
  // unreadable answer scores nothing, so defaulting to bakllava would report
  // every run unjudged on a machine that also had gemma3:4b answering fine.
  const judges = judgeCandidates([vision('bakllava:latest'), vision('gemma3:4b')]);
  assert.equal(judges[0], 'gemma3:4b');
  assert.ok(judges.includes('bakllava:latest'), 'it should still be selectable');
});

test('a weak judge is still offered when it is all there is', () => {
  const judges = judgeCandidates([vision('deepseek-ocr:latest'), text('mistral:7b')]);
  assert.deepEqual(judges, ['deepseek-ocr:latest']);
});

test('a machine with no vision model offers no judge rather than a blind one', () => {
  assert.deepEqual(judgeCandidates([text('qwen2.5:7b')]), []);
});

test('the reported capability beats the name', () => {
  // "llava" looks like a vision model, but if the provider says it cannot see,
  // believe the provider — guessing produces a judge that never looked.
  assert.deepEqual(judgeCandidates([{ name: 'llava:7b', capabilities: ['completion'] }]), []);
});

test('an unknown prompt id falls back rather than crashing a run', () => {
  assert.equal(imagePromptById('nonsense').id, IMAGE_BENCHMARK_PROMPTS[0].id);
  assert.equal(imagePromptById(undefined).id, IMAGE_BENCHMARK_PROMPTS[0].id);
});

test('the saved result credits the checkpoint, not the judge', () => {
  // The checkpoint drew the picture. Recording the Ollama judge here would
  // attribute the image to a model that only looked at it.
  const saved = toLabResult({
    checkpoint: 'sd15.safetensors',
    score: 90, grade: 'A', judged: true, adherence: 0.8,
    elapsedMs: 2400, steps: 20, checks: [],
  }, 'kitchen');

  assert.equal(saved.model, 'sd15.safetensors');
  assert.equal(saved.challenge, 'image-generation');
  assert.equal(saved.response, imagePromptById('kitchen').prompt);
});
