// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Context endurance: where a model slows down or loses its place as the
 * context grows, on this PC's card.
 *
 * Every other RigMatch test runs at a short context (2048), so a model that is
 * fast there can crawl at 16K and nothing says so. This is the definition of
 * the check and the reading of its answer, shared by the app's Speed score
 * screen and `rigmatch-fit --endurance`. The runner (electron/enduranceRunner.cjs)
 * does the timing and returns raw readings; the verdict is worked out here.
 * Pure, so every outcome a person can meet is tested without Electron.
 *
 * WHERE THE THRESHOLDS COME FROM. They were set on one real run, 2026-10-26, on
 * an RTX 4070 12 GB with Ollama 0.35.1 defaults (writing speed at 2K / 8K / 16K):
 *   llama3.2:3b  167 / 131 / 102 tok/s   61% kept at 16K   100% on the card
 *   qwen3:8b      74 /  61 /  50         67% kept           100%
 *   qwen3:14b     42.5 / 38 / 13         31% kept            87% (9.3 GB of weights
 *                                                             plus a 16K cache spilled)
 * The passkey came back in every stage. A longer context costs speed on any
 * model (the 3B and the 8B lost a third to 40% and stayed whole on the card),
 * so the speed line sits between that ordinary cost and the 14B's fall: 55%.
 * The card line sits between 100% and 87%: 92%. These fit three models on one
 * card, so they are a guide and not a law: a card that slows an ordinary model
 * past 45% at 16K would flag a healthy one, and they are constants to move when
 * more cards' numbers are in.
 */
import { formatThroughputValue } from './format.ts';
import { speedBand } from './rigScoreScale.ts';

// ---- The check --------------------------------------------------------------------

export type EnduranceStageDef = {
  id: string;
  /** In plain words, as a person uses a model. */
  label: string;
  numCtx: number;
  /** About how long the prompt is. The runner measures the model's tokenizer to hit it. */
  targetTokens: number;
};

/**
 * Three sizes. The prompt fills most of the context (not all of it: the answer
 * needs room, and Ollama cuts a prompt that is too long without saying so).
 */
export const ENDURANCE_STAGES: readonly EnduranceStageDef[] = [
  { id: 'quick', label: 'Quick chat', numCtx: 2048, targetTokens: 300 },
  { id: 'page', label: 'Long page', numCtx: 8192, targetTokens: 6144 },
  { id: 'project', label: 'Whole project', numCtx: 16384, targetTokens: 14336 },
];

/** Enough for the passkey and a short summary. */
export const ENDURANCE_NUM_PREDICT = 128;

/** The first stage whose writing speed is under this share of the 2K speed is flagged. */
export const ENDURANCE_SPEED_KEPT_MIN = 0.55;
/** The first stage with less than this share of the model on the graphics card is flagged. */
export const ENDURANCE_ON_CARD_MIN = 0.92;

/** What the screen and the command line send the runner. */
export type EnduranceRunRequest = {
  progressId: string;
  model: string;
  stages: Array<Pick<EnduranceStageDef, 'id' | 'numCtx' | 'targetTokens'>>;
  numPredict: number;
};

export function enduranceRequest(model: string, progressId: string): EnduranceRunRequest {
  return {
    progressId,
    model,
    stages: ENDURANCE_STAGES.map(({ id, numCtx, targetTokens }) => ({ id, numCtx, targetTokens })),
    numPredict: ENDURANCE_NUM_PREDICT,
  };
}

// ---- What the runner answers ------------------------------------------------------

/** One stage as the runner timed it. */
export type EnduranceStageReading = {
  id: string;
  numCtx: number;
  targetTokens: number;
  status: 'ok' | 'failed';
  promptTokens?: number;
  outputTokens?: number;
  readingTps?: number | null;
  writingTps?: number | null;
  loadSeconds?: number;
  gpuShare?: number | null;
  contextReported?: number | null;
  passkeyKept?: boolean;
  sizeOk?: boolean;
  error?: string;
  outOfMemory?: boolean;
};

export type EnduranceMachine = {
  gpu?: string;
  vramGb?: number;
  driverVersion?: string;
  isUnifiedMemory?: boolean;
  appVersion: string;
};

