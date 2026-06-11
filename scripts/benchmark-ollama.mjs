#!/usr/bin/env node

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_KEEP_ALIVE = '10m';

const BENCHMARKS = [
  {
    id: 'coding',
    label: 'Coding',
    type: 'coding',
    prompt:
      'Write a JavaScript function called clampValue(n, min, max) that clamps a number between min and max. Return only the function, no explanation.',
  },
  {
    id: 'format',
    label: 'Format',
    type: 'format',
    prompt: 'List 5 tips for writing clean code. Use a bullet point list.',
  },
  {
    id: 'json',
    label: 'JSON',
    type: 'json',
    prompt: 'Return a JSON object with fields: name, version, and description for a fictional app.',
  },
  {
    id: 'truth',
    label: 'Truth',
    type: 'truth',
    prompt: 'What is the current Bitcoin price right now?',
  },
  {
    id: 'speed',
    label: 'Speed',
    type: 'speed',
    prompt:
      'Write a JavaScript function called clampValue(n, min, max) that clamps a number between min and max. Return only the function, no explanation.',
  },
];

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    model: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
    temperature: 0,
    seed: 1,
    numPredict: 512,
    keepAlive: DEFAULT_KEEP_ALIVE,
    warmup: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === '--model' || arg === '-m') && next) {
      args.model = next;
      i += 1;
    } else if ((arg === '--base-url' || arg === '-u') && next) {
      args.baseUrl = next.replace(/\/+$/, '');
      i += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Number(next) || DEFAULT_TIMEOUT_MS;
      i += 1;
    } else if (arg === '--temperature' && next) {
      args.temperature = Number(next);
      i += 1;
    } else if (arg === '--seed' && next) {
      args.seed = Number(next);
      i += 1;
    } else if (arg === '--num-predict' && next) {
      args.numPredict = Number(next) || 512;
      i += 1;
    } else if (arg === '--keep-alive' && next) {
      args.keepAlive = next;
      i += 1;
    } else if (arg === '--no-warmup') {
      args.warmup = false;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/benchmark-ollama.mjs --model qwen2.5:7b
  npm run benchmark:ollama -- --model qwen2.5:7b

Options:
  -m, --model <name>       Ollama model name. If omitted, the first local model is used.
  -u, --base-url <url>     Ollama base URL. Default: ${DEFAULT_BASE_URL}
  --timeout-ms <number>    Per-prompt timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --temperature <number>   Ollama temperature. Default: 0
  --seed <number>          Ollama seed. Default: 1
  --num-predict <number>   Ollama num_predict. Default: 512
  --keep-alive <value>     Ollama keep_alive. Default: ${DEFAULT_KEEP_ALIVE}
  --no-warmup              Skip the unscored Warm-up Period request.
  --json                   Print machine-readable JSON only.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = args.model || await pickFirstLocalModel(args.baseUrl, args.timeoutMs);

  if (!model) {
    throw new Error(`No model provided and no local models were returned by ${args.baseUrl}/api/tags`);
  }

  if (args.warmup) {
    await runPrompt({
      baseUrl: args.baseUrl,
      model,
      benchmark: {
        id: 'warmup',
        label: 'Warm-up Period',
        type: 'assistant',
        prompt: 'Reply with READY only.',
      },
      timeoutMs: args.timeoutMs,
      temperature: args.temperature,
      seed: args.seed,
      numPredict: 8,
      keepAlive: args.keepAlive,
    });
  }

  const results = [];

  for (const benchmark of BENCHMARKS) {
    const run = await runPrompt({
      baseUrl: args.baseUrl,
      model,
      benchmark,
      timeoutMs: args.timeoutMs,
      temperature: args.temperature,
      seed: args.seed,
      numPredict: args.numPredict,
      keepAlive: args.keepAlive,
    });

    results.push(run);
  }

  const summary = buildSummary({ model, baseUrl: args.baseUrl, warmup: args.warmup, results });

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printReport(summary);
}

async function pickFirstLocalModel(baseUrl, timeoutMs) {
  const response = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not list Ollama models: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }

  const data = await response.json();
  return data.models?.[0]?.model || data.models?.[0]?.name || '';
}

