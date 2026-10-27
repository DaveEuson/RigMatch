// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * rigmatch-fit --endurance: where does a model slow down, or lose its place,
 * as the context grows, on this card?
 *
 * The same check as the app's Speed score screen: the stages, thresholds and
 * verdict are src/lib/contextEndurance.ts, the timing is
 * electron/enduranceRunner.cjs. This file is the terminal's half: reading the
 * arguments, saying what it will cost, and printing the answer as a table or
 * as JSON. Everything here is pure or takes what it touches as an argument, so
 * the tests drive it with a stand-in Ollama. enduranceCommand.ts runs it.
 */
import runner from '../electron/enduranceRunner.cjs';
import rigRunner from '../electron/rigScoreRunner.cjs';
import { pullCommand } from '../src/lib/modelGrade.ts';
import {
  ENDURANCE_NUM_PREDICT,
  ENDURANCE_ON_CARD_MIN,
  ENDURANCE_SPEED_KEPT_MIN,
  ENDURANCE_STAGES,
  assembleEnduranceResult,
  contextLabel,
  describeBaseline,
  describeEnduranceTime,
  enduranceRequest,
  estimateEnduranceSeconds,
  type EnduranceBaseline,
  type EnduranceProgress,
  type EnduranceResult,
  type EnduranceRunReply,
  type EnduranceRunRequest,
  type EnduranceStage,
} from '../src/lib/contextEndurance.ts';
import { MARQUEE_BORDER, describeHardware, marquee, wrap, type FitHardware } from './fitCheck.ts';
import { afterNote, number, pad, scrubPaths, tps, type CardNote, type MeasureDeps, UNLOAD_SETTLE_MS } from './measure.ts';

type Phase = Omit<EnduranceProgress, 'id'>;

const runEndurance = runner.runEndurance as (deps: MeasureDeps & {
  request: EnduranceRunRequest;
  unloadModel: (baseUrl: string, model: string) => Promise<unknown>;
  onProgress?: (update: Phase) => void;
}) => Promise<EnduranceRunReply>;
const SIZE_TOLERANCE = runner.SIZE_TOLERANCE as number;
const unloadOllamaModel = rigRunner.unloadOllamaModel as (args: {
  fetchJson: MeasureDeps['fetchJson']; baseUrl: string; model: string; settleMs?: number; pollMs?: number;
}) => Promise<boolean>;

// ---- The command line -------------------------------------------------------------

/**
 * Whether this is an --endurance run, and of which model. Like --measure it is
 * a switch with the model after it, but it needs one: a context check is for a
 * model you are deciding about, not a set of tiers. LM Studio has no /api/ps,
 * which is where the share of the model on the card comes from, so it is
 * refused in words rather than run without it.
 */
export function checkEnduranceArgs(
  values: { endurance?: boolean; measure?: boolean; all?: boolean; installed?: boolean; vram?: string; provider?: string },
  positionals: readonly string[],
): { model: string } | null {
  if (!values.endurance) return null;
  if (values.measure) throw new Error('--endurance and --measure each run a test: use one or the other.');
  if (positionals.length !== 1) throw new Error('--endurance takes one installed model, such as: rigmatch-fit --endurance qwen3:8b');
  if (values.vram !== undefined) throw new Error('--vram grades for another card, and --endurance measures this one, so they do not go together.');
  if (values.all || values.installed) throw new Error('--all and --installed list models, and --endurance runs one: use one or the other.');
  if ((values.provider ?? 'ollama').toLowerCase().replace(/[\s_-]/g, '') !== 'ollama') {
    throw new Error("--endurance works only with --provider ollama: it reads how much of the model sits on the graphics card from Ollama's /api/ps, which LM Studio does not offer.");
  }
  return { model: positionals[0] };
}

// ---- Running it -------------------------------------------------------------------

/** The check through the shared runner, unloading what it loaded however it ends. */
export function runEnduranceRequest(deps: MeasureDeps, request: EnduranceRunRequest, onProgress?: (update: Phase) => void): Promise<EnduranceRunReply> {
  return runEndurance({
    ...deps,
    request,
    // Best effort: keep_alive frees the card soon anyway.
    unloadModel: (baseUrl, model) => unloadOllamaModel({ fetchJson: deps.fetchJson, baseUrl, model, settleMs: deps.unloadSettleMs ?? UNLOAD_SETTLE_MS }).catch(() => false),
    onProgress,
  });
}

export type EnduranceReport = {
  model: string;
  /** The fit grade's estimate, which only sets how long the intro says it takes. */
  estimateTps: number | null;
  /** What the graphics card was doing before and after the check (checkCard); filled in by the caller. */
  card?: { before: CardNote | null; after: CardNote | null };
} & (
  | { status: 'measured'; result: EnduranceResult }
  | { status: 'missing'; command: string }
  | { status: 'busy' | 'stopped' | 'failed' | 'too-big'; message: string }
);

/** What the card was doing, as the result names it. */
export const baselineOf = (note: CardNote | null | undefined): EnduranceBaseline | null => (note
  ? { level: note.level, vramUsedPercent: note.vramUsedPercent, utilizationPercent: note.utilizationPercent, message: note.message }
  : null);

