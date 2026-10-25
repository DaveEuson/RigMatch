// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * rigmatch-fit: which local AI models will run well on this computer.
 *
 *   npx rigmatch-fit                  the best 20 for this PC
 *   npx rigmatch-fit --all            every model, including the ones that will not fit
 *   npx rigmatch-fit --installed      only the models Ollama already has
 *   npx rigmatch-fit --json           every model, for scripts
 *   npx rigmatch-fit --provider lmstudio
 *   npx rigmatch-fit --vram 16        grade for a 16 GB card instead of this one
 *   npx rigmatch-fit --measure        RigScore's speed test on the tier models installed here
 *   npx rigmatch-fit --measure qwen3.5:9b   one installed model's real speed, beside the estimate
 *
 * Reads the hardware the way the RigMatch app does (resolveGpuPool in
 * electron/systemProfile.cjs) and asks a local Ollama, if one answers, what is
 * installed. Nothing is downloaded and nothing is sent anywhere else.
 * --measure runs models on that Ollama (measure.ts) and unloads them after.
 */

import { execFile } from 'node:child_process';
import os from 'node:os';
import { parseArgs } from 'node:util';
import si from 'systeminformation';
import pkg from './package.json' with { type: 'json' };
import systemProfile from '../electron/systemProfile.cjs';
import security from '../electron/security.cjs';
import { catalogRows, formatTable, ollamaUrl, rankModels, toJson, type FitHardware, type InstalledModel, type Provider } from './fitCheck.ts';
import {
  checkCard, checkMeasureArgs, formatIntro, formatModelDone, formatModelIntro, formatModelReport, formatProgress, formatReport, formatTierDone,
  measureModel, measureTiers, planTiers, runRequest, toMeasureJson, toModelJson, type CardNote, type MeasureDeps,
} from './measure.ts';

const HELP = `rigmatch-fit ${pkg.version}: which local AI models will run well on this computer

Usage: rigmatch-fit [options]
       rigmatch-fit --measure [model] [--json]

  --all               List every model, including ones that will not fit
  --installed         List only the models Ollama already has, graded
  --json              Print every model as JSON, for scripts (with --installed, only those)
  --provider <name>   ollama (default) or lmstudio: which download command to print
  --vram <GB>         Grade for a graphics card with this much memory instead of this one
  --measure           Run RigScore's speed test on the tier models installed here:
                      Light llama3.2:3b, Standard qwen3:8b, Heavy qwen3:14b, and
                      Extreme qwen3:30b-a3b on a 24 GB card. Takes minutes.
  --measure <model>   Measure one installed model's real speed with the same test
  -h, --help          Show this
  -v, --version       Show the version

Fit grade A is the best pick for this computer and F will not fit. It weighs
answer quality by size and family, the estimated speed, and the room left in
graphics memory.

--measure runs the models on this computer's Ollama, so the speeds are real:
writing and reading tokens a second, and points against the reference PC
(1,000 is an RTX 4070 12 GB), comparable with the RigMatch app and other PCs.
It never downloads a model: a missing one gets its "ollama pull" command. It
will not run while another program has a model loaded, warns when something
else is using the graphics card, and unloads what it loaded when it finishes.
Ctrl+C stops it and unloads.`;

/** main.cjs's runCommand: { output, error } and never a throw. */
function run(command: string, args: string[], timeoutMs: number): Promise<{ output: string; error: string | null }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ output: `${stdout || ''}\n${stderr || ''}`.trim(), error: error ? error.message || `Could not run ${command}` : null });
    });
  });
}

const toGb = (bytes: number) => Math.round((bytes / 1024 ** 3) * 10) / 10;

