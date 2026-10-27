// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * rigmatch-fit --measure, the whole command, minus the machine.
 *
 * rigmatch-fit.ts hands this the things it cannot get without a computer: the
 * hardware reading, the driver, a command runner, the terminal and Ctrl+C. The
 * tests hand it a 12 GB card, a stand-in Ollama and a fake interrupt, so the
 * same run is asserted the same way on a machine with no graphics card, which
 * is what the release's CI runners are.
 */
import type { EventEmitter } from 'node:events';
import security from '../electron/security.cjs';
import { catalogRows, rankModels, type FitHardware, type InstalledModel } from './fitCheck.ts';
import {
  CLOUD_TAG, UNLOAD_SETTLE_MS, checkCard, cloudMessage, fitLine, formatIntro, formatModelDone, formatModelIntro, formatModelReport, formatProgress,
  formatReport, formatTierDone, isCloudModel, measureModel, measureTiers, planTiers, runRequest, toMeasureJson, toModelJson,
  type CardNote, type CommandRunner, type MeasureDeps,
} from './measure.ts';

/** A terminal, or a pipe, or a test's capture. */
export type Output = { write: (text: string) => unknown; isTTY?: boolean; columns?: number };

export type MeasureEnv = {
  /** Where Ollama listens (ollamaUrl()). */
  baseUrl: string;
  out: Output;
  err: Output;
  platform: string;
  /** The version for the JSON. */
  version: string;
  detectHardware: () => Promise<FitHardware>;
  /** The NVIDIA driver, for the stamp; undefined when it cannot be read. */
  driverVersion: (gpu: string) => Promise<string | undefined>;
  /** nvidia-smi, and the process list, for the card check. */
  run: CommandRunner;
  fetchJson: MeasureDeps['fetchJson'];
  installedModels: (baseUrl: string) => Promise<InstalledModel[] | null>;
  /** Ctrl+C. The first press stops the run and unloads; a second one leaves at once. */
  interrupt?: Pick<EventEmitter, 'on' | 'off'>;
  leave?: (code: number) => unknown;
  /** How long to wait for a model to leave the card (default 15 s), and for this run's own to be gone before the next. */
  unloadSettleMs?: number;
  freeWaitMs?: number;
  /** nvidia-smi readings and the gap between them (the app takes five, 220 ms apart). */
  cardSamples?: number;
  cardGapMs?: number;
};

/**
 * Ollama on this computer only. Another computer's card cannot be read, so its
 * score would carry the wrong stamp, and a model there is not on this card.
 * The address is read as the app reads one (assertLocalhostUrl): its parsed
 * host must be localhost, 127.0.0.1 or ::1, however it was spelled.
 */
export function assertLocalOllama(baseUrl: string, flag = '--measure'): void {
  try {
    security.assertLocalhostUrl(baseUrl);
  } catch {
    throw new Error(`${flag} runs on this computer's Ollama only, and OLLAMA_HOST points to ${baseUrl}. RigMatch cannot read another computer's graphics card, so its numbers would carry the wrong card.`);
  }
}

/**
 * Where progress goes and how it is drawn: stdout in a terminal, as part of the
 * show; stderr otherwise, so piped output and --json stay clean. In a terminal
 * a line is redrawn in place.
 */
export function liveOutput(env: Pick<MeasureEnv, 'out' | 'err'>, show: boolean) {
  const live = show ? env.out : env.err;
  const rewrite = Boolean(live.isTTY);
  const width = live.columns ?? 80;
  let lastLine = '';
  return {
    live,
    rewrite,
    say: (text: string) => live.write(`${text}\n`),
    progress: (text: string) => {
      if (text === lastLine) return;
      lastLine = text;
      if (rewrite) live.write(`\r${fitLine(text, width)}`);
      else live.write(`${text}\n`);
    },
    endProgress: (text: string) => {
      if (rewrite) live.write(`\r${fitLine(text, width)}\n`);
      else live.write(`${text}\n`);
      lastLine = '';
    },
    /** A progress line is on screen that has not been ended. */
    hasProgress: () => Boolean(lastLine),
  };
}

/**
 * Ctrl+C: stop the run in flight; the runner unloads the model on its way out.
 * A second Ctrl+C leaves at once. Call `off` when the run is over.
 */
export function stopOnInterrupt(env: Pick<MeasureEnv, 'interrupt' | 'leave'>, output: { live: Output; rewrite: boolean }) {
  const controller = new AbortController();
  let interrupts = 0;
  const onInterrupt = () => {
    interrupts += 1;
    if (interrupts > 1) {
      (env.leave ?? ((code: number) => process.exit(code)))(130);
      return;
    }
    controller.abort();
    output.live.write(`${output.rewrite ? '\n' : ''}Stopping: unloading the model...\n`);
  };
  env.interrupt?.on('SIGINT', onInterrupt);
  return { signal: controller.signal, off: () => { env.interrupt?.off('SIGINT', onInterrupt); } };
}

/**
 * --measure: the speed test. Refuses while another program has a model loaded,
 * and never unloads it; unloads what it loaded; Ctrl+C stops it cleanly.
 * Resolves to the exit code, and throws for a refusal (main prints it).
 */