export async function measureEndurance(
  model: string,
  { installed, estimateTps, baseline, run, now = () => new Date().toISOString() }: {
    installed: readonly string[];
    estimateTps: number | null;
    baseline: EnduranceBaseline | null;
    run: (request: EnduranceRunRequest) => Promise<EnduranceRunReply>;
    now?: () => string;
  },
): Promise<EnduranceReport> {
  const base = { model, estimateTps };
  if (!installed.includes(model)) return { ...base, status: 'missing', command: pullCommand(model) };
  const outcome = assembleEnduranceResult(model, await run(enduranceRequest(model, 'fit-endurance')), baseline, now());
  if (outcome.kind === 'measured') return { ...base, status: 'measured', result: outcome.result };
  return { ...base, status: outcome.kind === 'not-installed' ? 'failed' : outcome.kind, message: scrubPaths(outcome.message) };
}

// ---- Printing ---------------------------------------------------------------------

export type PrintOptions = {
  show?: boolean; columns?: number; header?: FitHardware;
  /** What the card was doing before the check: a busy one is said in the intro. */
  before?: CardNote | null;
};

const stageList = () => ENDURANCE_STAGES.map((stage) => contextLabel(stage.numCtx)).join(', ').replace(/, ([^,]*)$/, ' and $1');

/** What comes before the check: what it is, how long it takes, and how to stop it. */
export function formatEnduranceIntro(
  model: string,
  hardware: FitHardware,
  { estimateTps, sizeGb }: { estimateTps: number | null; sizeGb: number | null },
  { show = false, columns, before }: PrintOptions = {},
): string {
  const sign = show && (!columns || columns >= MARQUEE_BORDER.length);
  const time = describeEnduranceTime(estimateEnduranceSeconds({ sizeGb: sizeGb ?? 5, estimateTps }));
  return [
    ...(sign ? marquee('endurance', 'Where does it start to slow down?') : ['RigMatch context endurance']),
    ...wrap(describeHardware(hardware), columns),
    ...wrap(`${show ? 'Tonight\'s endurance round' : 'Checking'}: ${model}. It runs the model at ${stageList()} of context, with a prompt that fills each, and reads back how fast it writes, how much of it sits on the graphics card and whether it still finds a passkey hidden in the middle. This takes ${time}, longer if the model stops fitting at the larger sizes. Each size loads the model again. Ctrl+C stops and unloads.`, columns),
    ...(before?.message ? wrap(before.message, columns) : []),
    ...(show ? ['', 'Endurance round'] : []),
  ].join('\n');
}

/** A progress line, as Ollama works through the stages. */
export function formatEnduranceProgress(model: string, phase: Phase): string {
  if (phase.phase === 'checking') return `${model}: checking Ollama`;
  if (phase.phase === 'calibrating') return `${model}: loading, and measuring how many tokens a line costs on this model`;
  if (phase.phase === 'unloading') return `${model}: unloading`;
  const stage = ENDURANCE_STAGES.find((entry) => entry.id === phase.stage);
  return `${model}: ${stage ? `${stage.label}, ${contextLabel(stage.numCtx)} context` : 'a stage'} (${phase.index} of ${phase.of})`;
}

/** How the check went, in one line. */
export function formatEnduranceDone(report: EnduranceReport): string {
  if (report.status === 'measured') return `${report.model}: ${report.result.verdict.headline}`;
  return `${report.model}: ${report.status === 'busy' ? 'not kept, Ollama was busy' : report.status === 'failed' ? 'did not finish' : report.status}`;
}

const header = ['Stage', 'Context', 'Prompt', 'Writing', 'Reading', 'Loads in', 'On the card', 'Passkey', 'Feels'];

function rowFor(stage: EnduranceStage): string[] {
  const lead = [stage.label, contextLabel(stage.numCtx)];
  if (stage.status === 'failed') return [...lead, stage.outOfMemory ? 'Ran out of memory' : 'Ollama stopped with an error'];
  return [
    ...lead,
    `${number(stage.promptTokens)}${stage.sizeOk ? '' : ' (wrong size)'}`,
    stage.writingTps ? `${tps(stage.writingTps)} tok/s` : '-',
    stage.readingTps ? `${tps(stage.readingTps)} tok/s` : '-',
    stage.loadSeconds > 0 ? `${stage.loadSeconds.toFixed(1)} s` : '-',
    stage.gpuShare === null ? '-' : `${Math.round(stage.gpuShare * 100)}%`,
    stage.passkeyKept ? 'kept' : 'lost',
    stage.feels ?? '-',
  ];
}

const headerLines = (title: string, hardware: FitHardware | undefined, columns: number | undefined) => (hardware
  ? [title, ...wrap(describeHardware(hardware), columns), '']
  : []);

/**
 * The answer: one row a stage, then the verdict in words, what was left out,
 * what the card was doing, and how far to trust the cut-offs.
 */
