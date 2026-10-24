// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Between the RigScore screen and its runner (electron/rigScoreRunner.cjs):
 * what to ask for, which tiers can be asked for, and what an answer means.
 *
 * The runner returns raw per-run timings and the machine's details; the score
 * is worked out here, from the one definition of the test in rigScore.ts, so
 * the main process holds no second copy of it. Pure, so every outcome a person
 * can meet is tested without Electron.
 */
import { formatGb } from './format.ts';
import { speedBand, type SpeedBand } from './rigScoreScale.ts';
import {
  RIG_HEADLINE_TIER,
  RIG_TIERS,
  RIG_WORKLOAD,
  measureTier,
  tiersThatFit,
  type RigRun,
  type RigStamp,
  type RigTier,
  type RigTierId,
  type TierMeasure,
} from './rigScore.ts';
import { rigPrompt } from './rigScorePassage.ts';

/** What the screen sends the runner for one tier. */
export type RigRunRequest = {
  progressId: string;
  tier: RigTierId;
  model: string;
  /** The runner refuses a card below this, with a fresh reading. */
  minVramGb: number;
  /** One per run, the warm-up first. */
  prompts: string[];
  options: { num_ctx: number; num_predict: number; temperature: number; seed: number };
  warmupRuns: number;
  measuredRuns: number;
};

/** The machine half of the stamp, as the runner read it. */
export type RigMachine = {
  gpu?: string;
  vramGb?: number;
  driverVersion?: string;
  isUnifiedMemory?: boolean;
  appVersion: string;
};

/** What the runner answers. */
export type RigRunReply =
  | {
    status: 'done';
    runs: RigRun[];
    /** The warm-up's load time: the timed runs find the model already loaded. */
    coldLoadSeconds: number | null;
    /** How much of the model sat on the graphics card, 0 to 1. */
    gpuShare: number | null;
    ollamaVersion?: string;
    modelDigest?: string;
    quantization?: string;
    machine: RigMachine;
  }
  | { status: 'not-installed' }
  | { status: 'too-big'; machine?: RigMachine; error?: string }
  /** Something else was loaded before the test began, so it did not begin. */
  | { status: 'busy'; loadedModels: string[] }
  /** Something came to share the card while the test ran, so nothing was kept. */
  | { status: 'shared'; loadedModels: string[]; sameModel?: boolean }
  | { status: 'stopped' }
  | { status: 'failed'; error: string };

export type RigProgress = {
  id: string;
  phase: 'checking' | 'loading' | 'run' | 'unloading';
  run?: number;
  of?: number;
};

/** One tier's result, as the screen shows it and the history keeps it. */
export type RigResult = {
  id: string;
  completedAt: string;
  tier: RigTierId;
  /** Its loadSeconds is the cold load, timed on the warm-up. */
  measure: TierMeasure;
  stamp: RigStamp;
  gpuShare: number | null;
};

export type RigOutcome =
  | { kind: 'measured'; result: RigResult }
  | { kind: 'not-installed' | 'too-big' | 'busy' | 'stopped' | 'failed'; message: string };

/** The request for one tier: the fixed workload, a prompt per run. */
export function rigRunRequest(tier: RigTier, progressId: string): RigRunRequest {
  const runs = RIG_WORKLOAD.warmupRuns + RIG_WORKLOAD.measuredRuns;
  return {
    progressId,
    tier: tier.id,
    model: tier.model,
    minVramGb: tier.minVramGb,
    prompts: Array.from({ length: runs }, (_, index) => rigPrompt(index + 1)),
    options: {
      num_ctx: RIG_WORKLOAD.numCtx,
      num_predict: RIG_WORKLOAD.numPredict,
      temperature: RIG_WORKLOAD.temperature,
      seed: RIG_WORKLOAD.seed,
    },
    warmupRuns: RIG_WORKLOAD.warmupRuns,
    measuredRuns: RIG_WORKLOAD.measuredRuns,
  };
}

export type TierAvailability =
  | { kind: 'ready' }
  /** Not installed: the screen offers the download, which the person starts. */
  | { kind: 'needs-download'; sizeGb: number }
  /** The card cannot hold it: "not run", never zero. */
  | { kind: 'too-big'; needGb: number; haveGb: number };

export type RigMachineFit = { vramGb: number; isUnifiedMemory?: boolean };

