// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * One Speed score result as it is shared to the scoreboard, and the
 * scoreboard's check on what arrives.
 *
 * The app builds it from a saved result (submissionFor) and the scoreboard
 * Worker checks it (checkSubmission, in scoreboard/worker.ts), so both read
 * this one definition. It carries the rig stamp and the speeds, nothing else:
 * no host name, account, prompt or time of day. Its id is random, made when it
 * is sent, so a resend is not counted twice and nothing links two results.
 * Pure, so the app, the Worker and the tests all run it.
 */
import { RIG_REFERENCES, RIG_TIERS, RIG_WORKLOAD, tierPoints, type RigStamp, type RigTierId, type TierMeasure } from './rigScore.ts';

export const RIG_SUBMISSION_VERSION = 1;

/**
 * The parts of a saved result (RigResult, in rigScoreRun.ts) that sharing reads.
 * Named here, from rigScore.ts alone, so the Worker's code needs nothing else.
 */
export type ShareableResult = {
  tier: RigTierId;
  measure: TierMeasure;
  stamp: RigStamp;
  gpuShare: number | null;
  disturbed?: boolean;
};

/**
 * At least this much of the model on the graphics card. Below it, part of the
 * model ran in system memory and the speed is that memory's, not the card's.
 */
export const RIG_SUBMISSION_MIN_GPU_SHARE = 0.99;

export type RigSubmission = {
  v: typeof RIG_SUBMISSION_VERSION;
  /** Random, made when it is sent. */
  id: string;
  tier: RigTierId;
  model: string;
  modelDigest: string;
  quantization: string;
  workloadVersion: number;
  numCtx: number;
  prefillTps: number;
  decodeTps: number;
  loadSeconds: number;
  runs: number;
  gpuShare: number;
  gpu: string;
  vramGb: number | null;
  driverVersion: string | null;
  ollamaVersion: string | null;
  appVersion: string;
};

export type SubmissionCheck =
  | { ok: true; submission: RigSubmission }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^sha256-[0-9a-f]{64}$/;
const QUANTIZATION = /^[A-Za-z0-9_.-]{1,16}$/;
/** "610.88", "0.35.1", "0.11.0-beta": a version starts with a digit. The browser preview's "preview" does not. */
const VERSION = /^\d[0-9A-Za-z.+_-]{0,31}$/;
const CONTROL = /[\p{Cc}\p{Cf}]/u;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const inRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const above = (value: unknown, min: number, max: number): value is number => inRange(value, min, max) && value > min;

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 80 && !CONTROL.test(name) ? name : null;
}

function optionalVersion(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && VERSION.test(value) ? value : undefined;
}

/**
 * What arrives, checked field by field and rebuilt from the known fields only,
 * so anything else a sender adds is never stored.
 */
export function checkSubmission(raw: unknown): SubmissionCheck {
  if (!isRecord(raw)) return { ok: false, error: 'Not a result.' };
  if (raw.v !== RIG_SUBMISSION_VERSION) return { ok: false, error: 'Unknown result format.' };
  if (typeof raw.id !== 'string' || !UUID.test(raw.id)) return { ok: false, error: 'The id is not a random id.' };

  const tier = RIG_TIERS.find((entry) => entry.id === raw.tier);
  if (!tier) return { ok: false, error: 'Unknown tier.' };
  if (raw.model !== tier.model) return { ok: false, error: `The ${tier.label} tier runs ${tier.model}.` };
  if (raw.workloadVersion !== RIG_WORKLOAD.version || raw.numCtx !== RIG_WORKLOAD.numCtx) {
    return { ok: false, error: 'Measured with another version of the test.' };
  }
  if (typeof raw.modelDigest !== 'string' || !DIGEST.test(raw.modelDigest)) return { ok: false, error: 'The model file is not named.' };
  if (typeof raw.quantization !== 'string' || !QUANTIZATION.test(raw.quantization)) return { ok: false, error: 'The quantization is not named.' };

  if (!above(raw.prefillTps, 0, 500_000) || !above(raw.decodeTps, 0, 5_000)) return { ok: false, error: 'The speeds are out of range.' };
  if (!inRange(raw.loadSeconds, 0, 3_600)) return { ok: false, error: 'The load time is out of range.' };
  if (raw.runs !== RIG_WORKLOAD.measuredRuns) return { ok: false, error: `A score is the median of ${RIG_WORKLOAD.measuredRuns} runs.` };
  if (!inRange(raw.gpuShare, RIG_SUBMISSION_MIN_GPU_SHARE, 1.001)) return { ok: false, error: 'Part of the model ran outside the graphics card.' };

  const gpu = cleanName(raw.gpu);
  if (!gpu) return { ok: false, error: 'The graphics card is not named.' };
  if (raw.vramGb !== null && raw.vramGb !== undefined && !above(raw.vramGb, 0, 1_024)) return { ok: false, error: 'The graphics memory is out of range.' };
  const driverVersion = optionalVersion(raw.driverVersion);
  const ollamaVersion = optionalVersion(raw.ollamaVersion);
  if (driverVersion === undefined || ollamaVersion === undefined) return { ok: false, error: 'A version is not a version.' };
  if (typeof raw.appVersion !== 'string' || !VERSION.test(raw.appVersion)) return { ok: false, error: 'Only results from the RigMatch app are taken.' };

  return {
    ok: true,
    submission: {
      v: RIG_SUBMISSION_VERSION,
      id: raw.id,
      tier: tier.id,
      model: tier.model,
      modelDigest: raw.modelDigest,
      quantization: raw.quantization,
      workloadVersion: RIG_WORKLOAD.version,
      numCtx: RIG_WORKLOAD.numCtx,
      prefillTps: raw.prefillTps,
      decodeTps: raw.decodeTps,
      loadSeconds: raw.loadSeconds,
      runs: RIG_WORKLOAD.measuredRuns,
      gpuShare: Math.min(raw.gpuShare, 1),
      gpu,
      vramGb: typeof raw.vramGb === 'number' ? raw.vramGb : null,
      driverVersion,
      ollamaVersion,
      appVersion: raw.appVersion,
    },
  };
}

