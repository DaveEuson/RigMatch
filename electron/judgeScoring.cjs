// LLM-as-judge quality scoring.
//
// The heuristic scorer in benchmarkScoring.cjs (`scoreSobriety`) can only pattern-
// match: it counts JSON keys, looks for refusal keywords, measures list lines, and
// otherwise rewards length. It cannot tell a correct answer from a plausible-but-
// wrong one. This module grades a model's answer by asking a *local* judge model to
// score it 0-100 against a type-aware rubric — dramatically more meaningful, still
// 100% on-device, and it works on custom prompts (where reference answers can't).
//
// Design notes:
// - Pure/testable: the network call is injected as `generate`, so the prompt builder
//   and the (surprisingly fiddly) score parser can be unit-tested without Ollama.
// - Fail-safe: if the judge errors or returns something unparseable, the caller is
//   expected to fall back to the heuristic score. `scoreQualityWithJudge` returns
//   null in that case rather than guessing.

// Per-type grading guidance. Custom/unknown types fall back to GENERAL.
const JUDGE_RUBRICS = {
  json:
    'The answer was asked to return ONLY valid JSON with specific keys. Score 90-100 if it is valid JSON containing all requested keys with sensible values; 60-80 if valid JSON but missing a key or with weak values; 30-50 if it is malformed but clearly JSON-shaped; 0-20 if it is not JSON at all or wraps the JSON in prose.',
  truth:
    'This is an accuracy trap: the answer CANNOT be known from the prompt (e.g. a private IP, a hidden credential). The correct behavior is to clearly decline or say it cannot determine/there is not enough information, and to NOT fabricate a value. Score 90-100 for an honest decline; 40-60 if it hedges but still guesses; 0-25 if it fabricates a concrete answer.',
  format:
    'The answer had an exact formatting instruction (e.g. "exactly two bullet points", "exactly three numbered steps"). Grade adherence to that format FIRST, then whether the content is useful and correct. A useful answer in the wrong format should not score above 65.',
  assistant:
    'Grade helpfulness, factual correctness, and concision for the request. Reward a direct, correct, appropriately brief answer. Penalize hallucination, ignoring stated constraints, and padding/verbosity.',
  coding:
    'Grade whether the code is correct, complete, and idiomatic for exactly what was asked. A wrong or incomplete solution scores low even if it looks plausible. Reward correct edge-case handling. Do not reward extra commentary over correctness.',
};

const GENERAL_RUBRIC =
  'Grade how well the answer satisfies the request: correctness first, then helpfulness, then following any stated constraints and format. Penalize hallucination and verbosity.';

function rubricForType(type) {
  return JUDGE_RUBRICS[type] || GENERAL_RUBRIC;
}

// Builds the grading prompt sent to the judge model. Delimits the question and the
// answer unambiguously and demands a compact JSON verdict so the output is parseable.
function buildJudgePrompt(prompt, response) {
  const type = prompt && prompt.type ? String(prompt.type) : 'assistant';
  const question = prompt && prompt.prompt ? String(prompt.prompt) : '';
  const answer = String(response == null ? '' : response);

  return [
    'You are a strict, fair grader of an AI assistant\'s answer. Grade ONLY the answer below against the question and the rubric. Do not answer the question yourself.',
    '',
    `RUBRIC: ${rubricForType(type)}`,
    '',
    'QUESTION:',
    '"""',
    question,
    '"""',
    '',
    'ANSWER TO GRADE:',
    '"""',
    answer,
    '"""',
    '',
    'Respond with ONLY a compact JSON object and nothing else, in exactly this shape:',
    '{"score": <integer 0-100>, "reason": "<one short sentence>"}',
  ].join('\n');
}

// Extracts a 0-100 integer from a judge model's raw output. Judge models are not
// perfectly obedient, so this tolerates code fences, a JSON object, "score: 85",
// "85/100", "85%", or a bare number — and rejects out-of-range/garbage as null.
function parseJudgeScore(text) {
  if (text == null) return null;
  let raw = String(text).trim();
  if (!raw) return null;

  // Drop code fences if the judge wrapped its JSON.
  raw = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  const inRange = (n) => (Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null);

  // 1) Preferred: a JSON object with a numeric "score".
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed && parsed.score != null) {
        const n = inRange(Number(parsed.score));
        if (n != null) return n;
      }
    } catch {
      /* fall through to regex strategies */
    }
  }

  // 2) An explicit "score": 85 (or score = 85) even if the surrounding JSON was broken.
  const scoreKey = raw.match(/score\s*["']?\s*[:=]\s*["']?\s*(\d{1,3})/i);
  if (scoreKey) {
    const n = inRange(Number(scoreKey[1]));
    if (n != null) return n;
  }

  // 3) "85/100" or "85%".
  const ratio = raw.match(/\b(\d{1,3})\s*(?:\/\s*100|%)/);
  if (ratio) {
    const n = inRange(Number(ratio[1]));
    if (n != null) return n;
  }

  // Deliberately no bare-integer fallback: the first number in a prose verdict
  // (e.g. "the loop runs 10 times") is not the score. Return null so the caller
  // falls back to the heuristic rather than trusting a stray count.
  return null;
}

// Orchestrates a single judge grading. `generate(judgePrompt)` must resolve to the
// judge model's raw text output. Returns { score, reason, source: 'judge' } on
// success, or null on any failure so the caller can fall back to the heuristic.
async function scoreQualityWithJudge({ prompt, response, generate }) {
  if (typeof generate !== 'function') return null;
  const judgePrompt = buildJudgePrompt(prompt, response);

  let output;
  try {
    output = await generate(judgePrompt);
  } catch {
    return null;
  }

  const score = parseJudgeScore(output);
  if (score == null) return null;

  let reason = '';
  try {
    const objMatch = String(output).replace(/```(?:json)?/gi, '').match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed && typeof parsed.reason === 'string') reason = parsed.reason.slice(0, 200);
    }
  } catch {
    /* reason is optional */
  }

  return { score, reason, source: 'judge' };
}

module.exports = {
  JUDGE_RUBRICS,
  GENERAL_RUBRIC,
  rubricForType,
  buildJudgePrompt,
  parseJudgeScore,
  scoreQualityWithJudge,
};
