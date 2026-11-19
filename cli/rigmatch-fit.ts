// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * rigmatch-fit: which local AI models will run well on this computer.
 *
 *   npx rigmatch-fit                  the best 20 for this computer
 *   npx rigmatch-fit --all            every model, including the ones that will not fit
 *   npx rigmatch-fit --installed      only the models Ollama already has
 *   npx rigmatch-fit --json           every model, for scripts
 *   npx rigmatch-fit --provider lmstudio
 *   npx rigmatch-fit --vram 16        grade for 16 GB of graphics memory instead of this computer's
 *   npx rigmatch-fit --measure        RigScore's speed test on the tier models installed here
 *   npx rigmatch-fit --measure qwen3.5:9b   one installed model's real speed, beside the estimate
 *   npx rigmatch-fit --endurance qwen3:14b  where one installed model slows down as the context grows
 *
 * Reads the hardware the way the RigMatch app does (resolveGpuPool in
 * electron/systemProfile.cjs) and asks a local Ollama, if one answers, what is
 * installed. Nothing is downloaded and nothing is sent anywhere else.
 * --measure and --endurance run models on that Ollama (measure.ts,
 * endurance.ts) and unload them after.
 */

import { execFile } from 'node:child_process';
import os from 'node:os';
import { parseArgs } from 'node:util';
import si from 'systeminformation';
import pkg from './package.json' with { type: 'json' };
import systemProfile from '../electron/systemProfile.cjs';
import { catalogFor, flaggedHardware, formatTable, ollamaUrl, parseVramFlag, rankModels, toJson, type FitHardware, type Provider } from './fitCheck.ts';
import { checkEnduranceArgs } from './endurance.ts';
import { runEnduranceCommand } from './enduranceCommand.ts';
import { checkMeasureArgs } from './measure.ts';
import { runMeasureCommand } from './measureCommand.ts';
import { fetchJson, installedOllamaModels, toGb } from './ollamaHttp.ts';

const HELP = `rigmatch-fit ${pkg.version}: which local AI models will run well on this computer

Usage: rigmatch-fit [options]
       rigmatch-fit --measure [model] [--json]
       rigmatch-fit --endurance <model> [--json]

  --all               List every model, including ones that will not fit
  --installed         List only the models Ollama already has, graded
  --json              Print every model as JSON, for scripts (with --installed, only those)
  --provider <name>   ollama (default) or lmstudio: which download command to print
  --vram <GB>         Grade for this much graphics memory instead of this computer's
                      (on a Mac, this much shared memory)
  --measure           Run RigScore's speed test on the tier models installed here:
                      Light llama3.2:3b, Standard qwen3:8b, Heavy qwen3:14b, and
                      Extreme qwen3:30b-a3b with 24 GB of graphics memory (26 GB
                      on a Mac). Takes minutes.
  --measure <model>   Measure one installed model's real speed with the same test
  --endurance <model> Find where one installed model slows down or loses its place as
                      the context grows, at 2K, 8K and 16K. Takes a few minutes.
  -h, --help          Show this
  -v, --version       Show the version

Fit grade A is the best pick for this computer and F will not fit. It weighs
answer quality by size and family, the estimated speed, and the room left in
graphics memory.

--measure runs the models on this computer's Ollama, so the speeds are real:
writing and reading tokens a second, and points against the reference
computer (1,000 is an RTX 4070 12 GB), comparable with the RigMatch app and
other computers.
It never downloads a model: a missing one gets its "ollama pull" command. It
will not run while another program has a model loaded, warns when something
else is using the graphics card (or a Mac's GPU), and unloads what it loaded
when it finishes.
Ctrl+C stops it and unloads. It runs local models only: a cloud model runs
on Ollama's servers, so it is refused.

--endurance checks the context the same way: it fills 2K, 8K and 16K with a
prompt that hides a passkey, and reports the writing and reading speed, how
much of the model sits on the GPU, and whether the passkey came back. It
says where the model first slows down or loses its place on this computer.
It takes the same care as --measure, and needs Ollama: LM Studio does not
say how much of a model is on the GPU.`;

/** main.cjs's runCommand: { output, error } and never a throw. */
function run(command: string, args: string[], timeoutMs: number): Promise<{ output: string; error: string | null }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ output: `${stdout || ''}\n${stderr || ''}`.trim(), error: error ? error.message || `Could not run ${command}` : null });
    });
  });
}

async function detectHardware(vramFlag: string | undefined): Promise<FitHardware> {
  const common = { platform: process.platform, arch: os.arch() };
  if (vramFlag !== undefined) {
    const vramGb = parseVramFlag(vramFlag);
    // Only an ARM computer has shared memory, so nothing else waits to be read.
    const detected = vramGb > 0 && common.arch === 'arm64' ? await detectHardware(undefined) : null;
    return flaggedHardware(vramGb, detected, common, toGb(os.totalmem()));
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

/** The NVIDIA driver, for the stamp, read the way the app reads it (nvidia-smi's header). */
async function driverVersion(gpu: string): Promise<string | undefined> {
  if (!/nvidia/i.test(gpu)) return undefined;
  const { output } = await run('nvidia-smi', [], 3500);
  return systemProfile.parseNvidiaSmiHeader(output).driverVersion ?? undefined;
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
      endurance: { type: 'boolean', default: false },
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
  const env = {
    baseUrl: ollamaUrl(),
    out: process.stdout,
    err: process.stderr,
    platform: process.platform,
    version: pkg.version,
    detectHardware: () => detectHardware(undefined),
    driverVersion,
    run,
    fetchJson,
    installedModels: installedOllamaModels,
    interrupt: process,
  };
  const enduring = checkEnduranceArgs(values, positionals);
  if (enduring) return runEnduranceCommand({ model: enduring.model, json: values.json }, env);
  const measuring = checkMeasureArgs(values, positionals);
  if (measuring) return runMeasureCommand({ model: measuring.model, json: values.json }, env);
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
    provider === 'ollama' ? installedOllamaModels(ollamaUrl()) : Promise.resolve(null),
  ]);
  const ollamaReachable = installed !== null;
  if (values.installed && !ollamaReachable) {
    throw new Error(`Ollama did not answer at ${ollamaUrl()}, so there is nothing installed to list. Start Ollama, or leave out --installed.`);
  }
  const models = rankModels(catalogFor(hardware), hardware, { installed, provider });
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

/**
 * What went wrong, in RigMatch's words. Node's own parser says "Unknown option
 * '--nope'. To specify a positional argument starting with a '-', place it at
 * the end of the command after '--', as in '-- \"--nope\"'."
 */
function errorText(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    const option = message.match(/'([^']+)'/)?.[1] ?? 'that option';
    return `rigmatch-fit has no option ${option}. rigmatch-fit --help lists them.`;
  }
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
    const option = message.match(/--[a-z-]+/)?.[0] ?? 'That option';
    return `${option} needs a value, such as ${option === '--vram' ? '--vram 12' : `${option} <value>`}. rigmatch-fit --help lists them.`;
  }
  return message;
}

main().then(
  finish,
  (error: unknown) => {
    const text = errorText(error);
    // A script that asked for JSON gets JSON, errors included, on stdout as
    // every answer is; the exit code still says it failed.
    if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify({ error: text }, null, 2)}\n`);
    else console.error(`rigmatch-fit: ${text}`);
    finish(1);
  },
);