async function runPrompt({ baseUrl, model, benchmark, timeoutMs, temperature, seed, numPredict, keepAlive }) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: benchmark.prompt,
      stream: false,
      keep_alive: keepAlive,
      options: {
        temperature,
        seed,
        num_predict: numPredict,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const elapsedMs = Math.round(performance.now() - startedAt);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${benchmark.label} failed: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }

  const data = await response.json();
  const rawResponse = String(data.response || '');
  const evalCount = normalizeNumber(data.eval_count) ?? estimateTokens(rawResponse);
  const evalDurationSeconds = normalizeNumber(data.eval_duration)
    ? Number(data.eval_duration) / 1_000_000_000
    : elapsedMs / 1000;
  const tokensPerSecond = evalDurationSeconds > 0
    ? Math.round((evalCount / evalDurationSeconds) * 10) / 10
    : 0;
  const score = scoreResponse(benchmark.type, rawResponse, { tokensPerSecond, elapsedMs });
  const rigmatchScore = scoreRigMatchCurrent(benchmark.type, rawResponse, { tokensPerSecond, elapsedMs });
  const status = getPromptStatus(rawResponse, data.done_reason);

  return {
    id: benchmark.id,
    label: benchmark.label,
    type: benchmark.type,
    prompt: benchmark.prompt,
    rawResponse,
    elapsedMs,
    tokensPerSecond,
    evalCount,
    done: Boolean(data.done),
    doneReason: data.done_reason || null,
    status,
    score,
    rigmatchScore,
  };
}

function scoreResponse(type, response, timing) {
  if (type === 'coding') return scoreCoding(response);
  if (type === 'format') return scoreFormat(response);
  if (type === 'json') return scoreJson(response);
  if (type === 'truth') return scoreTruth(response);
  if (type === 'speed') {
    return {
      value: scoreSpeed(timing.tokensPerSecond, timing.elapsedMs),
      flags: [`${timing.tokensPerSecond} tok/s`, `${timing.elapsedMs} ms`],
    };
  }

  return { value: 0, flags: ['Unknown prompt type'] };
}

function scoreCoding(response) {
  const text = response.trim();
  const code = stripMarkdownFence(text);
  const hasName = /\bclampValue\b/.test(code);
  const hasFunctionShape = /\bfunction\s+clampValue\s*\(|\b(?:const|let|var)\s+clampValue\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(code);
  const usesMathClamp = /Math\.min\s*\(/.test(code) && /Math\.max\s*\(/.test(code);
  const usesConditionalClamp = /if\s*\([^)]*<\s*min[^)]*\)|if\s*\([^)]*>\s*max[^)]*\)|\?\s*min\s*:|\?\s*max\s*:/.test(code);
  const hasClampLogic = usesMathClamp || usesConditionalClamp;
  const hasWrapper = text !== code;
  const hasExplanation = /here('| i)?s|explanation|this function|it clamps/i.test(text.replace(code, ''));
  const flags = [
    hasName ? 'has clampValue' : 'missing clampValue',
    hasFunctionShape ? 'function shape ok' : 'function shape weak',
    hasClampLogic ? 'clamp logic found' : 'clamp logic missing',
    hasWrapper || hasExplanation ? 'extra prose/fence detected' : 'function-only shape',
  ];

  if (hasName && hasFunctionShape && hasClampLogic && !hasWrapper && !hasExplanation) return { value: 96, flags };
  if (hasName && hasFunctionShape && hasClampLogic) return { value: 86, flags };
  if (hasName && hasClampLogic) return { value: 76, flags };
  if (hasClampLogic) return { value: 64, flags };
  if (/function|=>|\breturn\b/.test(code)) return { value: 48, flags };
  return { value: 24, flags };
}

function scoreFormat(response) {
  const lines = response.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const isBullet = (line) => /^[-*+]\s+\S|^•\s+\S/.test(line);
  const isNumbered = (line) => /^\d+[.)]\s+\S/.test(line);
  const bulletCount = lines.filter(isBullet).length;
  const numberedCount = lines.filter(isNumbered).length;
  const listCount = bulletCount + numberedCount;
  const extraLineCount = lines.filter((line) => !isBullet(line) && !isNumbered(line)).length;
  const flags = [
    `${bulletCount} bullet item${bulletCount === 1 ? '' : 's'}`,
    `${numberedCount} numbered item${numberedCount === 1 ? '' : 's'}`,
    `${listCount} total list item${listCount === 1 ? '' : 's'}`,
    extraLineCount > 0 ? `${extraLineCount} non-list line${extraLineCount === 1 ? '' : 's'}` : 'list-only output',
  ];

  if (bulletCount === 5 && extraLineCount === 0) return { value: 96, flags };
  if (bulletCount === 5) return { value: 88, flags: [...flags, 'extra prose before/after list'] };
  if (numberedCount === 5 && extraLineCount === 0) return { value: 82, flags: [...flags, 'numbered list is usable but not exact'] };
  if (numberedCount === 5) return { value: 76, flags: [...flags, 'numbered list plus extra prose'] };
  if (listCount === 5) return { value: 76, flags };
  if (listCount >= 4 && listCount <= 6) return { value: 68, flags };
  if (listCount > 0) return { value: 48, flags };
  return { value: 20, flags };
}

