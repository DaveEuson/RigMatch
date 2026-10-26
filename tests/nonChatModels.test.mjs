// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { NON_CHAT_NOTE, nonChatKind, isLikelyAudioGenerationModel } from '../src/lib/modelKind.ts';
import {
  canGenerateText, canJoinComparison, canSeatInSimplePick, describeAbilities, getHardwareFit, getModelDreamTags,
  getModelGoodForTags, isEmbeddingModel, mergeModelRows, modelMatchesTask, textJudgeCandidates,
} from '../src/lib/modelCatalog.ts';
import { pickJustChatModel } from '../src/lib/justChat.ts';
import { catalogRows, formatTable, inDefaultList, rankModels, toJson } from '../cli/fitCheck.ts';

const require = createRequire(import.meta.url);
const { applyCapabilitySnapshot, parseOllamaFamilyFacts } = require('../electron/ollamaCatalog.cjs');
const shipped = require('../electron/ollamaCapabilities.json');

/**
 * Speech and decision models were listed, graded and seated like chat models
 * (a scan of Ollama's library on 2026-10-26 found phonon, d3 and kev doing it,
 * and kev was the first card on Simple Mode's Pick screen). These run the real
 * functions on the pages' own wording: the families below are the ones the scan
 * read, with the descriptions and badges ollama.com showed that day.
 */

const text = { inputs: ['text'] };
const textImage = { inputs: ['text', 'image'] };
const FAMILIES = {
  phonon: {
    badges: [],
    description: 'Phonon is Gradium’s text-to-speech family. It turns written text into spoken audio as it generates, making it useful for reading assistant replies, narrating passages, and adding a voice to local apps.',
    sizes: { latest: { ...text, sizeGb: 0.1 }, en: { ...text, sizeGb: 0.1 }, '31m-en': { ...text, sizeGb: 0.1 } },
  },
  d3: {
    badges: ['vision', 'decision'],
    description: 'Turn text, structured data, and images into scored choices, yes/no answers, and ratings.',
    sizes: { latest: { ...textImage, sizeGb: 5.6 }, '2b': { ...textImage, sizeGb: 3.1 }, '4b': { ...textImage, sizeGb: 5.6 }, '9b': { ...textImage, sizeGb: 10 }, '27b': { ...textImage, sizeGb: 29 } },
  },
  kev: {
    badges: ['decision'],
    description: 'Kev scores answers to structured questions about a supplied text state in a single forward pass.',
    sizes: { latest: { ...text, sizeGb: 5.6 } },
  },
  // d1-omni's page shows only a vision badge: the description is all there is.
  'd1-omni': {
    badges: ['vision'],
    description: 'd1-omni is a multimodal 600M decision model from Liquid AI',
    sizes: { latest: { ...textImage, sizeGb: 0.85 }, '600m': { ...textImage, sizeGb: 0.85 } },
  },
  // nimble's page, as the October 4 snapshot read it, before decision was a badge RigMatch kept.
  nimble: {
    badges: ['tools', 'thinking'],
    description: 'A 9B decision model from Bespoke Labs for fast, typed classification.',
    sizes: { latest: { ...text, sizeGb: 5.6 }, '9b': { ...text, sizeGb: 5.6 } },
  },
  tev1: {
    badges: ['tools', 'decision', 'thinking'],
    description: 'A 4B decision model from Together AI for fast classification.',
    sizes: { latest: { ...text, sizeGb: 2.6 }, '4b': { ...text, sizeGb: 2.6 }, '0.8b': { ...text, sizeGb: 0.9 } },
  },
  flint: {
    badges: ['tools', 'thinking'],
    description: 'Flint is a 39.8 billion-parameter mixture-of-experts model from Recursive, built for coding agents.',
    sizes: { latest: { ...text, sizeGb: 23 }, '40b': { ...text, sizeGb: 23 } },
  },
  'bonsai-2': {
    badges: ['vision', 'tools', 'thinking'],
    description: 'Bonsai 2 from Prism ML is a family of vision models built for ternary weights – smaller models with close to full-precision quality.',
    sizes: { latest: { ...textImage, sizeGb: 3.2 }, '2b': { ...textImage, sizeGb: 0.9 }, '9b': { ...textImage, sizeGb: 3.2 }, '27b': { ...textImage, sizeGb: 8.3 } },
  },
  // Its audio badge is hearing: the model listens, and answers in text.
  'nemotron-3.5-bolt': {
    badges: ['vision', 'tools', 'thinking', 'audio'],
    description: 'Nemotron 3.5 Bolt is NVIDIA’s compact vision-language model for local coding, reasoning, and tool use.',
    sizes: { latest: { ...textImage, sizeGb: 6.1 }, e4b: { ...textImage, sizeGb: 6.1 } },
  },
  'embeddinggemma-2': {
    badges: ['vision', 'embedding', 'audio'],
    description: 'EmbeddingGemma 2 is a multimodal embedding model from Google built on the Gemma 4 architecture.',
    sizes: { latest: { ...textImage, sizeGb: 0.6 }, '270m': { ...textImage, sizeGb: 0.6 } },
  },
  // Not from the scan: a chat model that mentions speech in passing, and one whose name starts like a decision family.
  'talkative': {
    badges: ['tools'],
    description: 'Talkative handles speech recognition and text-to-speech output next to ordinary chat.',
    sizes: { '7b': { ...text, sizeGb: 4.4 } },
  },
  'kevlar': {
    badges: ['tools'],
    description: 'Kevlar is a general-purpose assistant.',
    sizes: { '7b': { ...text, sizeGb: 4.4 } },
  },
};