export function formatEnduranceReport(report: EnduranceReport, { show = false, columns, header: card }: PrintOptions = {}): string {
  const lines = headerLines(`RigMatch context endurance: ${report.model}`, card, columns);
  if (report.status === 'missing') {
    lines.push(...wrap(`${report.model} is not installed. Get it with: ${report.command}, then check it again.`, columns));
    return lines.join('\n');
  }
  if (report.status !== 'measured') {
    lines.push(...wrap(report.message, columns));
    return lines.join('\n');
  }

  const { result } = report;
  const rows = result.stages.map(rowFor);
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => (row.length === header.length || column < 2 ? (row[column] ?? '').length : 0))));
  const render = (row: string[]) => row.map((cell, at) => (at === row.length - 1 ? cell : pad(cell, widths[at]))).join('  ').trimEnd();
  lines.push(render(header), ...rows.map(render), '');

  const { verdict } = result;
  const prose = [
    `${verdict.headline}.`,
    verdict.detail,
    ...verdict.notes,
    describeBaseline(result.baseline),
    ...afterNote(report.card?.after),
    `Writing is how fast the answer comes out; reading is how fast the prompt goes in. Each size loads the model again, so loading is timed on its own and left out of both speeds. The passkey is hidden 55% of the way into the prompt.`,
    `A size is flagged when writing falls under ${Math.round(ENDURANCE_SPEED_KEPT_MIN * 100)}% of the ${contextLabel(ENDURANCE_STAGES[0].numCtx)} speed, less than ${Math.round(ENDURANCE_ON_CARD_MIN * 100)}% of the model sits on the graphics card, or the passkey is lost. Those cut-offs were set on three models on one card (an RTX 4070 12 GB), so treat the verdict as a guide.`,
  ].filter(Boolean);
  lines.push(...prose.flatMap((text) => wrap(text, columns)));
  if (show) lines.push('', ...wrap(`Tonight's verdict on ${report.model}: ${verdict.headline}.`, columns));
  return lines.join('\n');
}

// ---- JSON -------------------------------------------------------------------------

const round = (value: number | null, places = 1) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places);

const hardwareJson = (hardware: FitHardware) => ({
  gpu: hardware.gpu,
  vramGb: hardware.vramGb,
  unifiedMemory: hardware.unifiedMemory,
  ramGb: hardware.ramGb,
  platform: hardware.platform,
  arch: hardware.arch,
});

/** What the card was doing, for the JSON: the level, the readings and why, nothing else. */
const cardJson = (note: CardNote | null | undefined) => (note
  ? { level: note.level, vramUsedPercent: note.vramUsedPercent, utilizationPercent: note.utilizationPercent, reasons: note.reasons, apps: note.apps }
  : null);

/** What a script is told when a run did not finish: not Ollama's own text, which can carry a path with a person's name in it. */
const messageForJson = (status: string, message: string) => (status === 'failed' ? 'The check did not finish.' : scrubPaths(message));

/**
 * --endurance --json: the stages, the verdict, and the stamp. The stamp carries
 * what the numbers were measured on, and nothing about who ran it: no host
 * name, no file paths, no prompts or answers.
 */
export function toEnduranceJson(report: EnduranceReport, hardware: FitHardware, version: string) {
  const base = {
    tool: 'rigmatch-fit',
    version,
    mode: 'endurance',
    hardware: hardwareJson(hardware),
    model: report.model,
    status: report.status,
    test: {
      stages: ENDURANCE_STAGES.map(({ id, label, numCtx, targetTokens }) => ({ id, label, numCtx, targetTokens })),
      numPredict: ENDURANCE_NUM_PREDICT,
      sizeTolerance: SIZE_TOLERANCE,
      thresholds: { speedKeptMin: ENDURANCE_SPEED_KEPT_MIN, onCardMin: ENDURANCE_ON_CARD_MIN },
    },
  };
  if (report.status === 'missing') return { ...base, command: report.command };
  if (report.status !== 'measured') return { ...base, message: messageForJson(report.status, report.message) };
  const { result } = report;
  const first = result.stages[0];
  return {
    ...base,
    stages: result.stages.map((stage) => ({
      id: stage.id,
      label: stage.label,
      numCtx: stage.numCtx,
      status: stage.status,
      targetTokens: stage.targetTokens,
      promptTokens: stage.promptTokens,
      sizeOk: stage.sizeOk,
      writingTps: round(stage.writingTps),
      readingTps: round(stage.readingTps),
      writingKept: first?.writingTps && stage.writingTps ? round(stage.writingTps / first.writingTps, 3) : null,
      loadSeconds: round(stage.loadSeconds, 2),
      gpuShare: round(stage.gpuShare, 3),
      contextReported: stage.contextReported,
      contextShort: stage.contextShort,
      passkeyKept: stage.passkeyKept,
      feels: stage.feels,
    })),
    verdict: {
      kind: result.verdict.kind,
      headline: result.verdict.headline,
      detail: result.verdict.detail,
      problemStage: result.verdict.problemStage,
      heldTo: result.verdict.heldTo,
      notes: result.verdict.notes,
    },
    stamp: result.stamp,
    contention: { before: cardJson(report.card?.before), after: cardJson(report.card?.after) },
  };
}