/**
 * A saved result as it would be shared, or why it can't be. The scoreboard
 * makes the same checks; these come first so the app can say why in plain words
 * before anything is sent.
 */
export function submissionFor(result: ShareableResult, id: string): SubmissionCheck {
  if (result.disturbed) return { ok: false, error: 'Something else used the graphics card during this run, so it isn\'t shared. Run it again for a clean result.' };
  if (result.stamp.appVersion === 'preview') return { ok: false, error: 'The browser preview\'s sample results aren\'t shared.' };
  if (!result.stamp.modelDigest) return { ok: false, error: 'RigMatch couldn\'t confirm which model file ran, so this result can\'t be compared with others.' };
  if (!result.stamp.gpu) return { ok: false, error: 'RigMatch couldn\'t read the graphics card\'s name.' };
  if (result.gpuShare === null || result.gpuShare < RIG_SUBMISSION_MIN_GPU_SHARE) {
    return { ok: false, error: 'Part of the model ran in system memory, so this result measures more than the graphics card.' };
  }
  return checkSubmission({
    v: RIG_SUBMISSION_VERSION,
    id,
    tier: result.tier,
    model: result.stamp.model,
    modelDigest: result.stamp.modelDigest,
    quantization: result.stamp.quantization,
    workloadVersion: result.stamp.workloadVersion,
    numCtx: result.stamp.numCtx,
    prefillTps: result.measure.prefillTps,
    decodeTps: result.measure.decodeTps,
    loadSeconds: result.measure.loadSeconds,
    runs: result.measure.runs,
    gpuShare: result.gpuShare,
    gpu: result.stamp.gpu,
    vramGb: result.stamp.vramGb ?? null,
    driverVersion: result.stamp.driverVersion ?? null,
    ollamaVersion: result.stamp.ollamaVersion ?? null,
    appVersion: result.stamp.appVersion,
  });
}

/**
 * Points for a set of speeds on a tier, against today's reference, or null
 * while the tier has none. The scoreboard keeps only results on the reference's
 * own model file, quantization, test version and context (boardFilter), so
 * the ratio is an honest one.
 */
export function boardPoints(tier: RigTierId, measure: Pick<TierMeasure, 'prefillTps' | 'decodeTps'>): number | null {
  const reference = RIG_REFERENCES[tier];
  return reference ? tierPoints({ ...measure, loadSeconds: 0, runs: RIG_WORKLOAD.measuredRuns }, reference) : null;
}

/** What a result must match to stand on a tier's board: the reference's work, when there is one. */
export function boardFilter(tier: RigTierId): { workloadVersion: number; numCtx: number; modelDigest: string | null; quantization: string | null } {
  const reference = RIG_REFERENCES[tier];
  return {
    workloadVersion: RIG_WORKLOAD.version,
    numCtx: RIG_WORKLOAD.numCtx,
    modelDigest: reference?.modelDigest ?? null,
    quantization: reference?.quantization ?? null,
  };
}