/** Rows as the app builds them: catalog entries, the page's facts applied, then merged with what is installed. */
function appRows(installed = []) {
  const entries = Object.entries(FAMILIES).flatMap(([name, facts]) => Object.entries(facts.sizes).map(([tag, size]) => ({
    id: `${name}:${tag}`, name, tag, params: '', sizeGb: size.sizeGb, pack: 'Live Tag', source: 'Ollama library', live: true,
  })));
  return mergeModelRows(applyCapabilitySnapshot(entries, { families: FAMILIES }), installed);
}
const vram12 = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, unifiedMemory: false, ramGb: 32 };
const inApp = (row) => canGenerateText(row) && !isEmbeddingModel(row.displayName);
const names = (rows) => rows.map((row) => row.displayName);

// The verdicts for every family. `chat`: the app's lists, shows and judges. `pick`: a Simple
// Mode card. `cli`: the default list of rigmatch-fit; `all`: it is listed under --all.
const VERDICTS = {
  phonon: { kind: 'audio', chat: false, pick: false, cli: false, all: false },
  d3: { kind: 'decision', chat: false, pick: false, cli: false, all: true },
  kev: { kind: 'decision', chat: false, pick: false, cli: false, all: true },
  'd1-omni': { kind: 'decision', chat: false, pick: false, cli: false, all: true },
  nimble: { kind: 'decision', chat: false, pick: false, cli: false, all: true },
  tev1: { kind: 'decision', chat: false, pick: false, cli: false, all: true },
  // A coding agent chats, so a show may seat it; the terminal's default list is for general chat.
  flint: { kind: null, chat: true, pick: true, cli: false, all: true },
  'bonsai-2': { kind: null, chat: true, pick: true, cli: true, all: true },
  'nemotron-3.5-bolt': { kind: null, chat: true, pick: true, cli: true, all: true },
  'embeddinggemma-2': { kind: null, chat: false, pick: false, cli: false, all: false },
  talkative: { kind: null, chat: true, pick: true, cli: true, all: true },
  kevlar: { kind: null, chat: true, pick: true, cli: true, all: true },
};