export type EnduranceRunReply =
  | {
    status: 'done';
    stages: EnduranceStageReading[];
    tokensPerLine: number;
    numPredict: number;
    ollamaVersion?: string;
    modelDigest?: string;
    quantization?: string;
    machine: EnduranceMachine;
  }
  | { status: 'not-installed' }
  | { status: 'too-big'; error?: string }
  /** Something else was loaded before the check began, so it did not begin. */
  | { status: 'busy'; loadedModels: string[] }
  /** Something came to share the card while the check ran, so nothing was kept. */
  | { status: 'shared'; loadedModels: string[]; sameModel?: boolean; /** Ollama unloaded the model mid-check, to make room for another program's. */ evicted?: boolean }
  | { status: 'stopped' }
  | { status: 'failed'; error: string };

export type EnduranceProgress = {
  id: string;
  phase: 'checking' | 'calibrating' | 'stage' | 'unloading';
  stage?: string;
  index?: number;
  of?: number;
};

/** What the graphics card was doing before the check, which the result is read against. */
export type EnduranceBaseline = {
  level: 'clear' | 'busy' | 'heavy' | 'unknown';
  /** Share of the card's memory in use, 0 to 100, or null when it could not be read. */
  vramUsedPercent: number | null;
  utilizationPercent: number | null;
  /** The sentence for a busy card; empty otherwise. */
  message: string;
};

/**
 * The app's reading of the card (its GpuContention) as a baseline. The app
 * calls the card "busy" when a known graphics-heavy program is merely open
 * (Steam on most gaming PCs), whatever the card itself is doing; the check
 * calls it busy only when a reading says so, as the command line does.
 */
export function baselineFromContention(reading: {
  level: EnduranceBaseline['level'];
  reasons: string[];
  vramUsedPercent: number | null;
  utilizationPercent: number | null;
  message: string;
}): EnduranceBaseline {
  const measurablyBusy = reading.reasons.length > 0 && (reading.level === 'busy' || reading.level === 'heavy');
  return {
    level: measurablyBusy || reading.level === 'unknown' ? reading.level : 'clear',
    vramUsedPercent: reading.vramUsedPercent,
    utilizationPercent: reading.utilizationPercent,
    message: measurablyBusy ? reading.message : '',
  };
}

// ---- The result -------------------------------------------------------------------

export type EnduranceStage = {
  id: string;
  label: string;
  numCtx: number;
  targetTokens: number;
  status: 'ok' | 'failed';
  promptTokens: number;
  writingTps: number | null;
  readingTps: number | null;
  loadSeconds: number;
  /** Share of the model on the graphics card, 0 to 1. */
  gpuShare: number | null;
  contextReported: number | null;
  /** Ollama gave the model a smaller context than was asked for (OLLAMA_NUM_PARALLEL above 1 splits it). */
  contextShort: boolean;
  passkeyKept: boolean;
  /** The prompt Ollama counted was near the size meant. If not, the stage says nothing about the model. */
  sizeOk: boolean;
  /** The writing speed in the words the Speed score uses: Excellent, Fast, Usable, Slow. */
  feels: string | null;
  error?: string;
  outOfMemory?: boolean;
};

export type EnduranceVerdictKind = 'holds' | 'slows' | 'spills' | 'loses' | 'stops' | 'unchecked';

export type EnduranceVerdict = {
  kind: EnduranceVerdictKind;
  /** The first stage that failed a test; null when none did. */
  problemStage: string | null;
  /** The largest context that passed every test, or null when none did. */
  heldTo: number | null;
  headline: string;
  /** The numbers behind it, in a sentence or two. */
  detail: string;
  /** Stages left out, and anything that makes the reading less sure. */
  notes: string[];
};

export type EnduranceStamp = {
  model: string;
  gpu?: string;
  vramGb?: number;
  driverVersion?: string;
  ollamaVersion?: string;
  quantization?: string;
  modelDigest?: string;
  appVersion: string;
  numPredict: number;
  tokensPerLine: number;
};

export type EnduranceResult = {
  id: string;
  completedAt: string;
  model: string;
  stages: EnduranceStage[];
  verdict: EnduranceVerdict;
  stamp: EnduranceStamp;
  baseline: EnduranceBaseline | null;
};

export type EnduranceFailure = { kind: 'not-installed' | 'too-big' | 'busy' | 'stopped' | 'failed'; message: string };
export type EnduranceOutcome = { kind: 'measured'; result: EnduranceResult } | EnduranceFailure;