function scoreJson(response) {
  const text = response.trim();
  const unfenced = stripMarkdownFence(text);
  const strict = parseJson(unfenced);
  const extracted = strict.ok ? strict : parseJson(extractFirstJsonObject(unfenced));
  const parsed = extracted.ok && isPlainObject(extracted.value) ? extracted.value : null;
  const hasRequiredKeys = parsed
    ? ['name', 'version', 'description'].every((key) => Object.prototype.hasOwnProperty.call(parsed, key))
    : false;
  const extraWrapper = text !== unfenced || unfenced !== extractFirstJsonObject(unfenced);
  const flags = [
    parsed ? 'valid object JSON' : 'not valid object JSON',
    hasRequiredKeys ? 'required keys present' : 'required keys missing',
    extraWrapper ? 'wrapper/fence/prose detected' : 'raw JSON only',
  ];

  if (parsed && hasRequiredKeys && !extraWrapper) return { value: 96, flags };
  if (parsed && hasRequiredKeys) return { value: 86, flags };
  if (parsed && Object.keys(parsed).length >= 3) return { value: 72, flags };
  if (/\{[\s\S]*\}/.test(text)) return { value: 42, flags };
  return { value: 18, flags };
}

function scoreTruth(response) {
  const text = response.trim();
  const admitsNoLiveData = /cannot|can't|can not|do not know|don't know|not provided|no access|not have access|unable|not able|real[- ]?time|right now|current price|live data|up[- ]?to[- ]?date|check (?:a|an)?\s*(?:exchange|source|website)|as an ai/i.test(text);
  const givesPrice = /(?:\$|USD|US\$)\s*\d[\d,.]*|\d[\d,.]*\s*(?:USD|dollars)|BTC\s*(?:is|=|:)\s*\d/i.test(text);
  const flags = [
    admitsNoLiveData ? 'admits no live price access' : 'does not admit no live price access',
    givesPrice ? 'appears to give a price' : 'does not give a price',
  ];

  if (admitsNoLiveData && !givesPrice) return { value: 96, flags };
  if (admitsNoLiveData && givesPrice) return { value: 68, flags: [...flags, 'caveated hallucination risk'] };
  if (!admitsNoLiveData && givesPrice) return { value: 28, flags };
  return { value: 44, flags };
}

function scoreSpeed(tokensPerSecond, elapsedMs) {
  return clamp(Math.round(((tokensPerSecond - 5) / 95) * 100 + Math.max(0, 5 - elapsedMs / 200)));
}

function scoreRigMatchCurrent(type, response, timing) {
  if (type === 'speed') {
    return {
      value: scoreSpeed(timing.tokensPerSecond, timing.elapsedMs),
      flags: ['RigMatch speed formula'],
    };
  }

  const text = response.trim();
  if (!text) return { value: 0, flags: ['empty response'] };

  if (type === 'json') {
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(jsonText);
      const keys = Object.keys(parsed).length;
      if (keys >= 4) return { value: 92, flags: [`${keys} JSON keys`] };
      if (keys >= 3) return { value: 82, flags: [`${keys} JSON keys`] };
      if (keys >= 2) return { value: 70, flags: [`${keys} JSON keys`] };
      return { value: 52, flags: [`${keys} JSON keys`] };
    } catch {
      return {
        value: jsonText.includes('{') && jsonText.includes('}') ? 42 : 22,
        flags: ['JSON parse failed'],
      };
    }
  }

  if (type === 'truth') {
    const admits = /cannot|can't|can not|not provided|not enough|don't know|do not know|unknown|unable|not able|no information|not aware|no way to|outside my|beyond my|do not have|i have no|don't have access|do not have access|not available|isn't available|is not available|lack(?:s)? (?:the )?(?:access|ability|information|context)|without (?:access|knowing|that information)|not (?:been )?(?:given|provided|told)/i.test(text);
    return {
      value: admits ? 96 : 38,
      flags: [admits ? 'admission phrase found' : 'no admission phrase found'],
    };
  }

  if (type === 'format') {
    const lines = text.split('\n');
    const bulletLines = lines.filter((line) => /^\s*[-*•]\s/.test(line)).length;
    const numberedLines = lines.filter((line) => /^\s*(?:\d+|[a-z])[.)]\s/i.test(line)).length;
    const listLines = bulletLines + numberedLines;
    if (listLines >= 2 && listLines <= 5) return { value: 92, flags: [`${listLines} list lines`] };
    if (listLines === 1) return { value: 65, flags: [`${listLines} list line`] };
    if (listLines > 5) return { value: 75, flags: [`${listLines} list lines`] };
    return { value: 48, flags: ['no list lines'] };
  }

  if (type === 'coding') {
    const hasFunction = /function\s+clampScore|const\s+clampScore|clampScore\s*[=(]|=>/.test(text);
    const hasClamping = /Math\.min|Math\.max/.test(text);
    if (hasFunction && hasClamping) return { value: 92, flags: ['RigMatch function+Math clamp match'] };
    if (hasClamping) return { value: 72, flags: ['RigMatch Math clamp only'] };
    if (/function|const|=>/.test(text)) return { value: 58, flags: ['RigMatch function shape only'] };
    return { value: 38, flags: ['RigMatch no code match'] };
  }

  return { value: 0, flags: ['not mirrored'] };
}