export function tierAvailability(tier: RigTier, machine: RigMachineFit, installed: readonly string[]): TierAvailability {
  if (!tiersThatFit(machine.vramGb, machine.isUnifiedMemory).some((fit) => fit.id === tier.id)) {
    return { kind: 'too-big', needGb: tier.minVramGb, haveGb: machine.vramGb };
  }
  if (!installed.includes(tier.model)) return { kind: 'needs-download', sizeGb: tier.sizeGb };
  return { kind: 'ready' };
}

/** "Run all": every tier this PC can hold and already has, smallest first. */
export function tiersToRun(machine: RigMachineFit, installed: readonly string[]): RigTier[] {
  return RIG_TIERS.filter((tier) => tierAvailability(tier, machine, installed).kind === 'ready');
}

export type RigHeadline = {
  /** The Standard tier's result, or until it has one, the first tier that does. */
  result: RigResult | null;
  isHeadlineTier: boolean;
  /**
   * The speed band, for the headline tier only. Light's 3B model writes fast on
   * a card that would make the 8B headline crawl, so its band would flatter.
   */
  band: SpeedBand | null;
};

export function rigHeadline(latest: Partial<Record<RigTierId, RigResult>>): RigHeadline {
  const result = latest[RIG_HEADLINE_TIER]
    ?? RIG_TIERS.map((tier) => latest[tier.id]).find((entry): entry is RigResult => Boolean(entry))
    ?? null;
  const isHeadlineTier = result?.tier === RIG_HEADLINE_TIER;
  return { result, isHeadlineTier, band: result && isHeadlineTier ? speedBand(result.measure.decodeTps) : null };
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'another model';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What the runner's answer means, in the screen's words; a measure and a stamp when it ran. */
export function assembleTierResult(tier: RigTier, reply: RigRunReply, completedAt: string): RigOutcome {
  switch (reply.status) {
    case 'not-installed':
      return { kind: 'not-installed', message: `${tier.model} is not installed. It is a ${formatGb(tier.sizeGb)} download.` };
    case 'too-big': {
      if (reply.error) return { kind: 'too-big', message: `Not run: ${tier.model} did not fit in this PC's memory.` };
      const have = reply.machine?.vramGb;
      return {
        kind: 'too-big',
        message: `Not run: the ${tier.label} tier needs ${tier.minVramGb} GB of graphics memory${have ? `, and this PC has ${formatGb(have)}` : ''}.`,
      };
    }
    case 'busy':
      return {
        kind: 'busy',
        message: `Ollama has ${listNames(reply.loadedModels)} loaded by another program. It shares the graphics card and would slow the test, so RigMatch leaves it alone and waits. Ollama lets an idle model go after about five minutes, so close what is using it or wait, then run again.`,
      };
    case 'shared': {
      const who = [
        ...reply.loadedModels,
        ...(reply.sameModel ? [`another program's use of ${tier.model}`] : []),
      ];
      return {
        kind: 'busy',
        message: `Not saved: ${listNames(who)} came to share the graphics card while the test ran, so the numbers would be low. Run again when nothing else is using Ollama.`,
      };
    }
    case 'stopped':
      return { kind: 'stopped', message: 'Stopped. Nothing was saved for this tier.' };
    case 'failed':
      return { kind: 'failed', message: `The test did not finish: ${reply.error}` };
    case 'done': {
      // The load is the warm-up's: the timed runs find the model already loaded.
      const measure = measureTier(reply.runs, RIG_WORKLOAD.measuredRuns, reply.coldLoadSeconds ?? 0);
      if (!measure) {
        return {
          kind: 'failed',
          message: `Fewer than ${RIG_WORKLOAD.measuredRuns} runs gave usable timings, so there is no score. The model stopped too early or Ollama reported no times.`,
        };
      }
      const stamp: RigStamp = {
        tier: tier.id,
        model: tier.model,
        modelDigest: reply.modelDigest,
        quantization: reply.quantization,
        workloadVersion: RIG_WORKLOAD.version,
        numCtx: RIG_WORKLOAD.numCtx,
        ollamaVersion: reply.ollamaVersion,
        driverVersion: reply.machine.driverVersion,
        gpu: reply.machine.gpu,
        vramGb: reply.machine.vramGb,
        appVersion: reply.machine.appVersion,
      };
      return {
        kind: 'measured',
        result: {
          id: `${tier.id}-${completedAt}`,
          completedAt,
          tier: tier.id,
          measure,
          stamp,
          gpuShare: reply.gpuShare,
        },
      };
    }
  }
}