// ---- Words ------------------------------------------------------------------------

/** 2048 reads as "2K". */
export const contextLabel = (numCtx: number) => `${Math.round(numCtx / 1024)}K`;

const tpsText = (value: number) => formatThroughputValue(value) ?? '?';
const percent = (share: number) => `${Math.round(share * 100)}%`;

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'another model';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The graphics card before the check, in a sentence; the empty string when it was not read. */
export function describeBaseline(baseline: EnduranceBaseline | null | undefined): string {
  if (!baseline || (baseline.vramUsedPercent === null && baseline.utilizationPercent === null)) return '';
  const parts = [
    baseline.vramUsedPercent === null ? null : `${Math.round(baseline.vramUsedPercent)}% of its memory in use`,
    baseline.utilizationPercent === null ? null : `${Math.round(baseline.utilizationPercent)}% busy`,
  ].filter(Boolean);
  return `Before the check the graphics card had ${parts.join(' and ')}. The point where a model slows down moves with what else is using the card.`;
}

// ---- The verdict ------------------------------------------------------------------

type Reason = 'slow' | 'spill' | 'lost';

/**
 * Read the stages in order and say where the model first gives out. A stage is
 * flagged when its writing speed falls under ENDURANCE_SPEED_KEPT_MIN of the
 * 2K speed, less than ENDURANCE_ON_CARD_MIN of the model sits on the graphics
 * card, or the hidden passkey did not come back. A stage whose prompt came out
 * the wrong size is left out and said so: it is not the model's failure.
 */
export function enduranceVerdict(stages: readonly EnduranceStage[]): EnduranceVerdict {
  const base = stages[0];
  const unchecked = (detail: string, notes: string[] = []): EnduranceVerdict => ({
    kind: 'unchecked', problemStage: null, heldTo: null, headline: 'Could not check this model', detail, notes,
  });
  if (!base) return unchecked('No stage ran.');
  if (base.status === 'failed') return unchecked(`Ollama stopped with an error at ${contextLabel(base.numCtx)}, before there was a speed to compare with.`);
  if (!base.sizeOk) {
    return unchecked(`The ${contextLabel(base.numCtx)} prompt came out at ${base.promptTokens} tokens instead of about ${base.targetTokens}, so there is nothing sound to compare the larger sizes with. This says nothing about the model.`);
  }
  if (!base.writingTps) return unchecked(`Ollama reported no writing speed at ${contextLabel(base.numCtx)}.`);

  const notes: string[] = [];
  let heldTo: EnduranceStage | null = null;
  for (const stage of stages) {
    const ctx = contextLabel(stage.numCtx);
    if (stage.contextShort && stage.contextReported) {
      notes.push(`At ${ctx}, Ollama gave the model a context of ${contextLabel(stage.contextReported)}. Ollama splits the context between slots when OLLAMA_NUM_PARALLEL is above 1, so a long prompt is cut.`);
    }
    if (stage.status === 'failed') {
      const past = heldTo ? ` past ${contextLabel(heldTo.numCtx)}` : '';
      return {
        kind: 'stops',
        problemStage: stage.id,
        heldTo: heldTo?.numCtx ?? null,
        headline: stage.outOfMemory ? `Runs out of memory${past}` : `Could not finish ${ctx}`,
        detail: stage.outOfMemory
          ? `At ${ctx} there was not enough memory for the model and its context.`
          : `At ${ctx} Ollama stopped with an error, so there is no reading for it.`,
        notes,
      };
    }
    if (!stage.sizeOk) {
      notes.push(`${stage.label} (${ctx}) is left out: the prompt came out at ${stage.promptTokens} tokens instead of about ${stage.targetTokens}. Ollama most likely cut it, so it says nothing about the model.`);
      continue;
    }
    const kept = stage !== base && stage.writingTps ? stage.writingTps / base.writingTps : null;
    const reasons: Reason[] = [];
    if (kept !== null && kept < ENDURANCE_SPEED_KEPT_MIN) reasons.push('slow');
    if (stage.gpuShare !== null && stage.gpuShare < ENDURANCE_ON_CARD_MIN) reasons.push('spill');
    if (!stage.passkeyKept) reasons.push('lost');
    if (reasons.length) return problem(stage, reasons, heldTo, base, kept, notes);
    heldTo = stage;
  }

  const checked = stages.filter((stage) => stage.status === 'ok' && stage.sizeOk);
  const last = checked[checked.length - 1];
  const left = stages.filter((stage) => !checked.includes(stage));
  const lastKept = last !== base && last.writingTps ? last.writingTps / base.writingTps : null;
  const lowestShare = Math.min(...checked.map((stage) => stage.gpuShare ?? 1));
  return {
    kind: 'holds',
    problemStage: null,
    heldTo: last.numCtx,
    headline: `Holds up to ${contextLabel(last.numCtx)} on your card${left.length ? `, ${listNames(left.map((stage) => contextLabel(stage.numCtx)))} not checked` : ''}`,
    detail: [
      lastKept === null ? null : `At ${contextLabel(last.numCtx)} it writes at ${tpsText(last.writingTps ?? 0)} tok/s, ${percent(lastKept)} of its ${contextLabel(base.numCtx)} speed.`,
      lowestShare >= 0.99 ? 'The whole model stays on the graphics card.' : `At least ${percent(lowestShare)} of the model stays on the graphics card.`,
      checked.length > 1 ? 'The passkey hidden in the prompt came back at every size.' : 'The passkey hidden in the prompt came back.',
    ].filter(Boolean).join(' '),
    notes,
  };
}