test('each family is a chat model, or not, the same way in the app list, Simple Pick and the terminal', () => {
  const rows = appRows();
  const ranked = rankModels(catalogRows(FAMILIES), vram12);
  for (const [family, verdict] of Object.entries(VERDICTS)) {
    const mine = rows.filter((row) => row.name === family);
    assert.ok(mine.length > 0, family);
    for (const row of mine) {
      assert.equal(nonChatKind(row), verdict.kind, `${row.displayName} kind`);
      assert.equal(inApp(row), verdict.chat, `${row.displayName} in the app's chat lists`);
      assert.equal(canSeatInSimplePick(row, 'win32', true), verdict.pick, `${row.displayName} as a Simple Pick card`);
      assert.equal(canJoinComparison(row), verdict.pick, `${row.displayName} in a show`);
    }
    const terminal = ranked.filter((model) => model.row.name.startsWith(`${family}:`));
    assert.equal(terminal.length > 0, verdict.all, `${family} listed under --all`);
    // Fit, not chat quality, decides whether a chat model reaches the default list: the 27b and 40b sizes do not fit 12 GB.
    assert.equal(terminal.some(inDefaultList), verdict.cli, `${family} in the default list`);
  }
});

test('the verdicts hold on the page text alone: no badge, no name list', () => {
  // d1-omni, nimble and phonon show no decision or speech badge, and a rename
  // would take the name list with it.
  for (const family of ['d1-omni', 'nimble', 'phonon']) {
    const { description, badges } = FAMILIES[family];
    assert.ok(!badges.includes('decision') && !badges.includes('speech'), family);
    assert.ok(nonChatKind({ name: `renamed-${family}`, displayName: `renamed-${family}:latest`, description, capabilities: ['completion'] }), family);
  }
  for (const family of ['bonsai-2', 'flint', 'talkative']) {
    assert.equal(nonChatKind({ name: `renamed-${family}`, description: FAMILIES[family].description }), null, family);
  }
});

test('the decision badge is kept, and a decision size never reports completion', () => {
  const html = `<html><head><meta name="description" content="Turn text into scored choices."></head><body>
    <span class="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs">vision</span>
    <span  class="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs">decision</span>
    <span  class="inline-flex items-center rounded-md bg-[#ddf4ff] px-2 py-0.5 text-xs">2b</span></body></html>`;
  assert.deepEqual(parseOllamaFamilyFacts(html).badges, ['vision', 'decision'], 'the size chip is not a badge');
  const [d3, kev] = appRows().filter((row) => row.id === 'd3:latest' || row.id === 'kev:latest');
  assert.deepEqual(d3.capabilities, ['decision', 'vision']);
  assert.deepEqual(kev.capabilities, ['decision']);
});

test('an installed model is read from what Ollama reports, then its page, then its name', () => {
  const installed = (name, capabilities) => ({ name, model: name, sizeGb: 3, parameterSize: '4B', provider: 'ollama', capabilities });
  // Ollama's capability list has "decision" and "speech" (types/model/capability.go).
  assert.equal(nonChatKind({ displayName: 'house-scorer:4b', installedModel: installed('house-scorer:4b', ['decision']) }), 'decision');
  assert.equal(nonChatKind({ displayName: 'house-voice:1b', installedModel: installed('house-voice:1b', ['speech']) }), 'audio');
  // Reported "completion" and nothing else, as an older Ollama may: the name still catches it.
  const bare = mergeModelRows([], [installed('kev:4b', ['completion']), installed('phonon:en', ['completion']), installed('qwen3:8b', ['completion', 'tools'])]);
  assert.deepEqual(bare.map((row) => nonChatKind(row)), ['decision', 'audio', null]);
  assert.deepEqual(bare.map(canGenerateText), [false, false, true]);
  // The page's badge counts even when the installed model's own list is the one the app prefers.
  const both = mergeModelRows(applyCapabilitySnapshot([{ id: 'd3:4b', name: 'd3', tag: '4b', params: '', sizeGb: 5.6 }], { families: FAMILIES }), [installed('d3:4b', ['completion', 'vision'])]);
  assert.equal(nonChatKind(both[0]), 'decision');
});

