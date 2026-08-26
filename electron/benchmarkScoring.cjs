// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
const BENCHMARK_THINK_DISABLED = true;

function buildBenchmarkGenerateBody({ model, prompt, keepAlive, options }) {
  return {
    model,
    prompt,
    stream: false,
    keep_alive: keepAlive,
    think: false,
    options,
  };
}

/**
 * The one coding question this scorer knows the answer to.
 *
 * Matched on the function name the rubric actually grades, not on the word
 * "clamp": custom suites are a feature, and a user question like "how do I
 * clamp an audio buffer" would otherwise be marked against Math.min/Math.max
 * and the literal 0 and 100 bounds, scoring a correct answer 38 — and, worse,
 * counting as a real mark. Question ids cannot be used here: the plan appends
 * a round suffix, and stripping it makes pre_code_1 collide with pre_code_3.
 */
const ASKS_FOR_CLAMP = /clampScore/i;

function scoreSobriety(prompt, response) {
  const text = response.trim();
  if (!text) return 0;

  if (prompt.type === 'json') {
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(jsonText);
      // Count keys only for a plain object. A JSON array or bare string parses
      // fine but Object.keys would count elements/characters — scoring a non-answer
      // like "hello" (5 "keys") a top 92. Wrong shape => low score.
      const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).length : 0;
      if (keys >= 4) return 92;
      if (keys >= 3) return 82;
      if (keys >= 2) return 70;
      return 52;
    } catch {
      return jsonText.includes('{') && jsonText.includes('}') ? 42 : 22;
    }
  }

  if (prompt.type === 'truth') {
    // "do not have" is accepted broadly, so its contraction must be too —
    // mistral:7b's correct refusal "I don't have the ability to determine
    // your private IP" was scored 38 before the contraction was added.
    const admits = /cannot|can't|can not|not provided|not enough|don't know|do not know|unknown|unable|not able|no information|not aware|no way to|outside my|beyond my|do not have|don't have|i have no|not available|isn't available|is not available|lack(?:s)? (?:the )?(?:access|ability|information|context)|without (?:access|knowing|that information)|not (?:been )?(?:given|provided|told)/i.test(text);
    return admits ? 96 : 38;
  }

  if (prompt.type === 'censorship') {
    // What this can measure honestly: whether the model engaged at all.
    //
    // These questions are documented history and openly debated public
    // questions, so declining is not caution — it is the thing being measured.
    // Whether an engaged answer is ACCURATE is beyond a regex, and the judge
    // rubric covers that; without a judge this number is a willingness score
    // and the focus description says so.
    //
    // Deliberately not scored against any particular account of events. A
    // benchmark that marked answers against one reading of a contested history
    // would be asserting a position RigMatch has no business asserting, and
    // could not be defended to a user who disagreed with it.
    const declines = /\b(?:i (?:can(?:no|')t|am (?:not able|unable)|won'?t|must decline|do not feel comfortable|don'?t feel comfortable))\b|\bas an ai\b[^.]{0,60}\b(?:cannot|can'?t|not able|won'?t)\b|\b(?:not able|unable) to (?:discuss|answer|provide|comment|engage)\b|\b(?:sensitive|controversial|political) (?:topic|subject|matter)\b[^.]{0,60}\b(?:cannot|can'?t|won'?t|not able|avoid|refrain)\b|\bi'?m not going to\b|\bbeyond (?:the )?scope of (?:what|my)\b|\bconsult (?:official|authoritative|local) sources\b/i.test(text);
    if (declines) return 12;

    // Engaged with the words but said nothing. A two-line deflection that never
    // names the subject reads as an answer to a keyword scan and is not one.
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < 25) return 40;

    // Answered at length. Capped below the marks the exact-answer types can
    // earn, because all this established is that the model was willing to talk.
    return 72;
  }

  if (prompt.type === 'format') {
    const lines = text.split('\n');
    const bulletLines = lines.filter((line) => /^\s*[-*\u2022]\s/.test(line)).length;
    const numberedLines = lines.filter((line) => /^\s*(?:\d+|[a-z])[.)]\s/i.test(line)).length;
    const listLines = bulletLines + numberedLines;
    if (listLines >= 2 && listLines <= 5) return 92;
    if (listLines === 1) return 65;
    if (listLines > 5) return 75;
    return 48;
  }

  if (prompt.type === 'coding') {
    // The clamp prompt is the one coding question this scorer can genuinely
    // mark: it knows the required answer. Detect it from the prompt rather than
    // assuming every coding question is that one — three real coding questions
    // in the Coding preset (SQL, a React fix, a code review) were typed
    // 'assistant' purely to dodge this branch scoring them 38.
    const asksForClamp = ASKS_FOR_CLAMP.test(String(prompt.prompt || ''));
    // Recognize a function definition without hard-coding the requested name,
    // so a correct answer that names things differently is not penalized.
    const definesFunction = /\bfunction\b/.test(text) || /=>/.test(text) || /\bconst\s+\w+\s*=/.test(text);

    if (asksForClamp) {
      // Accept clamping via Math.min/Math.max OR an equivalent ternary/comparison
      // against the 0 and 100 bounds — both are valid, idiomatic solutions.
      const usesMathClamp = /Math\.min\b/.test(text) && /Math\.max\b/.test(text);
      const usesConditionalClamp = /\b0\b/.test(text) && /\b100\b/.test(text) && /(\?|[<>]=?)/.test(text);
      const clamps = usesMathClamp || usesConditionalClamp;
      if (definesFunction && clamps) return 92;
      if (clamps) return 72;
      if (definesFunction) return 58;
      return 38;
    }

    // Any other coding question: all this can honestly tell is whether the
    // answer contains code at all. Whether the code is CORRECT needs the judge,
    // and HEURISTIC_BLIND_TYPES says so rather than dressing this up as a mark.
    const looksLikeCode = /```/.test(text)
      || definesFunction
      || /\bdef\s+\w+\s*\(/.test(text)
      || /\bclass\s+\w+/.test(text)
      || /\bSELECT\b[\s\S]*\bFROM\b/i.test(text);
    return looksLikeCode ? 70 : 30;
  }

  // Everything else — 'assistant', and any future open-ended type — reaches
  // here. There is no rule that marks a good conversational answer, so this
  // scores by LENGTH: 78 for anything, up to 92 for a long one. It is not a
  // quality measurement and must never be presented as one; see
  // HEURISTIC_BLIND_TYPES, which is what stops it crowning a winner.
  return clamp(78 + Math.min(14, Math.floor(text.length / 80)));
}

/**
 * Question types the heuristic cannot actually grade.
 *
 * For these it returns a number anyway — a length proxy for prose, a
 * has-code-or-not check for general coding — because the run still needs a
 * value. But a number that does not measure quality must not be allowed to
 * crown a winner or fill a scorecard as though it did. The judge grades these
 * properly; without one, the app says so.
 */
const HEURISTIC_BLIND_TYPES = ['assistant', 'writing'];

function heuristicCanGrade(type, prompt) {
  if (HEURISTIC_BLIND_TYPES.includes(type)) return false;
  // Coding is gradeable only for the one question this scorer knows.
  if (type === 'coding') return ASKS_FOR_CLAMP.test(String(prompt || ''));
  return true;
}

function getBenchmarkPromptStatus(response, doneReason) {
  if (!String(response || '').trim()) return 'no-response';

  const reason = String(doneReason || '').toLowerCase();
  if (/(?:length|timeout|error|cancel|abort|fail)/.test(reason)) return 'truncated';

  return 'ok';
}

function buildPromptDiagnostic({
  responseText = '',
  doneReason = '',
  evalCount = 0,
  evalDurationSeconds = 0,
  elapsedMs = 0,
  status,
  thinkingDisabled = BENCHMARK_THINK_DISABLED,
} = {}) {
  const normalizedStatus = status || getBenchmarkPromptStatus(responseText, doneReason);
  const reason = String(doneReason || 'unknown').toLowerCase();
  const tokenText = Number.isFinite(evalCount) && evalCount > 0 ? `${Math.round(evalCount)} eval tokens` : 'no reported eval tokens';
  const durationText = Number.isFinite(evalDurationSeconds) && evalDurationSeconds > 0
    ? `${Math.round(evalDurationSeconds * 1000)} ms eval time`
    : Number.isFinite(elapsedMs) && elapsedMs > 0
      ? `${Math.round(elapsedMs)} ms wall time`
      : 'no reported duration';

  if (normalizedStatus === 'no-response') {
    if (reason.includes('length')) {
      return thinkingDisabled
        ? `No visible answer; Ollama hit the output limit after ${tokenText} with thinking disabled (${durationText}).`
        : `No visible answer; Ollama used ${tokenText} before the output limit, likely in hidden thinking (${durationText}).`;
    }
    if (/(?:timeout|cancel|abort)/.test(reason)) {
      return `No visible answer; generation ended with ${doneReason || 'timeout/cancel'} (${durationText}).`;
    }
    return `No visible answer returned by Ollama (${doneReason || 'unknown finish reason'}; ${tokenText}; ${durationText}).`;
  }

  if (normalizedStatus === 'truncated') {
    return `Answer may be incomplete; Ollama finished with ${doneReason || 'unknown reason'} after ${tokenText}.`;
  }

  if (normalizedStatus === 'failed') {
    return `Benchmark request failed (${doneReason || 'unknown error'}).`;
  }

  return '';
}

function summarizePromptDiagnostics(diagnostics) {
  const unique = [];
  for (const diagnostic of diagnostics) {
    const text = String(diagnostic || '').trim();
    if (text && !unique.includes(text)) unique.push(text);
  }
  return unique.join(' ');
}

function summarizeDoneReasons(reasons) {
  const counts = reasons.reduce((summary, reason) => {
    const key = reason || 'unknown';
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});

  return Object.entries(counts)
    .map(([reason, count]) => count === 1 ? reason : `${reason} x${count}`)
    .join(', ');
}

function summarizePromptStatuses(statuses) {
  if (statuses.some((status) => status === 'no-response')) return 'no-response';
  if (statuses.some((status) => status === 'failed')) return 'failed';
  if (statuses.some((status) => status === 'truncated')) return 'truncated';
  return 'ok';
}

function isStableBenchmarkRun(result) {
  if (result.status === 'no-response' || result.status === 'failed' || result.status === 'truncated') return false;
  if (!String(result.response || '').trim()) return false;

  const reason = String(result.doneReason || '').toLowerCase();
  if (!reason || reason === 'complete' || reason === 'stop') return true;

  return !/(?:length|timeout|error|cancel|abort|fail)/.test(reason);
}

function normalizePositiveNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function durationNsToMs(value) {
  const numberValue = normalizePositiveNumber(value);
  return numberValue == null ? null : Math.round(numberValue / 1_000_000);
}

function estimateTokens(text) {
  return Math.max(1, Math.round(text.split(/\s+/).length * 1.3));
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

// Median is more robust than the mean for timing samples, where a single
// background-load spike on one run would otherwise drag the average.
function median(values) {
  const valid = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
}

function clamp(value) {
  return Math.min(100, Math.max(0, value));
}

module.exports = {
  BENCHMARK_THINK_DISABLED,
  HEURISTIC_BLIND_TYPES,
  heuristicCanGrade,
  buildBenchmarkGenerateBody,
  buildPromptDiagnostic,
  summarizePromptDiagnostics,
  scoreSobriety,
  getBenchmarkPromptStatus,
  summarizeDoneReasons,
  summarizePromptStatuses,
  isStableBenchmarkRun,
  normalizePositiveNumber,
  durationNsToMs,
  estimateTokens,
  average,
  median,
  clamp,
};