function problem(stage: EnduranceStage, reasons: Reason[], heldTo: EnduranceStage | null, base: EnduranceStage, kept: number | null, notes: string[]): EnduranceVerdict {
  const ctx = contextLabel(stage.numCtx);
  const past = heldTo ? `past ${contextLabel(heldTo.numCtx)}` : null;
  const spills = reasons.includes('spill');
  const lost = reasons.includes('lost');
  let kind: EnduranceVerdictKind;
  let headline: string;
  if (reasons.includes('slow')) {
    kind = 'slows';
    headline = `Slows down ${past}${spills ? ': part of the model moves to system memory' : ''}`;
  } else if (spills) {
    kind = 'spills';
    headline = past ? `Part of the model moves to system memory ${past}` : `Part of the model runs from system memory even at ${ctx}`;
  } else {
    kind = 'loses';
    headline = past ? `Loses the middle of long inputs ${past}` : 'Loses the middle of even short inputs';
  }
  const detail = [
    kept === null || stage.writingTps === null ? null : `At ${ctx} it writes at ${tpsText(stage.writingTps)} tok/s, ${percent(kept)} of its ${contextLabel(base.numCtx)} speed.`,
    stage.gpuShare === null ? null
      : stage.gpuShare < ENDURANCE_ON_CARD_MIN ? `Only ${percent(stage.gpuShare)} of the model fits on the graphics card there; the rest runs from system memory.`
        : `${stage.gpuShare >= 0.99 ? 'All' : percent(stage.gpuShare)} of the model stays on the graphics card, so this is the cost of reading more, not of running out of room.`,
    lost ? `The passkey hidden in the prompt did not come back at ${ctx}.` : null,
  ].filter(Boolean).join(' ');
  return { kind, problemStage: stage.id, heldTo: heldTo?.numCtx ?? null, headline, detail, notes };
}

// ---- Putting an answer together --------------------------------------------------

function toStage(reading: EnduranceStageReading, label: string): EnduranceStage {
  const writing = reading.writingTps ?? null;
  return {
    id: reading.id,
    label,
    numCtx: reading.numCtx,
    targetTokens: reading.targetTokens,
    status: reading.status,
    promptTokens: reading.promptTokens ?? 0,
    writingTps: writing,
    readingTps: reading.readingTps ?? null,
    loadSeconds: reading.loadSeconds ?? 0,
    gpuShare: reading.gpuShare ?? null,
    contextReported: reading.contextReported ?? null,
    contextShort: Boolean(reading.contextReported && reading.contextReported < reading.numCtx),
    passkeyKept: Boolean(reading.passkeyKept),
    sizeOk: Boolean(reading.sizeOk),
    feels: writing ? speedBand(writing).label : null,
    ...(reading.error ? { error: reading.error } : {}),
    ...(reading.outOfMemory ? { outOfMemory: true } : {}),
  };
}

