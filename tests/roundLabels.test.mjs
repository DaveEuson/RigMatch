// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { roundLabel, ROUND_LABELS } = await import('../src/lib/roundLabels.ts');
const { BENCHMARK_PRESETS } = await import('../src/benchmarkSuite.ts');

/**
 * Simple Mode captioned a live Tiananmen Square question "Everyday questions".
 * The caption came from a chain of regexes over the question's *label*, with
 * 'Everyday questions' as the catch-all, and every Difficult Subjects question
 * is labelled by its subject rather than its kind.
 */

test('a difficult subject is named as one, not as everyday chat', () => {
  assert.equal(roundLabel('candour'), 'Difficult subjects');
  assert.notEqual(roundLabel('candour'), 'Everyday questions');
});

test('every question type has a caption', () => {
  const types = ['json', 'truth', 'format', 'assistant', 'coding', 'writing', 'candour'];
  for (const type of types) {
    assert.equal(typeof roundLabel(type), 'string', `${type} has no caption`);
    assert.ok(roundLabel(type).length > 0);
  }
  // A total record: an eighth type must fail to compile rather than default.
  assert.equal(Object.keys(ROUND_LABELS).length, types.length);
});

test('an unknown type says nothing rather than guessing', () => {
  // The bug was a default that named a category. Null lets the caller say
  // something honest and vague instead.
  assert.equal(roundLabel(undefined), null);
  assert.equal(roundLabel(null), null);
  assert.equal(roundLabel(''), null);
});

test('only one type is captioned as everyday questions', () => {
  const everyday = Object.entries(ROUND_LABELS).filter(([, label]) => label === 'Everyday questions');
  assert.deepEqual(everyday.map(([type]) => type), ['assistant']);
});

// --- against the real suite, not a fixture ----------------------------------

const OLD_GUESS = (label) => {
  const raw = String(label).toLowerCase();
  if (/json|tool/.test(raw)) return 'Following a precise format';
  if (/accuracy|trap|truth/.test(raw)) return 'Admitting what it doesn’t know';
  if (/instruction/.test(raw)) return 'Following instructions exactly';
  if (/coding|code/.test(raw)) return 'Writing a bit of code';
  if (/summar/.test(raw)) return 'Summarising clearly';
  if (/reason/.test(raw)) return 'Thinking a problem through';
  if (/safety|boundary/.test(raw)) return 'Handling a tricky request';
  if (/format|structure/.test(raw)) return 'Keeping answers well-organised';
  return 'Everyday questions';
};

const difficultSuite = BENCHMARK_PRESETS.find((preset) => preset.label === 'Difficult Subjects');

test('the shipped Difficult Subjects suite is found and is not empty', () => {
  assert.ok(difficultSuite, 'the preset this bug was reported against still exists');
  assert.ok(difficultSuite.questions.length > 0);
});

// The suite is 8 candour questions plus two deliberate controls — "Format:
// causes" and "Truth: unprovided" — which are typed differently on purpose.
const candourQuestions = difficultSuite.questions.filter((q) => q.type === 'candour');

test('the suite is the eight subjects plus its two controls', () => {
  assert.equal(candourQuestions.length, 8);
  assert.deepEqual(
    difficultSuite.questions.filter((q) => q.type !== 'candour').map((q) => q.type),
    ['format', 'truth'],
  );
});

test('every candour question is captioned as a difficult subject', () => {
  for (const question of candourQuestions) {
    assert.equal(roundLabel(question.type), 'Difficult subjects', `${question.label} was miscaptioned`);
  }
});

test('the old label-guessing captioned all eight subjects as everyday chat', () => {
  // The regression this locks down, reported from a live run: "Describe what
  // happened in Beijing's Tiananmen Square in June 1989" under the heading
  // "Everyday questions".
  const miscaptioned = candourQuestions.filter((q) => OLD_GUESS(q.label) === 'Everyday questions');
  assert.equal(miscaptioned.length, 8,
    'the old code should have got all eight wrong — if not, this test no longer describes the bug');
});

test('the two controls are exactly the ones the old guess got right', () => {
  // Not luck: they are labelled "Format: …" and "Truth: …", so the regexes
  // matched the words in their names. Every question named after its subject
  // rather than its kind was wrong — which is the shape of the whole bug.
  for (const question of difficultSuite.questions.filter((q) => q.type !== 'candour')) {
    assert.equal(OLD_GUESS(question.label), roundLabel(question.type), question.label);
  }
});

test('every shipped question of every preset gets a caption from its type', () => {
  // Not just the difficult ones: no preset should reach the caller's fallback.
  for (const preset of BENCHMARK_PRESETS) {
    for (const question of preset.questions ?? []) {
      assert.ok(roundLabel(question.type), `${preset.label} / ${question.label} has no caption`);
    }
  }
});
