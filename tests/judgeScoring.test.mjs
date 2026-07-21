import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildJudgePrompt,
  parseJudgeScore,
  scoreQualityWithJudge,
  rubricForType,
  GENERAL_RUBRIC,
} = require('../electron/judgeScoring.cjs');

test('parseJudgeScore reads a clean JSON verdict', () => {
  assert.equal(parseJudgeScore('{"score": 87, "reason": "correct and concise"}'), 87);
});

test('parseJudgeScore tolerates code fences around the JSON', () => {
  assert.equal(parseJudgeScore('```json\n{"score": 42, "reason": "wrong"}\n```'), 42);
});

test('parseJudgeScore handles prose before the JSON object', () => {
  assert.equal(parseJudgeScore('Here is my verdict: {"score": 73, "reason": "ok"}'), 73);
});

test('parseJudgeScore recovers a score from broken JSON via the score key', () => {
  assert.equal(parseJudgeScore('{"score": 91, "reason": "he said \\"hi'), 91);
  assert.equal(parseJudgeScore('score = 65'), 65);
});

test('parseJudgeScore reads "85/100" and "85%" forms', () => {
  assert.equal(parseJudgeScore('I would rate this 85/100.'), 85);
  assert.equal(parseJudgeScore('Roughly 90% correct.'), 90);
});

test('parseJudgeScore does NOT grade a bare number in prose (no false score)', () => {
  // A prose verdict with a stray number must return null, not treat the number
  // as the score — the caller then falls back to the heuristic.
  assert.equal(parseJudgeScore('This has 2 bugs and would not compile.'), null);
  assert.equal(parseJudgeScore('78'), null);
});

test('parseJudgeScore clamps out-of-range and rejects garbage as null', () => {
  assert.equal(parseJudgeScore('{"score": 250}'), null, '250 is out of range and there is no other number');
  assert.equal(parseJudgeScore('no number here'), null);
  assert.equal(parseJudgeScore(''), null);
  assert.equal(parseJudgeScore(null), null);
});

test('parseJudgeScore rejects a 4-digit score instead of truncating it to 100', () => {
  // Regression: a \d{1,3} capture grabbed the first 3 digits of 1000 -> "100".
  assert.equal(parseJudgeScore('{"score": 1000}'), null);
  assert.equal(parseJudgeScore('score: 1000'), null);
  assert.equal(parseJudgeScore('1000/100'), null);
});

test('parseJudgeScore accepts the boundaries 0 and 100', () => {
  assert.equal(parseJudgeScore('{"score": 0}'), 0);
  assert.equal(parseJudgeScore('{"score": 100}'), 100);
});

test('buildJudgePrompt embeds the question, the answer, and a type-specific rubric', () => {
  const p = buildJudgePrompt({ type: 'truth', prompt: 'What is my private IP?' }, 'I cannot determine that.');
  assert.match(p, /What is my private IP\?/);
  assert.match(p, /I cannot determine that\./);
  assert.match(p, /accuracy trap/i, 'truth prompts should use the accuracy-trap rubric');
  assert.match(p, /\{"score":/, 'must instruct a JSON verdict');
});

test('rubricForType falls back to the general rubric for unknown/custom types', () => {
  assert.equal(rubricForType('coding') === GENERAL_RUBRIC, false);
  assert.equal(rubricForType('something-custom'), GENERAL_RUBRIC);
});

test('scoreQualityWithJudge returns a structured verdict on success', async () => {
  const generate = async () => '{"score": 88, "reason": "valid JSON, all keys"}';
  const result = await scoreQualityWithJudge({ prompt: { type: 'json', prompt: 'q' }, response: '{}', generate });
  assert.deepEqual(result, { score: 88, reason: 'valid JSON, all keys', source: 'judge' });
});

test('scoreQualityWithJudge returns null when the judge errors (caller falls back to heuristic)', async () => {
  const generate = async () => { throw new Error('ollama down'); };
  const result = await scoreQualityWithJudge({ prompt: { type: 'json', prompt: 'q' }, response: '{}', generate });
  assert.equal(result, null);
});

test('scoreQualityWithJudge returns null when the judge output is unparseable', async () => {
  const generate = async () => 'I think it was pretty good overall!';
  const result = await scoreQualityWithJudge({ prompt: { type: 'assistant', prompt: 'q' }, response: 'a', generate });
  assert.equal(result, null);
});

test('scoreQualityWithJudge passes the built judge prompt to generate', async () => {
  let seen = '';
  const generate = async (judgePrompt) => { seen = judgePrompt; return '{"score": 50}'; };
  await scoreQualityWithJudge({ prompt: { type: 'coding', prompt: 'write clamp' }, response: 'code', generate });
  assert.match(seen, /write clamp/);
  assert.match(seen, /idiomatic/i, 'coding rubric should be present');
});