/** Every answer but a finished run, in the screen's words. */
function failureFor(model: string, reply: Exclude<EnduranceRunReply, { status: 'done' }>): EnduranceFailure {
  switch (reply.status) {
    case 'not-installed':
      return { kind: 'not-installed', message: `${model} is not installed.` };
    case 'too-big':
      return { kind: 'too-big', message: `Not run: ${model} did not fit in this PC's memory.` };
    case 'busy':
      return {
        kind: 'busy',
        message: `Ollama has ${listNames(reply.loadedModels)} loaded by another program. It shares the graphics card and would slow the check, so RigMatch leaves it alone and does not start. Ollama lets an idle model go after about five minutes, so close what is using it or wait, then run again.`,
      };
    case 'shared': {
      if (reply.evicted) {
        return {
          kind: 'busy',
          message: `Not saved: Ollama unloaded ${model} while the check ran, most likely to make room for another program's model, so the numbers would be low. Run again when nothing else is using Ollama.`,
        };
      }
      const who = [...reply.loadedModels, ...(reply.sameModel ? [`another program's use of ${model}`] : [])];
      return {
        kind: 'busy',
        message: `Not saved: ${listNames(who)} came to share the graphics card while the check ran, so the numbers would be low. Run again when nothing else is using Ollama.`,
      };
    }
    case 'stopped':
      return { kind: 'stopped', message: 'Stopped. Nothing was saved for this check.' };
    case 'failed':
      return { kind: 'failed', message: `The check did not finish: ${reply.error}` };
  }
}

export function assembleEnduranceResult(
  model: string,
  reply: EnduranceRunReply,
  baseline: EnduranceBaseline | null,
  completedAt: string,
): EnduranceOutcome {
  if (reply.status !== 'done') return failureFor(model, reply);
  const stages = reply.stages.map((reading) => toStage(reading, ENDURANCE_STAGES.find((def) => def.id === reading.id)?.label ?? reading.id));
  const verdict = enduranceVerdict(stages);
  // Where a model gives out moves with what else uses the card, so a busy one is said beside the verdict, not only before it.
  if (baseline && (baseline.level === 'busy' || baseline.level === 'heavy')) {
    verdict.notes.push('The graphics card was busy before the check started, so a slow-down here may be something else\'s and not the model\'s. Close other graphics-heavy programs and check again.');
  }
  return {
    kind: 'measured',
    result: {
      id: `${model}-${completedAt}`,
      completedAt,
      model,
      stages,
      verdict,
      stamp: {
        model,
        gpu: reply.machine.gpu,
        vramGb: reply.machine.vramGb,
        driverVersion: reply.machine.driverVersion,
        ollamaVersion: reply.ollamaVersion,
        quantization: reply.quantization,
        modelDigest: reply.modelDigest,
        appVersion: reply.machine.appVersion,
        numPredict: reply.numPredict,
        tokensPerLine: reply.tokensPerLine,
      },
      baseline,
    },
  };
}

// ---- What it costs ----------------------------------------------------------------

/**
 * About how long a check takes, from the model's size and the fit grade's
 * estimated writing speed: a load at each size (the context changes, so Ollama
 * reloads; disk speed unknown, so a cautious 1.5 GB a second), reading the
 * prompts at fifteen times the writing speed (measured 22 to 50 times when the
 * model fits, so this is cautious), and writing 128 tokens a stage. A model
 * that spills into system memory at 16K takes longer: the 14B on a 12 GB card
 * read 5 times slower there and took 46 s for that one stage.
 *
 * Without the fit grade's estimate (the app has none to hand) the speed is
 * guessed from the size as 300 GB/s over the weights, which landed within a
 * third of the three real speeds (14B: 32 against 42, 8B: 58 against 74).
 */
export function estimateEnduranceSeconds({ sizeGb, estimateTps }: { sizeGb: number; estimateTps: number | null }): number {
  const tps = estimateTps && estimateTps > 0 ? estimateTps : Math.min(100, Math.max(8, 300 / Math.max(sizeGb, 0.5)));
  const readTokens = ENDURANCE_STAGES.reduce((total, stage) => total + stage.targetTokens, 0);
  return ENDURANCE_STAGES.length * (2 + sizeGb / 1.5) + readTokens / (tps * 15) + (ENDURANCE_STAGES.length * ENDURANCE_NUM_PREDICT) / tps + 3;
}

/** "about a minute", "about 3 minutes": it is minutes, so it never says seconds. */
export function describeEnduranceTime(seconds: number): string {
  return seconds <= 75 ? 'about a minute' : `about ${Math.ceil(seconds / 60)} minutes`;
}
