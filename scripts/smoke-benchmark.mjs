#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildBenchmarkPromptPlan } = require('../electron/benchmarkSuite.cjs');
const {
  buildBenchmarkGenerateBody,
  buildPromptDiagnostic,
  getBenchmarkPromptStatus,
  scoreSobriety,
  estimateTokens,
  average,
  clamp,
} = require('../electron/benchmarkScoring.cjs');

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_KEEP_ALIVE = '10m';
const BENCHMARK_OPTIONS = Object.freeze({
  temperature: 0,
  seed: 1,
  num_predict: 300,
  num_ctx: 2048,
});

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    models: [],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    keepAlive: DEFAULT_KEEP_ALIVE,
    questionCount: 10,
    repeat: 1,
    compareThinking: true,
    strict: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === '--model' || arg === '-m') && next) {
      args.models.push(...next.split(',').map((model) => model.trim()).filter(Boolean));
      i += 1;
    } else if ((arg === '--base-url' || arg === '-u') && next) {
      args.baseUrl = next.replace(/\/+$/, '');
      i += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Number(next) || DEFAULT_TIMEOUT_MS;
      i += 1;
    } else if (arg === '--question-count' && next) {
      args.questionCount = Number(next) || 10;
      i += 1;
    } else if (arg === '--repeat' && next) {
      args.repeat = Math.max(1, Math.min(5, Number(next) || 1));
      i += 1;
    } else if (arg === '--keep-alive' && next) {
      args.keepAlive = next;
      i += 1;
    } else if (arg === '--no-thinking-compare') {
      args.compareThinking = false;
    } else if (arg === '--strict') {
      args.strict = true;
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
  npm run smoke:bench -- --model qwen3:1.7b
  npm run smoke:bench -- --model gemma3:1b,qwen3:1.7b --repeat 3 --strict

Options:
  -m, --model <name>          Ollama model name. Repeat or comma-separate for multiple models.
  -u, --base-url <url>        Ollama base URL. Default: ${DEFAULT_BASE_URL}
  --question-count <number>   RigMatch question count. Default: 10
  --repeat <number>           Repeat RigMatch-mode runs per prompt, max 5. Default: 1
  --timeout-ms <number>       Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --keep-alive <value>        Ollama keep_alive. Default: ${DEFAULT_KEEP_ALIVE}
  --no-thinking-compare       Skip one Ollama-default probe per prompt.
  --strict                    Exit non-zero when RigMatch-mode prompts are empty/truncated/failed.
  --json                      Print JSON only.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const models = args.models.length ? args.models : await pickSmokeModels(args.baseUrl, args.timeoutMs);
  if (!models.length) {
    throw new Error(`No model provided and no local models were returned by ${args.baseUrl}/api/tags`);
  }

  const prompts = buildBenchmarkPromptPlan(args.questionCount);
  const reports = [];

  for (const model of models) {
    reports.push(await smokeModel({ args, model, prompts }));
  }

  const summary = {
    ranAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    questionCount: prompts.length,
    repeat: args.repeat,
    compareThinking: args.compareThinking,
    reports,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printReport(summary);
  }

  if (args.strict && reports.some((report) => report.releaseBlockers.length > 0)) {
    process.exitCode = 1;
  }
}

async function smokeModel({ args, model, prompts }) {
  await runGenerate({
    baseUrl: args.baseUrl,
    model,
    prompt: 'Reply READY only.',
    timeoutMs: args.timeoutMs,
    keepAlive: args.keepAlive,
    options: { ...BENCHMARK_OPTIONS, num_predict: 8 },
    thinkMode: 'rigmatch',
  });

  const rows = [];

  for (const prompt of prompts) {
    if (args.compareThinking) {
      rows.push(await runPromptCase({ args, model, prompt, runIndex: 1, thinkMode: 'ollama-default' }));
    }

    for (let runIndex = 1; runIndex <= args.repeat; runIndex += 1) {
      rows.push(await runPromptCase({ args, model, prompt, runIndex, thinkMode: 'rigmatch' }));
    }
  }

  const rigmatchRows = rows.filter((row) => row.thinkMode === 'rigmatch');
  const quality = Math.round(average(rigmatchRows.map((row) => row.sobrietyScore)));
  const speed = clamp(Math.round((average(rigmatchRows.map((row) => row.tokensPerSecond)) - 5) / 95 * 100));
  const stability = Math.round((rigmatchRows.filter((row) => row.status === 'ok').length / Math.max(1, rigmatchRows.length)) * 100);
  const releaseBlockers = rigmatchRows
    .filter((row) => row.status !== 'ok')
    .map((row) => `${row.promptId}/${row.thinkMode}: ${row.status} (${row.doneReason || 'unknown'})`);

  return {
    model,
    scoresWithoutFit: {
      speed,
      quality,
      stability,
      totalWithoutFit: clamp(Math.round(speed * 0.38 + quality * 0.42 + stability * 0.20)),
    },
    releaseBlockers,
    rows,
  };
}

