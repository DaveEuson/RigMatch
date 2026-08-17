import test from 'node:test';
import assert from 'node:assert/strict';

import { GLOSSARY, findGlossaryTerms, glossaryEntry, tickerTips } from '../src/lib/glossary.ts';

/**
 * The point of this file is a promise: someone who has never run a local model
 * can read any explanation in Simple Mode and understand it without looking
 * anything else up. A definition that needs a second definition has failed,
 * so that is what these tests check — not spelling, but whether the words
 * themselves are reachable from a standing start.
 */

/** Words a newcomer would not know, and which therefore need explaining first. */
const JARGON = [
  'GPU', 'VRAM', 'CPU', 'LLM', 'token', 'parameter', 'quantiz', 'inference',
  'embedding', 'vector', 'context window', 'server', 'API', 'CLI', 'runtime',
  'backend', 'weights', 'checkpoint', 'prompt engineering', 'fine-tun',
];

/** Where a jargon word is allowed: the entry that exists to explain it. */
const EXPLAINS = {
  GPU: 'graphics-card',
  VRAM: 'vram',
  token: 'tokens-per-second',
  parameter: 'model-size',
  quantiz: 'quantization',
  embedding: 'embedding-model',
  'context window': 'context-window',
};

test('no definition leans on a word it has not explained', () => {
  for (const entry of GLOSSARY) {
    const body = `${entry.plain} ${entry.because ?? ''}`;
    for (const word of JARGON) {
      // Whole words only: "CLI" matches inside "clicking", "API" inside
      // "rapidly". Built with String.raw because in an ordinary template
      // literal `\b` is the BACKSPACE escape, not a word boundary — the regex
      // then silently matches nothing and this check quietly passes forever.
      // That exact mistake has now been made three times in this codebase.
      const stem = /[a-z]$/.test(word) && word.length < 8 && word === word.toLowerCase();
      const pattern = new RegExp(
        stem ? String.raw`\b${word}` : String.raw`\b${word}\b`,
        'i',
      );
      if (!pattern.test(body)) continue;
      assert.equal(EXPLAINS[word], entry.id,
        `"${entry.id}" explains itself using "${word}", which a newcomer does not know. `
        + 'Say it in plain words, or move the term to alsoCalled where it is labelled as the technical name.');
    }
  }
});

test('the technical name is offered, never used as the explanation', () => {
  // alsoCalled exists so someone who already knows the jargon can connect the
  // two — it must never be the only place a concept is named.
  for (const entry of GLOSSARY) {
    if (!entry.alsoCalled) continue;
    assert.ok(entry.term && entry.term !== entry.alsoCalled,
      `${entry.id}: the plain term and the technical term are the same word`);
  }
});

test('every entry actually explains something, and says why it matters here', () => {
  for (const entry of GLOSSARY) {
    assert.ok(entry.plain.length > 40, `${entry.id}: the plain definition is too thin to help`);
    assert.match(entry.plain, /\.$/, `${entry.id}: should read as a sentence`);
    // A definition without a "why" leaves the reader knowing the word and still
    // not knowing what to do — which is the failure mode this whole file exists
    // to avoid. Only the two most self-evident entries are excused.
    if (!['local', 'download-size'].includes(entry.id)) {
      assert.ok(entry.because, `${entry.id}: says what it is but not why it matters here`);
    }
  }
});

test('the words a beginner meets first are all covered', () => {
  // Ollama is named nineteen times in Simple Mode and was never once defined.
  for (const id of ['model', 'ollama', 'graphics-card', 'vram', 'match-score', 'top-match', 'terminal']) {
    assert.ok(glossaryEntry(id), `missing an explanation for "${id}", which Simple Mode shows a first-time user`);
  }
});

test('ids are unique, since the UI keys off them', () => {
  const ids = GLOSSARY.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the Advanced ticker reads from the same source', () => {
  // Two copies of a definition drift, and then the app disagrees with itself
  // about what a word means depending on which mode you are in.
  const tips = tickerTips();
  assert.equal(tips.length, GLOSSARY.length);
  for (const tip of tips) {
    assert.ok(tip.term && tip.tip.length > 40);
  }
  const vram = tips.find((tip) => tip.term.includes('VRAM'));
  assert.ok(vram, 'the technical name should still be findable for people who know it');
});

// ---------------------------------------------------------------------------
// Terms inside strings the app builds at runtime

test('a term is found inside copy the app assembled', () => {
  // The real case: every card in the Pick grid carries this line, which is
  // built per model and so cannot be wrapped by hand in the JSX.
  const hits = findGlossaryTerms('4.7 GB of your 12 GB VRAM');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'vram');
  assert.equal('4.7 GB of your 12 GB VRAM'.slice(hits[0].start, hits[0].end), 'VRAM');
});

test('the technical name and the friendly name both resolve', () => {
  assert.equal(findGlossaryTerms('Check your GPU')[0]?.id, 'graphics-card');
  assert.equal(findGlossaryTerms('Check your graphics card')[0]?.id, 'graphics-card');
});

test('a longer term is not shadowed by a shorter one inside it', () => {
  const hits = findGlossaryTerms('It needs graphics memory to run');
  assert.equal(hits.length, 1, 'one span, not two overlapping ones');
  assert.equal(hits[0].id, 'vram');
});

test('a term is marked once, not every time it appears', () => {
  // Four underlines of the same word in one sentence is noise, not help.
  const hits = findGlossaryTerms('VRAM, more VRAM, and still more VRAM');
  assert.equal(hits.length, 1);
});

test('matches come back in reading order', () => {
  const text = 'Ollama needs graphics memory';
  const hits = findGlossaryTerms(text);
  assert.ok(hits.length >= 2);
  for (let i = 1; i < hits.length; i += 1) {
    assert.ok(hits[i].start >= hits[i - 1].end, 'spans must not overlap or run backwards');
  }
});

test('plain copy with no jargon is left completely alone', () => {
  assert.deepEqual(findGlossaryTerms('Everything stays on your computer.'), []);
  assert.deepEqual(findGlossaryTerms(''), []);
});

test('a term only matches as a whole word', () => {
  // Substring matching would underline the middle of unrelated words and, in
  // the download screen, the middle of file names.
  assert.deepEqual(findGlossaryTerms('VRAMble'), []);
  assert.deepEqual(findGlossaryTerms('unVRAM'), []);
});

test('every entry can actually be found by its own name', () => {
  // A term nothing can match is a definition that will never be shown.
  for (const entry of GLOSSARY) {
    const hits = findGlossaryTerms(entry.term);
    assert.equal(hits[0]?.id, entry.id, `"${entry.term}" does not match its own entry`);
  }
});