async function detectHardware(vramFlag: string | undefined): Promise<FitHardware> {
  const common = { platform: process.platform, arch: os.arch() };
  if (vramFlag !== undefined) {
    const vramGb = Number(vramFlag);
    if (!Number.isFinite(vramGb) || vramGb < 0) throw new Error(`--vram takes a number of GB, such as --vram 12, not "${vramFlag}".`);
    // 0 means no graphics card at all, which is graded as such: a model too
    // big for the processor is an F, not the "?" an unreadable card gets.
    return vramGb === 0
      ? { ...common, gpu: 'No graphics card', vramGb: 0, unifiedMemory: false, ramGb: toGb(os.totalmem()), source: 'flag', noGpu: true }
      : { ...common, gpu: `A ${vramGb} GB graphics card`, vramGb, unifiedMemory: false, ramGb: toGb(os.totalmem()), source: 'flag' };
  }
  const [mem, graphics] = await Promise.all([si.mem(), si.graphics()]);
  const pool = await systemProfile.resolveGpuPool({
    controllers: graphics.controllers,
    memTotal: mem.total,
    platform: process.platform,
    arch: os.arch(),
    run,
  });
  return {
    ...common,
    gpu: pool.primaryGpu.model || 'No graphics card found',
    vramGb: pool.vramGb,
    unifiedMemory: pool.hasUnifiedMemory,
    ramGb: toGb(mem.total),
    source: 'detected',
    driverProblem: pool.driverProblem as FitHardware['driverProblem'],
  };
}

/** The installed models, or null when Ollama does not answer within a second and a half. */
async function installedOllamaModels(): Promise<InstalledModel[] | null> {
  try {
    const response = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    const body = await response.json() as { models?: Array<{ name?: string; size?: number; details?: { parameter_size?: string } }> };
    return (body.models ?? [])
      .filter((model) => typeof model.name === 'string' && model.name)
      .map((model) => ({ name: String(model.name), sizeGb: toGb(Number(model.size) || 0), params: model.details?.parameter_size }));
  } catch {
    return null;
  }
}

/**
 * A JSON request to the local Ollama, abortable by Ctrl+C and by a timeout.
 * The shape rigScoreRunner.cjs expects of main.cjs's fetchJson: a stop says
 * so ("Request stopped", AbortError), and Ollama's own error text is kept, so
 * "requires more system memory" reads as too big.
 */
async function fetchJson(url: string, options: { method?: string; body?: string; signal?: AbortSignal } = {}, timeoutMs = 4000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const stop = () => controller.abort();
  options.signal?.addEventListener('abort', stop, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      body: options.body,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 300);
      try { detail = String((JSON.parse(text) as { error?: unknown }).error ?? detail); } catch { /* not JSON */ }
      throw new Error(`${response.status} ${response.statusText} from Ollama: ${detail}`);
    }
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error(options.signal?.aborted ? 'Request stopped' : `Ollama did not finish within ${Math.round(timeoutMs / 1000)} s.`), { name: 'AbortError' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', stop);
  }
}

/** The NVIDIA driver, for the stamp, read the way the app reads it (nvidia-smi's header). */
async function driverVersion(gpu: string): Promise<string | undefined> {
  if (!/nvidia/i.test(gpu)) return undefined;
  const { output } = await run('nvidia-smi', [], 3500);
  return systemProfile.parseNvidiaSmiHeader(output).driverVersion ?? undefined;
}

/**
 * --measure: the speed test. Ollama on this computer only, since another
 * computer's card cannot be read and its score would carry the wrong stamp.
 * Refuses while another program has a model loaded, and never unloads it.
 */