function buildSummary({ model, baseUrl, warmup, results }) {
  const promptScores = results.filter((result) => result.type !== 'speed').map((result) => result.score.value);
  const speedResult = results.find((result) => result.type === 'speed');
  const stabilityScore = Math.round((results.filter((result) => result.done && result.status === 'ok').length / results.length) * 100);
  const sobrietyScore = Math.round(average(promptScores));
  const speedScore = speedResult?.score.value ?? 0;

  return {
    model,
    baseUrl,
    warmup,
    ranAt: new Date().toISOString(),
    scores: {
      speed: speedScore,
      sobriety: sobrietyScore,
      stability: stabilityScore,
      validatorTotalWithoutFit: clamp(Math.round(speedScore * 0.4 + sobrietyScore * 0.42 + stabilityScore * 0.18)),
    },
    results,
  };
}

function printReport(summary) {
  console.log(`RigMatch Ollama benchmark validator`);
  console.log(`Model: ${summary.model}`);
  console.log(`Base URL: ${summary.baseUrl}`);
  console.log(`Ran: ${summary.ranAt}`);
  if (summary.warmup) {
    console.log('Warm-up Period: unscored model load request completed before measurement.');
  }
  console.log('');

  for (const result of summary.results) {
    console.log(`## ${result.label} (${result.score.value}/100, ${result.tokensPerSecond} tok/s, ${result.elapsedMs} ms)`);
    console.log(`RigMatch current scorer: ${result.rigmatchScore.value}/100 (${result.rigmatchScore.flags.join('; ')})`);
    console.log(`Status: ${result.status}`);
    console.log(`Prompt: ${result.prompt}`);
    console.log(`Flags: ${result.score.flags.join('; ')}`);
    console.log('Raw response:');
    console.log('```');
    console.log(result.rawResponse.trim() || '[empty response]');
    console.log('```');
    console.log('');
  }

  console.log('Summary:');
  console.table(summary.results.map((result) => ({
    prompt: result.label,
    rigmatch: result.rigmatchScore.value,
    score: result.score.value,
    delta: result.score.value - result.rigmatchScore.value,
    tok_s: result.tokensPerSecond,
    ms: result.elapsedMs,
    done: result.done,
    reason: result.doneReason || '',
    status: result.status,
  })));
  console.log(`Sobriety: ${summary.scores.sobriety}/100`);
  console.log(`Speed: ${summary.scores.speed}/100`);
  console.log(`Stability: ${summary.scores.stability}/100`);
  console.log(`Validator total without fit: ${summary.scores.validatorTotalWithoutFit}/100`);
}

function stripMarkdownFence(text) {
  return text
    .replace(/^```(?:json|javascript|js)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function getPromptStatus(response, doneReason) {
  if (!String(response || '').trim()) return 'no-response';

  const reason = String(doneReason || '').toLowerCase();
  if (/(?:length|timeout|error|cancel|abort|fail)/.test(reason)) return 'truncated';

  return 'ok';
}

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function estimateTokens(text) {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length * 1.3));
}

function normalizeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function clamp(value) {
  return Math.min(100, Math.max(0, value));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
