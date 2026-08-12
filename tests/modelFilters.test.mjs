import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };

const {
  canHearAudio,
  canWatchVideo,
  isGoodScore,
  isLikelyAudioGenerationModel,
  isLowScore,
  modelMatchesQuickFilter,
  modelMatchesTask,
} = await import('../src/lib/modelCatalog.ts');
const { MATCH_GRADE_BANDS } = await import('../src/lib/scoring.ts');

const row = (displayName, capabilities) => ({ displayName, name: displayName, capabilities, installed: true });
const scored = (total) => ({ model: 'x', total, grade: 'B', speed: 80, sobriety: 80, fit: 80, completedAt: '' });

test('Hears audio matches only what the provider reports, never the name', () => {
  // A name-based guess produces "Failed to load image or audio file" on the
  // scorecard of a model that was never able to hear.
  assert.ok(modelMatchesTask(row('gemma4:e2b', ['completion', 'audio']), 'hears'));
  assert.ok(!modelMatchesTask(row('whisper-style:3b', ['completion']), 'hears'));
  assert.ok(!modelMatchesTask(row('audio-sounding-name:7b', undefined), 'hears'));
});

test('Watches video lights up on a provider capability the day it exists', () => {
  assert.ok(canWatchVideo(row('some-model', ['completion', 'video'])));
});

test('ordinary vision models are not claimed to watch video', () => {
  // -vl models read frames as stills, and Ollama's API cannot send video at
  // all. Matching them is the "Makes images: 0 models" lie with a new face.
  assert.ok(!canWatchVideo(row('qwen2.5-vl:7b', ['completion', 'vision'])));
  assert.ok(!canWatchVideo(row('gemma3:4b', ['completion', 'vision'])));
  assert.ok(canWatchVideo(row('llava-next-video:7b', ['completion', 'vision'])));
  assert.ok(canWatchVideo(row('videollama3:8b', undefined)));
});

test('Makes audio finds speakers, not listeners', () => {
  assert.ok(isLikelyAudioGenerationModel('kokoro-tts:82m'));
  assert.ok(isLikelyAudioGenerationModel('orpheus:3b'));
  assert.ok(!isLikelyAudioGenerationModel('whisper-large-v3'));
  assert.ok(!isLikelyAudioGenerationModel('llama3.2:3b'));
});

test('the word-boundary alternatives really are word boundaries', () => {
  // These specific branches shipped once as literal backspace characters —
  // the escaping collapsed in tooling — and every other test still passed,
  // because none exercised them. Each assertion here fails against a backspace.
  assert.ok(isLikelyAudioGenerationModel('some-tts:1b'), 'tts as a word');
  assert.ok(isLikelyAudioGenerationModel('bark:small'), 'bark as a word');
  assert.ok(!isLikelyAudioGenerationModel('battts-nonsense'), 'tts inside a word');
  assert.ok(!isLikelyAudioGenerationModel('embarking:7b'), 'bark inside a word');
  assert.ok(canWatchVideo(row('apollo:7b', undefined)), 'apollo as a word');
  assert.ok(!canWatchVideo(row('apollonius:7b', undefined)), 'apollo inside a word');
});

test('the good-score line is where a B begins, taken from the grade bands', () => {
  const bMin = MATCH_GRADE_BANDS.find((band) => band.grade === 'B').min;
  assert.ok(isGoodScore(scored(bMin)));
  assert.ok(!isGoodScore(scored(bMin - 1)));
  assert.ok(isLowScore(scored(bMin - 1)));
  assert.ok(!isLowScore(scored(bMin)));
});

test('unscored is not a verdict: it matches neither score filter', () => {
  // "Below B" must mean measured-and-poor. A model nobody has tested is not
  // a bad model, it is an untested one, and it already has its own filter.
  assert.ok(!isGoodScore(undefined));
  assert.ok(!isLowScore(undefined));
  const untested = row('never-tested:7b', undefined);
  assert.ok(!modelMatchesQuickFilter(untested, 'good-score', undefined, 12));
  assert.ok(!modelMatchesQuickFilter(untested, 'low-score', undefined, 12));
});

test('the score filters read through modelMatchesQuickFilter', () => {
  const r = row('tested:7b', undefined);
  assert.ok(modelMatchesQuickFilter(r, 'good-score', scored(90), 12));
  assert.ok(modelMatchesQuickFilter(r, 'low-score', scored(50), 12));
});

test('a catalogue model carries the library listing, so uninstalled models count', () => {
  // The chips previously matched installed models only — /api/show answers
  // about downloads and nothing else — so "Hears audio" read 1 against a
  // 317-model catalogue and looked like a claim about the world.
  const notInstalled = { displayName: 'gemma4:e2b', name: 'gemma4:e2b', capabilities: ['completion', 'audio'], installed: false };
  assert.ok(modelMatchesTask(notInstalled, 'hears'));
});

test('an installed model report beats the library listing', () => {
  // The library lists a family; /api/show describes the actual file. A family
  // listed as hearing does not prove its smallest tag does.
  const row = {
    displayName: 'somefamily:0.5b',
    name: 'somefamily:0.5b',
    capabilities: ['completion', 'audio'],          // what the library says
    installedModel: { capabilities: ['completion'] }, // what this file says
  };
  assert.ok(!canHearAudio(row), 'the installed report must win');
});

test('a model with neither source still matches nothing rather than guessing', () => {
  assert.ok(!canHearAudio({ displayName: 'audio-sounding-name:7b', name: 'audio-sounding-name:7b' }));
});
