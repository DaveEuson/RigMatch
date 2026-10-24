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
 *
 * Reads the hardware the way the RigMatch app does (resolveGpuPool in
 * electron/systemProfile.cjs) and asks a local Ollama, if one answers, what is
 * installed. Nothing is downloaded and nothing is sent anywhere else.
 */

import { execFile } from 'node:child_process';
import os from 'node:os';
import { parseArgs } from 'node:util';
import si from 'systeminformation';
import pkg from './package.json' with { type: 'json' };
import systemProfile from '../electron/systemProfile.cjs';
import { catalogRows, formatTable, ollamaUrl, rankModels, toJson, type FitHardware, type InstalledModel, type Provider } from './fitCheck.ts';

const HELP = `rigmatch-fit ${pkg.version}: which local AI models will run well on this computer

Usage: rigmatch-fit [options]

  --all               List every model, including ones that will not fit
  --installed         List only the models Ollama already has, graded
  --json              Print every model as JSON, for scripts (with --installed, only those)
  --provider <name>   ollama (default) or lmstudio: which download command to print
  --vram <GB>         Grade for a graphics card with this much memory instead of this one
  -h, --help          Show this
  -v, --version       Show the version

Fit grade A is the best pick for this computer and F will not fit. It weighs
answer quality by size and family, the estimated speed, and the room left in
graphics memory. The RigMatch app measures the real speed and quality.`;

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

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean', default: false },
      installed: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      provider: { type: 'string', default: 'ollama' },
      vram: { type: 'string' },
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