test('the name list covers the twelve decision families and not their lookalikes', () => {
  for (const name of ['d1', 'd1-omni', 'd3', 'kev', 'nimble', 'nimble-v3', 'tev1', 'strands-decider', 'clef', 'clef-flash', 'pplx-decider', 'laya', 'd3:4b', 'kev:latest']) {
    assert.equal(nonChatKind({ displayName: name }), 'decision', name);
  }
  for (const name of ['kevlar:7b', 'd30:7b', 'clefs:1b', 'nimbus:3b', 'deepseek-r1:8b', 'qwen3:8b', 'llama3.2:3b', 'granite4:3b', 'gemma3:12b']) {
    assert.equal(nonChatKind({ displayName: name }), null, name);
  }
  for (const name of ['phonon:en', 'kokoro-tts:82m', 'orpheus:3b', 'musicgen-small']) assert.equal(nonChatKind({ displayName: name }), 'audio', name);
  for (const name of ['whisper-large-v3', 'gemma4:e4b', 'qwen2.5-omni:7b']) assert.equal(nonChatKind({ displayName: name }), null, name);
  assert.ok(isLikelyAudioGenerationModel('phonon:40m-multilingual'));
});

test('Simple Mode Pick: with these models on the list, no speech or decision model is a card', () => {
  const installedKev = { name: 'kev:latest', model: 'kev:latest', sizeGb: 5.6, parameterSize: '4B', provider: 'ollama', capabilities: ['completion'] };
  for (const platform of ['win32', 'darwin', 'linux']) {
    const rows = appRows([installedKev]);
    const cards = rows
      .filter((row) => canSeatInSimplePick(row, platform, true))
      .filter((row) => getHardwareFit(row, 12).recommend);
    assert.ok(cards.length > 0, 'there are still cards');
    assert.deepEqual(cards.filter((row) => ['phonon', 'd3', 'kev', 'd1-omni', 'nimble', 'tev1'].includes(row.name)).map((row) => row.displayName), [], platform);
    assert.ok(cards.some((row) => row.name === 'bonsai-2'), 'a chat model from the same scan is still offered');
  }
  // And with Ollama not ready, a model to download is not a card at all, as before.
  assert.deepEqual(appRows().filter((row) => canSeatInSimplePick(row, 'win32', false)), []);
});

test('Makes sound: phonon is an audio model for the Models filter, and never a card, a chat or a judge', () => {
  const rows = appRows();
  const phonon = rows.find((row) => row.id === 'phonon:en');
  assert.ok(modelMatchesTask(phonon, 'audiogen'), 'the Makes audio filter lists it');
  for (const task of ['assistant', 'writing', 'coding', 'reasoning', 'tiny', 'vision', 'hears']) assert.ok(!modelMatchesTask(phonon, task), task);
  assert.deepEqual(getModelDreamTags(phonon), ['audio']);
  assert.equal(canSeatInSimplePick(phonon, 'darwin', true), false, 'not on the Mac it needs, either');
  assert.deepEqual(getModelGoodForTags(phonon), ['makes audio']);
  assert.deepEqual(describeAbilities(phonon), [NON_CHAT_NOTE.audio]);
  // Hearing is not speaking: the model that listens is not an audio maker.
  const bolt = rows.find((row) => row.id === 'nemotron-3.5-bolt:e4b');
  assert.ok(!modelMatchesTask(bolt, 'audiogen'));
  assert.ok(modelMatchesTask(bolt, 'hears'));
});

