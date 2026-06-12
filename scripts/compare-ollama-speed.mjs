#!/usr/bin/env node

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_PROMPT = 'Write a compact JavaScript function named clampScore that accepts a number and returns it clamped between 0 and 100. Return only the function, no explanation.';
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_KEEP_ALIVE = '10m';

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    model: '',
    prompt: DEFAULT_PROMPT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    numPredict: 300,
    temperature: 0,
    seed: 1,
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
    } else if (arg === '--prompt' && next) {
      args.prompt = next;
      i += 1;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = Number(next) || DEFAULT_TIMEOUT_MS;
      i += 1;
    } else if (arg === '--num-predict' && next) {
      args.numPredict = Number(next) || 300;
      i += 1;
    } else if (arg === '--temperature' && next) {
      args.temperature = Number(next);
      i += 1;
    } else if (arg === '--seed' && next) {
      args.seed = Number(next);
      i += 1;
    } else if (arg === '--keep-alive' && next) {
      args.keepAlive = next;
      i += 1;
    } else if (arg === '--no-warmup') {
      args.warmup = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run compare:ollama-speed -- --model qwen2.5:7b

Options:
  -m, --model <name>       Ollama model name. If omitted, the first local model is used.
  -u, --base-url <url>     Ollama base URL. Default: ${DEFAULT_BASE_URL}
  --prompt <text>          Prompt to test. Default matches RigMatch's coding probe.
  --timeout-ms <number>    Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --num-predict <number>   Ollama num_predict. Default: 300
  --temperature <number>   Ollama temperature. Default: 0
  --seed <number>          Ollama seed. Default: 1
  --keep-alive <value>     Ollama keep_alive. Default: ${DEFAULT_KEEP_ALIVE}
  --no-warmup              Skip the unscored Warm-up Period request.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = args.model || await pickFirstLocalModel(args.baseUrl, args.timeoutMs);
  if (!model) throw new Error(`No model provided and no local models were returned by ${args.baseUrl}/api/tags`);

  console.log(`Ollama speed comparison`);
  console.log(`Model: ${model}`);
  console.log(`Base URL: ${args.baseUrl}`);
  console.log(`Prompt: ${args.prompt}`);
  console.log('');

  if (args.warmup) {
    console.log('Warm-up Period: loading the model before measurement. This request is not scored...');
    await runParityRequest({
      ...args,
      model,
      prompt: 'Reply with READY only.',
      numPredict: 16,
    });
    console.log('');
  }

  const baseline = await runParityRequest({ ...args, model });
  const rigmatchParity = await runParityRequest({ ...args, model });

  console.table([
    toRow('Ollama API parity request', baseline),
    toRow('RigMatch parity request', rigmatchParity),
  ]);

  const delta = Math.round((rigmatchParity.tokensPerSecond - baseline.tokensPerSecond) * 10) / 10;
  const percent = baseline.tokensPerSecond > 0
    ? Math.round((delta / baseline.tokensPerSecond) * 100)
    : 0;
  console.log('');
  console.log(`Run-to-run delta: ${delta >= 0 ? '+' : ''}${delta} tok/s (${percent >= 0 ? '+' : ''}${percent}%)`);
  console.log('');
  console.log(`Baseline response preview: ${preview(baseline.response)}`);
  console.log(`RigMatch parity response preview: ${preview(rigmatchParity.response)}`);
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

async function runParityRequest({ baseUrl, model, prompt, timeoutMs, numPredict, temperature, seed, keepAlive }) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      keep_alive: keepAlive,
      think: false,
      options: {
        temperature,
        seed,
        num_predict: numPredict,
        num_ctx: 2048,
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const wallMs = Math.round(performance.now() - startedAt);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`parity request failed: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }

  const data = await response.json();
  return normalizeRun({ data, wallMs, responseText: data.response || '', firstTokenMs: null });
}

function normalizeRun({ data, wallMs, responseText, firstTokenMs }) {
  const evalCount = normalizeNumber(data.eval_count) ?? estimateTokens(responseText);
  const evalDurationSeconds = normalizeNumber(data.eval_duration)
    ? Number(data.eval_duration) / 1_000_000_000
    : wallMs / 1000;
  const tokensPerSecond = evalDurationSeconds > 0
    ? Math.round((evalCount / evalDurationSeconds) * 10) / 10
    : 0;

  return {
    response: responseText,
    doneReason: data.done_reason || null,
    evalCount,
    tokensPerSecond,
    wallMs,
    evalMs: Math.round(evalDurationSeconds * 1000),
    promptEvalMs: durationNsToMs(data.prompt_eval_duration),
    loadMs: durationNsToMs(data.load_duration),
    firstTokenMs,
  };
}

function toRow(label, run) {
  return {
    mode: label,
    tok_s: run.tokensPerSecond,
    wall_ms: run.wallMs,
    eval_ms: run.evalMs,
    prompt_eval_ms: run.promptEvalMs,
    load_ms: run.loadMs,
    first_token_ms: run.firstTokenMs ?? '',
    eval_count: run.evalCount,
    done_reason: run.doneReason || '',
    think: false,
  };
}

function durationNsToMs(value) {
  const numberValue = normalizeNumber(value);
  return numberValue == null ? '' : Math.round(numberValue / 1_000_000);
}

function normalizeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function estimateTokens(text) {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length * 1.3));
}

function formatMs(value) {
  if (value == null) return 'n/a';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function preview(text) {
  return text.trim().replace(/\s+/g, ' ').slice(0, 180) || '[empty]';
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
