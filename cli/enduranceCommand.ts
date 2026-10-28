// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * rigmatch-fit --endurance, the whole command, minus the machine.
 *
 * Like measureCommand.ts, it is handed the things it cannot get without a
 * computer (the hardware reading, a command runner, the terminal, Ctrl+C), so
 * the tests run it against a stand-in Ollama and a fake interrupt.
 */
import security from '../electron/security.cjs';
import { catalogRows, rankModels } from './fitCheck.ts';
import {
  baselineOf, formatEnduranceDone, formatEnduranceIntro, formatEnduranceProgress, formatEnduranceReport, measureEndurance, runEnduranceRequest, toEnduranceJson,
} from './endurance.ts';
import { CLOUD_TAG, UNLOAD_SETTLE_MS, checkCard, isCloudModel, type CardNote, type MeasureDeps } from './measure.ts';
import { assertLocalOllama, liveOutput, stopOnInterrupt, type MeasureEnv } from './measureCommand.ts';

const cloudMessage = (model: string) => `${model} runs on Ollama's servers, not on this computer, so there is nothing of this PC to check, and the prompts would leave it. rigmatch-fit --endurance runs local models only.`;

/**
 * --endurance <model>: the context check. Refuses while another program has a
 * model loaded, and never unloads it; unloads what it loaded; Ctrl+C stops it
 * cleanly. Resolves to the exit code, and throws for a refusal (main prints it).
 */
export async function runEnduranceCommand({ model, json }: { model: string; json: boolean }, env: MeasureEnv): Promise<number> {
  const { baseUrl, out, fetchJson } = env;
  assertLocalOllama(baseUrl, '--endurance');
  try { security.assertValidModelName(model); } catch { throw new Error(`"${model}" is not a model name Ollama uses, such as qwen3:8b.`); }
  // Before anything is asked of Ollama: a cloud model is refused whether or not it is installed.
  if (CLOUD_TAG.test(model)) throw new Error(cloudMessage(model));

  const installed = await env.installedModels(baseUrl);
  if (installed === null) throw new Error(`Ollama did not answer at ${baseUrl}. --endurance runs the model on it, so start Ollama and try again.`);
  const cloud = new Set(installed.filter(isCloudModel).map((entry) => entry.name));
  const names = installed.filter((entry) => !isCloudModel(entry)).map((entry) => entry.name);
  // "gemma3" is what Ollama lists as gemma3:latest.
  const name = names.includes(model) || model.includes(':') ? model : `${model}:latest`;
  if (CLOUD_TAG.test(name) || cloud.has(name)) throw new Error(cloudMessage(name));

  const loaded = ((await fetchJson(`${baseUrl}/api/ps`, {}, 3000)) as { models?: Array<{ name?: string }> }).models ?? [];
  if (loaded.length) {
    const who = loaded.map((entry) => entry.name).filter(Boolean).join(', ');
    throw new Error(`Ollama has ${who} loaded by another program. It shares the graphics card and would slow the check, so rigmatch-fit leaves it alone and does not start. Ollama lets an idle model go after about five minutes; close what is using it or wait, then run again.`);
  }

  const hardware = await env.detectHardware();
  const entry = rankModels(catalogRows(), hardware, { installed }).find((candidate) => candidate.row.name === name || candidate.row.aliases?.includes(name));
  const estimateTps = entry?.grade.tokensPerSecond ?? null;
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
      unloadSettleMs: env.unloadSettleMs ?? UNLOAD_SETTLE_MS,
    };

    // Where a model gives out moves with what else is using the card (the same
    // 14B slowed at 8K with 4 GB in use by the desktop and at 16K with 1.7 GB).
    // So the card is read before and after, named in the result, and a busy one
    // is said before the check starts. It warns and goes on, as the app does.
    const card: { before: CardNote | null; after: CardNote | null } = { before: null, after: null };
    const readCard = () => checkCard(env.run, { platform: env.platform, unifiedMemory: hardware.unifiedMemory, samples: env.cardSamples, gapMs: env.cardGapMs });

    // In a terminal the report follows the intro on screen; piped, the intro
    // went to stderr, so the report carries the title and the card itself.
    const header = show ? undefined : hardware;
    // Not installed: nothing to time, so no intro; the report says how to get it.
    if (names.includes(name)) {
      card.before = await readCard();
      say(formatEnduranceIntro(name, hardware, { estimateTps, sizeGb: entry?.row.sizeGb ?? null }, { show, columns, before: card.before }));
    }
    const measured = await measureEndurance(name, {
      installed: names,
      estimateTps,
      baseline: baselineOf(card.before),
      run: (request) => runEnduranceRequest(deps, request, (phase) => progress(formatEnduranceProgress(name, phase))),
    });
    if (measured.status === 'measured') card.after = await readCard();
    const report = { ...measured, card };
    if (output.hasProgress()) endProgress(formatEnduranceDone(report));
    if (!json) say('');
    out.write(`${json ? JSON.stringify(toEnduranceJson(report, hardware, env.version), null, 2) : formatEnduranceReport(report, { show, columns, header })}\n`);
    if (interrupt.signal.aborted) return 130;
    // A check that could not conclude is not a result either.
    return report.status === 'measured' && report.result.verdict.kind !== 'unchecked' ? 0 : 1;
  } finally {
    interrupt.off();
  }
}