export async function runMeasureCommand({ model, json }: { model: string | undefined; json: boolean }, env: MeasureEnv): Promise<number> {
  const { baseUrl, out, fetchJson } = env;
  assertLocalOllama(baseUrl);
  if (model !== undefined) {
    try { security.assertValidModelName(model); } catch { throw new Error(`"${model}" is not a model name Ollama uses, such as qwen3:8b.`); }
    // Before anything is asked of Ollama: a cloud model is refused whether or not it is installed.
    if (CLOUD_TAG.test(model)) throw new Error(cloudMessage(model));
  }
  const installed = await env.installedModels(baseUrl);
  if (installed === null) throw new Error(`Ollama did not answer at ${baseUrl}. --measure runs the models on it, so start Ollama and try again.`);
  const cloud = new Set(installed.filter(isCloudModel).map((entry) => entry.name));
  const names = installed.filter((entry) => !isCloudModel(entry)).map((entry) => entry.name);
  if (model !== undefined && cloud.has(model)) throw new Error(cloudMessage(model));

  const loaded = ((await fetchJson(`${baseUrl}/api/ps`, {}, 3000)) as { models?: Array<{ name?: string }> }).models ?? [];
  if (loaded.length) {
    const who = loaded.map((entry) => entry.name).filter(Boolean).join(', ');
    throw new Error(`Ollama has ${who} loaded by another program. It shares the graphics card and would slow the test, so rigmatch-fit leaves it alone and does not start. Ollama lets an idle model go after about five minutes; close what is using it or wait, then run again.`);
  }

  const hardware = await env.detectHardware();
  const ranked = rankModels(catalogRows(), hardware, { installed });
  const estimates = new Map(ranked.map((entry) => [entry.row.name, entry.grade.tokensPerSecond ?? null] as const));
  const show = Boolean(out.isTTY) && !json;
  const columns = out.isTTY ? out.columns : undefined;
  const output = liveOutput(env, show);
  const { say, progress, endProgress } = output;
  const interrupt = stopOnInterrupt(env, output);

  try {
    const driver = await env.driverVersion(hardware.gpu);
    const deps: MeasureDeps = {
      baseUrl,
      fetchJson,
      signal: interrupt.signal,
      readMachine: async () => ({
        gpu: hardware.gpu,
        vramGb: hardware.vramGb,
        isUnifiedMemory: hardware.unifiedMemory,
        driverVersion: driver,
        appVersion: `rigmatch-fit ${env.version}`,
      }),
      loadedHere: new Set<string>(),
      unloadSettleMs: env.unloadSettleMs ?? UNLOAD_SETTLE_MS,
      freeWaitMs: env.freeWaitMs ?? UNLOAD_SETTLE_MS,
    };

    // Is something besides Ollama using the card? Said before the runs and read
    // again after them: a heavy program on the card for the whole run reads as a
    // slow PC. It warns and goes on, as the app does (NVIDIA cards only).
    const card: { before: CardNote | null; after: CardNote | null } = { before: null, after: null };
    const readCard = () => checkCard(env.run, { platform: env.platform, unifiedMemory: hardware.unifiedMemory, samples: env.cardSamples, gapMs: env.cardGapMs });

    // In a terminal the report follows the intro on screen; piped, the intro
    // went to stderr, so the report carries the title and the card itself.
    const header = show ? undefined : hardware;

    if (model !== undefined) {
      // "gemma3" is what Ollama lists as gemma3:latest.
      const name = names.includes(model) || model.includes(':') ? model : `${model}:latest`;
      if (CLOUD_TAG.test(name) || cloud.has(name)) throw new Error(cloudMessage(name));
      const target = { label: name, model: name };
      const entry = ranked.find((candidate) => candidate.row.name === name || candidate.row.aliases?.includes(name));
      const estimateTps = entry?.grade.tokensPerSecond ?? null;
      // Not installed: nothing to time, so no intro; the report says how to get it.
      if (names.includes(name)) {
        card.before = await readCard();
        say(formatModelIntro(name, hardware, { estimateTps, sizeGb: entry?.row.sizeGb ?? null }, { show, columns, before: card.before }));
      }
      const measured = await measureModel(name, {
        installed: names,
        hardware,
        estimateTps,
        run: (request) => runRequest(deps, request, (phase) => progress(formatProgress(target, phase))),
      });
      if (measured.status === 'measured') card.after = await readCard();
      const report = { ...measured, card };
      if (output.hasProgress()) endProgress(formatModelDone(report));
      if (!json) say('');
      out.write(`${json ? JSON.stringify(toModelJson(report, hardware, env.version), null, 2) : formatModelReport(report, { show, columns, header })}\n`);
      return interrupt.signal.aborted ? 130 : report.status === 'measured' ? 0 : 1;
    }

    const plan = planTiers(hardware, names, estimates, cloud);
    if (plan.some((entry) => entry.kind === 'run')) card.before = await readCard();
    say(formatIntro(hardware, plan, { show, columns, before: card.before }));
    if (!plan.some((entry) => entry.kind === 'run')) {
      const report = await measureTiers(plan, async () => ({ status: 'stopped' }));
      out.write(`${json ? JSON.stringify(toMeasureJson(report, hardware, env.version), null, 2) : show ? '' : formatReport(report, { columns, header })}\n`);
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
    out.write(`${json ? JSON.stringify(toMeasureJson(report, hardware, env.version), null, 2) : formatReport(report, { show, columns, header })}\n`);
    if (report.stopped || interrupt.signal.aborted) return 130;
    return report.busy || report.lines.some((line) => line.status === 'failed') ? 1 : 0;
  } finally {
    interrupt.off();
  }
}
