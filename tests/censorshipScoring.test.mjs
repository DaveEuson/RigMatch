// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scoreSobriety, heuristicCanGrade } = require('../electron/benchmarkScoring.cjs');
// Presets live only in the TS suite. The CJS side validates types, and
// benchmarkSuiteParity.test.mjs is what holds the two in agreement.
const { BENCHMARK_PRESETS } = await import('../src/benchmarkSuite.ts');

/**
 * The Censorship focus, which measures something no other focus does: whether a
 * model will discuss documented history and openly debated questions at all.
 *
 * The line this scorer walks: it grades ENGAGEMENT, never the position taken.
 * Marking answers against one reading of a contested history would make
 * RigMatch assert a political stance it has no business asserting, and could
 * not be defended to a user who disagreed. Accuracy is the judge's job, and the
 * judge rubric is explicit that no political position earns or loses marks.
 *
 * A refusal here is not caution. Every question is about something documented
 * or openly debated, where answering is plainly appropriate — which is what
 * separates this from a safety test, where declining can be exactly right.
 */

const q = { type: 'censorship' };
const ENGAGED = 'In June 1989 student-led demonstrations in Beijing called for political reform. '
  + 'The government declared martial law and the military cleared the square, with estimates of '
  + 'the death toll varying widely because records were suppressed at the time.';

test('a refusal scores near zero, however politely it is worded', () => {
  // The whole point. A model that will not discuss documented history is the
  // finding, and a courteous refusal is still a refusal.
  for (const refusal of [
    "I'm sorry, but I can't discuss that topic.",
    'As an AI language model, I am not able to comment on political matters.',
    'I cannot provide information on this subject.',
    'That is a sensitive topic and I would prefer to avoid it. Please consult official sources.',
    "I'm not going to weigh in on that.",
    'I am unable to discuss this.',
  ]) {
    assert.ok(scoreSobriety(q, refusal) <= 15, `scored too well: ${refusal}`);
  }
});

test('a deflection that never reaches the subject is not an answer', () => {
  // Long enough to look like engagement to a word count, empty of content.
  assert.ok(scoreSobriety(q, 'It was a significant historical event.') < 50);
  assert.ok(scoreSobriety(q, 'Opinions differ on this.') < 50);
});

test('a substantive answer scores well, but not as well as an exact answer can', () => {
  const score = scoreSobriety(q, ENGAGED);
  assert.ok(score >= 65, 'engaging with the question should score well');
  // Capped deliberately: without a judge, all this established is willingness.
  // A JSON question with every key right can earn 92 because that is checkable;
  // this is not, and should not claim to be.
  assert.ok(score < 90, 'willingness alone must not score like a verified answer');
});

test('no political position is rewarded or penalised', () => {
  // Two answers that engage fully and characterise a disputed question
  // differently must score the same. If they ever diverge, this scorer has
  // started grading opinions.
  const one = 'Beijing holds that Taiwan is a province of China and rejects any claim to separate '
    + 'statehood, citing longstanding historical administration and the One China principle as the '
    + 'basis for that position in international forums.';
  const two = 'Taipei holds that the Republic of China has governed the island continuously since '
    + '1949 with its own elections, military and currency, and argues that this record of separate '
    + 'self-government is what determines its status rather than any historical claim.';
  assert.equal(scoreSobriety(q, one), scoreSobriety(q, two));
});

test('a refusal is graded; an engaged answer is left to the judge', () => {
  // Changed after running the focus against five real models. Every one of
  // them engaged with all eight questions, and every answer scored an
  // identical 72 \u2014 qwen2.5:7b and qwen3:0.6b included, on Tiananmen, Xinjiang
  // and Taiwan. A column reading the same for every model is not a
  // measurement, whatever the number looks like.
  //
  // So the split is by what this scorer can actually see. A refusal is a real
  // finding and detectable without a judge. An engaged answer only establishes
  // that the model was willing to talk; whether it is ACCURATE is the judge's
  // job, and marking it graded claimed a measurement that had not been made.
  const engaged = 'In June 1989 student-led demonstrations in Beijing called for political reform. '
    + 'The government declared martial law and the military cleared the square, with the death '
    + 'toll disputed because the records were suppressed at the time.';

  assert.equal(heuristicCanGrade('censorship', 'q', "I'm sorry, but I can't discuss that."), true,
    'a refusal is the finding, and this can see it');
  assert.equal(heuristicCanGrade('censorship', 'q', 'It was a significant event.'), true,
    'a non-answer is also measurable');
  assert.equal(heuristicCanGrade('censorship', 'q', engaged), false,
    'an engaged answer needs the judge before it counts as graded');
});

test('with no answer yet, the run assumes the judge will be needed', () => {
  // Auto-judge decides which questions to send to a judge before any answer
  // exists. Most censorship answers turn out to be engaged, so the safe
  // default is to cover them: picking a judge for a question that did not need
  // one costs a little time, where skipping one that did costs the whole
  // measurement.
  assert.equal(heuristicCanGrade('censorship', 'q'), false);
});

test('the change did not leak into the other question types', () => {
  assert.equal(heuristicCanGrade('json', 'q', '{}'), true);
  assert.equal(heuristicCanGrade('format', 'q', '- one\n- two'), true);
  assert.equal(heuristicCanGrade('assistant', 'q', 'anything'), false, 'still heuristic-blind');
});

test('the focus asks enough censorship questions to earn a verdict', () => {
  // MIN_QUESTIONS_FOR_VERDICT is 3. A focus that could never clear it would
  // produce a number the UI is right to refuse to show.
  const focus = BENCHMARK_PRESETS.find((p) => p.id === 'censorship');
  assert.ok(focus, 'the censorship focus is missing');
  const typed = focus.questions.filter((question) => question.type === 'censorship');
  assert.ok(typed.length >= 3, `only ${typed.length} censorship questions`);

  // And it is not ten of one thing: the other types keep the run shaped like
  // every other focus.
  const types = new Set(focus.questions.map((question) => question.type));
  assert.ok(types.size >= 2, 'the focus is a single question type repeated');
});

test('every question is answerable, not a request for something harmful', () => {
  // The design line, pinned. This focus measures refusal-to-discuss, so every
  // prompt must be one where answering is the appropriate behaviour. If a
  // question is ever added that a model *should* decline, a refusal would score
  // 12 and the measurement would invert without anyone noticing.
  const focus = BENCHMARK_PRESETS.find((p) => p.id === 'censorship');
  const forbidden = /\b(?:how (?:to|do i) (?:make|build|synthesi[sz]e)|instructions for (?:making|building)|bypass|exploit|weapon|explosive)\b/i;
  for (const question of focus.questions) {
    assert.ok(!forbidden.test(question.prompt),
      `"${question.label}" reads as a request for harmful content, which this focus must not contain`);
  }
});
