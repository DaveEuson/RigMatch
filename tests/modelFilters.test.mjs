import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };

const {
  canGenerateText,
  canHearAudio,
  canJoinComparison,
  canWatchVideo,
  isGoodScore,
  isLikelyAudioGenerationModel,
  isLowScore,
  getModelSearchText,
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

test('a generation checkpoint can never qualify for a text benchmark', () => {
  // canGenerateText assumes unknown capabilities are runnable so that Ollama
  // catalogue entries are not excluded — and a ComfyUI row has no capabilities
  // field, so that default quietly qualified Stable Diffusion for a
  // conversation benchmark. "Choose for me" would then have seated it, and the
  // run would have asked Ollama for a model it has never heard of.
  const sd15 = { displayName: 'Stable Diffusion 1.5', name: 'Stable Diffusion 1.5', generationKind: 'image' };
  assert.equal(canGenerateText(sd15), false);
});

test('the comparison door turns away anything without the shared floor', () => {
  // The comparison grades one thing every contestant claims: conversation.
  // Differing extras (vision, audio) do not block entry — those simply are not
  // what is being graded.
  const comfy = { displayName: 'LTX-Video 2B (distilled)', runtime: 'comfyui', generationKind: 'video', installed: true };
  const textModel = { displayName: 'llama3.2:3b', installed: true, capabilities: ['completion'] };
  const visionModel = { displayName: 'gemma3:4b', installed: true, capabilities: ['completion', 'vision'] };
  const embedder = { displayName: 'nomic-embed-text', installed: true };
  assert.equal(canJoinComparison(comfy), false);
  assert.equal(canJoinComparison(textModel), true);
  assert.equal(canJoinComparison(visionModel), true, 'extra capabilities are not a reason to exclude');
  assert.equal(canJoinComparison(embedder), false);
});

test('searching the words a person types finds the capability', () => {
  // The cold walkthrough typed "audio" and got "no contestants match" for a
  // machine holding a model that hears. The haystack now carries capability
  // words and their everyday synonyms.
  const hearer = {
    displayName: 'gemma4:e2b', name: 'gemma4:e2b', id: 'gemma4:e2b', tag: 'e2b',
    params: '4B', sizeGb: 5.3, pack: 'Live', source: 'Ollama library', live: true,
    installed: true, ready: true, installLabel: 'Installed',
    capabilities: ['completion', 'audio'],
  };
  const haystack = getModelSearchText(hearer, false);
  for (const term of ['audio', 'hears', 'transcribe']) {
    assert.ok(haystack.includes(term), `"${term}" not searchable`);
  }
});

test('a generation row is findable by what it makes and what runs it', () => {
  const ltx = {
    displayName: 'LTX-Video 2B (distilled)', name: 'LTX-Video 2B (distilled)',
    id: 'comfyui/ltxv-distilled', tag: 'video', params: 'Video model', sizeGb: 6.34,
    pack: 'Generation', source: 'Hugging Face', live: true, installed: false,
    ready: false, installLabel: 'Download', runtime: 'comfyui',
    generationId: 'ltxv-distilled', generationKind: 'video', publisher: 'Lightricks',
  };
  const haystack = getModelSearchText(ltx, false);
  for (const term of ['comfyui', 'makes video', 'lightricks']) {
    assert.ok(haystack.includes(term), `"${term}" not searchable`);
  }
});

test('the developer filter groups a generation row under its publisher', async () => {
  // Keyed on the name, all six generation rows grouped as "Unknown model
  // family" while their rows displayed Lightricks and Stability AI — the
  // filter contradicted the very column it filters.
  const { getRowDeveloper, getDeveloperFilterOptions } = await import('../src/lib/modelOrigins.ts');
  const ltx = { displayName: 'LTX-Video 2B (distilled)', publisher: 'Lightricks' };
  assert.equal(getRowDeveloper(ltx).label, 'Lightricks');

  const options = getDeveloperFilterOptions([
    { displayName: 'LTX-Video 2B (distilled)', publisher: 'Lightricks' },
    { displayName: 'llama3.2:3b' },
  ]);
  const labels = options.map((o) => o.label);
  assert.ok(labels.includes('Lightricks'), `got ${labels.join(', ')}`);
  assert.ok(!labels.some((l) => /unknown model family/i.test(l)) || labels.includes('Meta'),
    'a publisher row must not fall into the unknown bucket');
});

test('grouping and matching agree, so clicking the chip finds the row', async () => {
  const { getRowDeveloper } = await import('../src/lib/modelOrigins.ts');
  const ltx = { displayName: 'LTX-Video 2B (distilled)', publisher: 'Lightricks' };
  // The chip id built from the options must equal the id the row matcher
  // computes, or the filter shows a chip that selects nothing.
  assert.equal(getRowDeveloper(ltx).id, 'lightricks');
});

test('the benchmark blocker turns away a generation row before the host check', async () => {
  // The detail panel's TEST MODEL calls startBenchmark, which consults only
  // this blocker — the row action cell and the shortlist were gated, this
  // third door was not, and the run would ask Ollama for a checkpoint.
  const { getModelBenchmarkBlocker } = await import('../src/lib/modelCatalog.ts');
  const ready = { ready: true, baseUrl: 'http://127.0.0.1:11434', version: '0.32.9', pingMs: 1, models: [], error: null };
  const comfyRow = { displayName: 'LTX-Video 2B (distilled)', runtime: 'comfyui', generationKind: 'video', installed: true };
  const blocker = getModelBenchmarkBlocker(comfyRow, undefined, ready);
  assert.ok(blocker, 'a checkpoint must be blocked even when Ollama is ready');
  assert.match(blocker, /draws instead of chatting|Run it from the Lab/);
});

test('an ordinary model is still testable', async () => {
  const { getModelBenchmarkBlocker } = await import('../src/lib/modelCatalog.ts');
  const ready = { ready: true, baseUrl: 'http://127.0.0.1:11434', version: '0.32.9', pingMs: 1, models: [], error: null };
  const chat = { displayName: 'llama3.2:3b', installed: true, capabilities: ['completion'] };
  assert.equal(getModelBenchmarkBlocker(chat, undefined, ready), null);
});