async function runPromptCase({ args, model, prompt, runIndex, thinkMode }) {
  const startedAt = performance.now();
  const data = await runGenerate({
    baseUrl: args.baseUrl,
    model,
    prompt: prompt.prompt,
    timeoutMs: args.timeoutMs,
    keepAlive: args.keepAlive,
    options: BENCHMARK_OPTIONS,
    thinkMode,
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const responseText = String(data.response || '');
  const evalCount = normalizeNumber(data.eval_count) || estimateTokens(responseText);
  const evalDurationSeconds = normalizeNumber(data.eval_duration)
    ? Number(data.eval_duration) / 1_000_000_000
    : elapsedMs / 1000;
  const tokensPerSecond = evalDurationSeconds > 0 ? Math.round((evalCount / evalDurationSeconds) * 10) / 10 : 0;
  const doneReason = data.done_reason || (data.done ? 'stop' : 'unknown');
  const status = getBenchmarkPromptStatus(responseText, doneReason);
  const diagnostic = buildPromptDiagnostic({
    responseText,
    doneReason,
    evalCount,
    evalDurationSeconds,
    elapsedMs,
    status,
    thinkingDisabled: thinkMode === 'rigmatch',
  });

  return {
    model,
    promptId: prompt.id,
    label: prompt.label,
    type: prompt.type,
    runIndex,
    thinkMode,
    status,
    doneReason,
    responseLength: responseText.length,
    evalCount,
    evalDurationMs: Math.round(evalDurationSeconds * 1000),
    elapsedMs,
    tokensPerSecond,
    sobrietyScore: scoreSobriety(prompt, responseText),
    diagnostic,
    preview: preview(responseText),
  };
}

async function runGenerate({ baseUrl, model, prompt, timeoutMs, keepAlive, options, thinkMode }) {
  const body = thinkMode === 'rigmatch'
    ? buildBenchmarkGenerateBody({ model, prompt, keepAlive, options })
    : {
      model,
      prompt,
      stream: false,
      keep_alive: keepAlive,
      options,
    };

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${model} request failed: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }

  return response.json();
}

async function pickSmokeModels(baseUrl, timeoutMs) {
  const response = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not list Ollama models: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }

  const data = await response.json();
  const names = (data.models || []).map((model) => model.model || model.name).filter(Boolean);
  const qwen = names.find((name) => /qwen3:1\.7b/i.test(name)) || names.find((name) => /qwen/i.test(name));
  const first = names[0];
  return [...new Set([qwen, first].filter(Boolean))].slice(0, 2);
}

function printReport(summary) {
  console.log('RigMatch benchmark smoke');
  console.log(`Base URL: ${summary.baseUrl}`);
  console.log(`Questions: ${summary.questionCount}`);
  console.log(`Repeat: ${summary.repeat}`);
  console.log(`Thinking compare: ${summary.compareThinking ? 'on' : 'off'}`);
  console.log('');

  for (const report of summary.reports) {
    console.log(`## ${report.model}`);
    console.log(`Scores without fit: speed ${report.scoresWithoutFit.speed}, quality ${report.scoresWithoutFit.quality}, stability ${report.scoresWithoutFit.stability}, total ${report.scoresWithoutFit.totalWithoutFit}`);
    if (report.releaseBlockers.length) {
      console.log(`Release blockers: ${report.releaseBlockers.join('; ')}`);
    } else {
      console.log('Release blockers: none in RigMatch-mode runs');
    }

    console.table(report.rows.map((row) => ({
      prompt: row.label,
      mode: row.thinkMode,
      run: row.runIndex,
      status: row.status,
      quality: row.sobrietyScore,
      tok_s: row.tokensPerSecond,
      eval: row.evalCount,
      reason: row.doneReason,
      chars: row.responseLength,
      note: row.diagnostic || '',
    })));

    const emptyDefault = report.rows.filter((row) => row.thinkMode === 'ollama-default' && row.status === 'no-response');
    const fixedByRigMatch = emptyDefault.filter((defaultRow) => report.rows.some((row) =>
      row.thinkMode === 'rigmatch'
      && row.promptId === defaultRow.promptId
      && row.status === 'ok'
    ));
    if (fixedByRigMatch.length) {
      console.log(`Thinking-mode rescue: ${fixedByRigMatch.length} prompt(s) were empty in Ollama default mode but passed in RigMatch mode.`);
    }
    console.log('');
  }
}

function normalizeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function preview(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').slice(0, 220);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