async function measureMain(model: string | undefined, json: boolean): Promise<number> {
  const baseUrl = ollamaUrl();
  try {
    security.assertLocalhostUrl(baseUrl);
  } catch {
    throw new Error(`--measure runs on this computer's Ollama only, and OLLAMA_HOST points to ${baseUrl}. RigMatch cannot read another computer's graphics card, so its numbers would carry the wrong card.`);
  }
  if (model !== undefined) {
    try { security.assertValidModelName(model); } catch { throw new Error(`"${model}" is not a model name Ollama uses, such as qwen3:8b.`); }
  }
  const installed = await installedOllamaModels();
  if (installed === null) throw new Error(`Ollama did not answer at ${baseUrl}. --measure runs the models on it, so start Ollama and try again.`);
  const loaded = ((await fetchJson(`${baseUrl}/api/ps`, {}, 3000)) as { models?: Array<{ name?: string }> }).models ?? [];
  if (loaded.length) {
    const names = loaded.map((entry) => entry.name).filter(Boolean).join(', ');
    throw new Error(`Ollama has ${names} loaded by another program. It shares the graphics card and would slow the test, so rigmatch-fit leaves it alone. Ollama lets an idle model go after about five minutes; close what is using it or wait, then run again.`);
  }

  const hardware = await detectHardware(undefined);
  const names = installed.map((entry) => entry.name);
  const ranked = rankModels(catalogRows(), hardware, { installed });
  const estimates = new Map(ranked.map((entry) => [entry.row.name, entry.grade.tokensPerSecond ?? null] as const));
  const show = Boolean(process.stdout.isTTY) && !json;
  const columns = process.stdout.isTTY ? process.stdout.columns : undefined;
  // Who sees the progress: stdout in a terminal, as part of the show; stderr
  // otherwise, so piped output and --json stay clean.
  const say = (text: string) => (show ? process.stdout : process.stderr).write(`${text}\n`);
  const live = show ? process.stdout : process.stderr;
  const rewrite = Boolean(live.isTTY);
  let lastLine = '';
  const progress = (text: string) => {
    if (text === lastLine) return;
    lastLine = text;
    if (rewrite) live.write(`\r${text}${' '.repeat(Math.max(0, (live.columns ?? 80) - text.length - 1))}`);
    else live.write(`${text}\n`);
  };
  const endProgress = (text: string) => {
    if (rewrite) live.write(`\r${text}${' '.repeat(Math.max(0, (live.columns ?? 80) - text.length - 1))}\n`);
    else live.write(`${text}\n`);
    lastLine = '';
  };

  // Ctrl+C: stop the run in flight; the runner unloads the model on its way
  // out. A second Ctrl+C leaves at once.
  const controller = new AbortController();
  let interrupts = 0;
  process.on('SIGINT', () => {
    interrupts += 1;
    if (interrupts > 1) process.exit(130);
    controller.abort();
    live.write(`${rewrite ? '\n' : ''}Stopping: unloading the model...\n`);
  });

  const driver = await driverVersion(hardware.gpu);
  const deps: MeasureDeps = {
    baseUrl,
    fetchJson,
    signal: controller.signal,
    readMachine: async () => ({
      gpu: hardware.gpu,
      vramGb: hardware.vramGb,
      isUnifiedMemory: hardware.unifiedMemory,
      driverVersion: driver,
      appVersion: `rigmatch-fit ${pkg.version}`,
    }),
  };

  // Is something besides Ollama using the card? Said before the runs, as the
  // app says it, and read again after them: a heavy program on the card for the
  // whole run reads as a slow PC. It warns and goes on, as the app does.
  const card: { before: CardNote | null; after: CardNote | null } = { before: null, after: null };
  const readCard = () => checkCard(run, { platform: process.platform, unifiedMemory: hardware.unifiedMemory });

  // In a terminal the report follows the intro on screen; piped, the intro
  // went to stderr, so the report carries the title and the card itself.
  const header = show ? undefined : hardware;

  if (model !== undefined) {
    // "gemma3" is what Ollama lists as gemma3:latest.
    const name = names.includes(model) || model.includes(':') ? model : `${model}:latest`;
    const target = { label: name, model: name };
    const ranked = rankedFor(name);
    // Not installed: nothing to time, so no intro; the report says how to get it.
    if (names.includes(name)) {
      card.before = await readCard();
      say(formatModelIntro(name, hardware, { estimateTps: ranked?.grade.tokensPerSecond ?? null, sizeGb: ranked?.row.sizeGb ?? null }, { show, columns, before: card.before }));
    }
    const measured = await measureModel(name, {
      installed: names,
      hardware,
      estimateTps: ranked?.grade.tokensPerSecond ?? null,
      run: (request) => runRequest(deps, request, (phase) => progress(formatProgress(target, phase))),
    });
    if (measured.status === 'measured') card.after = await readCard();
    const report = { ...measured, card };
    if (lastLine) endProgress(formatModelDone(report));
    if (!json) say('');
    console.log(json ? JSON.stringify(toModelJson(report, hardware, pkg.version), null, 2) : formatModelReport(report, { show, columns, header }));
    return controller.signal.aborted ? 130 : report.status === 'measured' ? 0 : 1;
  }

  const plan = planTiers(hardware, names, estimates);
  if (plan.some((entry) => entry.kind === 'run')) card.before = await readCard();
  say(formatIntro(hardware, plan, { show, columns, before: card.before }));
  if (!plan.some((entry) => entry.kind === 'run')) {
    const report = await measureTiers(plan, async () => ({ status: 'stopped' }));
    console.log(json ? JSON.stringify(toMeasureJson(report, hardware, pkg.version), null, 2) : show ? '' : formatReport(report, { columns, header }));
    return 1;
  }
  if (!show) say('');
  const measured = await measureTiers(plan, (request, tier) => runRequest(deps, request, (phase) => progress(formatProgress(tier, phase))), {
    onTierStart: (tier) => progress(formatProgress(tier, { phase: 'checking' })),
    onTierEnd: (line) => endProgress(formatTierDone(line)),
  });
  if (measured.lines.some((line) => line.status === 'measured')) card.after = await readCard();
  const report = { ...measured, card };
  if (!json) say('');
  console.log(json ? JSON.stringify(toMeasureJson(report, hardware, pkg.version), null, 2) : formatReport(report, { show, columns, header }));
  if (report.stopped || controller.signal.aborted) return 130;
  return report.busy || report.lines.some((line) => line.status === 'failed') ? 1 : 0;

  function rankedFor(name: string) {
    return ranked.find((entry) => entry.row.name === name || entry.row.aliases?.includes(name));
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      all: { type: 'boolean', default: false },
      installed: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      provider: { type: 'string', default: 'ollama' },
      vram: { type: 'string' },
      measure: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(pkg.version);
    return 0;
  }
  const measuring = checkMeasureArgs(values, positionals);
  if (measuring) return measureMain(measuring.model, values.json);
  const providerName = values.provider.toLowerCase().replace(/[\s_-]/g, '');
  if (providerName !== 'ollama' && providerName !== 'lmstudio') {
    throw new Error(`--provider is ollama or lmstudio, not "${values.provider}".`);
  }
  const provider: Provider = providerName === 'lmstudio' ? 'lm-studio' : 'ollama';
  if (values.installed && provider !== 'ollama') {
    throw new Error('--installed lists what Ollama has, so it works only with --provider ollama.');
  }

  const [hardware, installed] = await Promise.all([
    detectHardware(values.vram),
    provider === 'ollama' ? installedOllamaModels() : Promise.resolve(null),
  ]);
  const ollamaReachable = installed !== null;
  if (values.installed && !ollamaReachable) {
    throw new Error(`Ollama did not answer at ${ollamaUrl()}, so there is nothing installed to list. Start Ollama, or leave out --installed.`);
  }
  const models = rankModels(catalogRows(), hardware, { installed, provider });
  console.log(values.json
    ? JSON.stringify(toJson(values.installed ? models.filter((model) => model.installed) : models, hardware, { provider, ollamaReachable, version: pkg.version }), null, 2)
    : formatTable(models, hardware, {
      provider, ollamaReachable, all: values.all, installedOnly: values.installed,
      // Only a terminal has a width; piped into a file or another program, nothing is cut.
      columns: process.stdout.isTTY ? process.stdout.columns : undefined,
      // The marquee and the Top Match line are for people, not for pipes.
      show: Boolean(process.stdout.isTTY),
    }));
  return 0;
}

/**
 * Exit as soon as everything is written. Node's fetch keeps trying to connect
 * for 10 seconds after the 1.5-second abort when nothing listens, which held
 * the prompt for about 9 seconds after the table had printed.
 */
function finish(code: number): void {
  process.exitCode = code;
  process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
}

main().then(
  finish,
  (error: unknown) => {
    console.error(`rigmatch-fit: ${error instanceof Error ? error.message : String(error)}`);
    finish(1);
  },
);