test('decision models stay on the Models screen with a plain label, and are no judge or Just Chat pick', () => {
  const rows = appRows();
  const d3 = rows.find((row) => row.id === 'd3:2b');
  assert.deepEqual(describeAbilities(d3), ["Decision model: scores text, doesn't chat."]);
  assert.deepEqual(getModelGoodForTags(d3), ['scores text']);
  for (const task of ['assistant', 'writing', 'coding', 'reasoning']) assert.ok(!modelMatchesTask(d3, task), task);
  assert.deepEqual(getModelDreamTags(d3), [], 'no goal on the Pick screen');
  const installed = rows.map((row) => ({ ...row, installed: true, ready: true }));
  const judges = textJudgeCandidates(installed, 12);
  assert.ok(judges.length > 0);
  assert.ok(!judges.some((name) => /^(?:phonon|d3|kev|d1-omni|nimble|tev1):/.test(name)), judges.join(', '));
  const chosen = pickJustChatModel(installed.filter((row) => ['d3', 'kev', 'nimble'].includes(row.name)), 12);
  assert.equal(chosen, null, 'Just Chat does not settle for a decision model');
});

test('the terminal lists a decision model under --all with no grade, and never a speech model', () => {
  const ranked = rankModels(catalogRows(FAMILIES), vram12);
  const d3 = ranked.find((model) => model.row.name === 'd3:2b');
  const kev = ranked.find((model) => model.row.name === 'kev:latest');
  assert.equal(d3.kind, 'decision');
  assert.ok(!ranked.some((model) => model.row.name.startsWith('phonon')), 'no speech model, listed or not');
  // They go after every chat model, whatever their fit says.
  const lastChat = ranked.map((model) => model.kind).lastIndexOf(null);
  assert.ok(ranked.slice(0, lastChat + 1).every((model) => model.kind === null));
  const hardware = { ...vram12, platform: 'win32', arch: 'x64', source: 'detected' };
  const all = formatTable(ranked, hardware, { all: true });
  const line = all.split('\n').find((row) => row.includes('d3:2b'));
  assert.match(line, /^-\s+d3:2b\s+2\.9 GB\s+-\s+Decision model \(/);
  assert.match(all, /Decision model: scores text, doesn't chat\./);
  const plain = formatTable(ranked, hardware);
  assert.ok(!/d3:|kev:|nimble|tev1|d1-omni|phonon/.test(plain), 'not in the default list');
  const json = toJson(ranked, hardware).models;
  assert.deepEqual(
    json.filter((model) => model.model === 'd3:2b' || model.model === 'kev:latest').map(({ kind, grade, points }) => ({ kind, grade, points })),
    [{ kind: 'decision', grade: null, points: null }, { kind: 'decision', grade: null, points: null }],
  );
  assert.equal(json.find((model) => model.model === 'bonsai-2:2b').kind, 'chat');
  assert.ok(kev.grade.tokensPerSecond === null || kev.kind, 'kev carries a fit, not a chat speed');
});

test('the shipped snapshot: every decision family and phonon is kept out of the chat lists', () => {
  const decision = ['d1', 'd1-omni', 'd3', 'kev', 'nimble', 'nimble-v3', 'tev1', 'strands-decider', 'clef', 'clef-flash', 'pplx-decider', 'laya'];
  const rows = catalogRows(shipped.families);
  const ranked = rankModels(rows, vram12);
  assert.ok(ranked.length > 300);
  // Exactly these and no other family: a new page whose wording happens to match is a false positive to look at, not to wave through.
  const flagged = Object.entries(shipped.families)
    .filter(([name, facts]) => nonChatKind({ name, description: facts.description, capabilities: facts.badges }))
    .map(([name]) => name);
  assert.deepEqual(flagged.sort(), [...decision, 'phonon'].sort());
  for (const family of [...decision, 'phonon']) {
    assert.ok(!ranked.filter((model) => model.row.name.startsWith(`${family}:`)).some(inDefaultList), `${family} reached the default list`);
  }
  assert.ok(!ranked.some((model) => model.row.name.startsWith('phonon:')), 'phonon is not listed at all');
  assert.ok(shipped.families.d3 && shipped.families.kev && shipped.families.phonon, 'the snapshot was taken after they appeared');
});
