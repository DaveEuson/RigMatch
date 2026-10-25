// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * rigmatch-fit --measure: RigScore's speed test, from a terminal.
 *
 * The fit grade estimates a speed from a model's size and the card; this
 * measures it, through the user's own Ollama, with the app's own test: the
 * same tiers, passage and settings (src/lib/rigScore.ts), the same runner
 * (electron/rigScoreRunner.cjs) and the same points against the same
 * reference PC, so a number here can be set beside one from the app or from
 * another computer.
 *
 * Everything here is pure or takes what it touches as an argument, so the
 * tests drive it with a stand-in Ollama. rigmatch-fit.ts supplies the real
 * hardware reading, Ollama and Ctrl+C.
 */
import runner from '../electron/rigScoreRunner.cjs';
import contention from '../electron/gpuContention.cjs';
import { pullCommand } from '../src/lib/modelGrade.ts';
import {
  RIG_HEADLINE_TIER,
  RIG_REFERENCE_MACHINE,
  RIG_TIERS,
  RIG_WORKLOAD,
  rigPoints,
  type RigPoints,
  type RigStamp,
  type RigTier,
  type TierMeasure,
} from '../src/lib/rigScore.ts';
import {
  assembleModelResult,
  assembleTierResult,
  rigModelRequest,
  rigRunRequest,
  tierAvailability,
  type RigMachine,
  type RigModelStamp,
  type RigProgress,
  type RigRunReply,
  type RigRunRequest,
} from '../src/lib/rigScoreRun.ts';
import { speedBand, type SpeedBand } from '../src/lib/rigScoreScale.ts';
import { MARQUEE_BORDER, describeHardware, marquee, wrap, type FitHardware } from './fitCheck.ts';

type Phase = Omit<RigProgress, 'id'>;

/** What the runner needs from the outside world (rigScoreRunner.cjs's runRigTier). */
export type MeasureDeps = {
  baseUrl: string;
  fetchJson: (url: string, options?: { method?: string; body?: string; signal?: AbortSignal }, timeoutMs?: number) => Promise<unknown>;
  readMachine: () => Promise<RigMachine>;
  signal?: AbortSignal;
  now?: () => number;
};

const runRigTier = runner.runRigTier as (deps: MeasureDeps & {
  request: RigRunRequest;
  unloadModel: (baseUrl: string, model: string) => Promise<unknown>;
  onProgress?: (update: Phase) => void;
}) => Promise<RigRunReply>;
const unloadOllamaModel = runner.unloadOllamaModel as (args: {
  fetchJson: MeasureDeps['fetchJson']; baseUrl: string; model: string;
}) => Promise<boolean>;

/** One request through the shared runner, unloading what it loaded however it ends. */
export function runRequest(deps: MeasureDeps, request: RigRunRequest, onProgress?: (update: Phase) => void): Promise<RigRunReply> {
  return runRigTier({
    ...deps,
    request,
    // Best effort: keep_alive frees the card soon anyway.
    unloadModel: (baseUrl, model) => unloadOllamaModel({ fetchJson: deps.fetchJson, baseUrl, model }).catch(() => false),
    onProgress,
  });
}

// ---- The command line -------------------------------------------------------

/**
 * Whether this is a --measure run, and of which model. --measure is a switch
 * and the model, if any, follows it as a plain argument, so `--measure` alone
 * and `--measure qwen3.5:9b` both work. The listing flags make no sense with
 * it: --vram grades another card, and --measure runs on this one.
 */
export function checkMeasureArgs(
  values: { measure?: boolean; all?: boolean; installed?: boolean; vram?: string; provider?: string },
  positionals: readonly string[],
): { model: string | undefined } | null {
  if (!values.measure) {
    if (positionals.length) throw new Error(`Unexpected "${positionals[0]}". To measure a model's real speed: rigmatch-fit --measure ${positionals[0]}`);
    return null;
  }
  if (positionals.length > 1) throw new Error('--measure takes one model at a time, or none to run the RigScore tiers.');
  if (values.vram !== undefined) throw new Error('--vram grades for another card, and --measure measures this one, so they do not go together.');
  if (values.all || values.installed) throw new Error('--all and --installed list models, and --measure runs them: use one or the other.');
  if ((values.provider ?? 'ollama').toLowerCase().replace(/[\s_-]/g, '') !== 'ollama') {
    throw new Error('--measure runs models through Ollama, so it works only with --provider ollama.');
  }
  return { model: positionals[0] };
}

// ---- Is something else using the card? --------------------------------------------

/**
 * What the graphics card was doing, in the app's own words and thresholds
 * (electron/gpuContention.cjs): the app checks before a test and warns, because
 * a game, a render or a browser tab held the card for a whole run once and the
 * score read as a slow PC. Ollama's own listing cannot see that, since it only
 * knows its models. NVIDIA only here (nvidia-smi); other vendors read as
 * 'unknown', which says nothing rather than 'clear'.
 */
export type CardNote = {
  level: 'clear' | 'busy' | 'heavy' | 'unknown';
  reasons: string[];
  apps: string[];
  /** The app's sentence for it, "Before starting: ...", empty when clear or unknown. */
  message: string;
};

type CommandRunner = (command: string, args: string[], timeoutMs: number) => Promise<{ output: string; error: string | null }>;

const assessCard = contention.assessGpuContention as (
  reading: unknown, apps?: string[], options?: { unifiedMemory?: boolean },
) => { level: CardNote['level']; reasons: string[]; apps: string[] };

const LINE_BREAK = /\r?\n/;

/** The process names the platform lists, for the known graphics-heavy programs. */
async function processNames(run: CommandRunner, platform: string): Promise<string[]> {
  if (platform === 'win32') {
    // tasklist's CSV: the image name is the first quoted field of each row.
    const { output } = await run('tasklist', ['/FO', 'CSV', '/NH'], 4000);
    return output.split(LINE_BREAK).map((line) => line.match(/^"([^"]+)"/)?.[1]).filter((name): name is string => Boolean(name));
  }
  const { output } = await run('ps', ['-eo', 'comm='], 4000);
  return output.split(LINE_BREAK).map((line) => line.trim()).filter(Boolean);
}

export async function checkCard(
  run: CommandRunner,
  { platform, unifiedMemory = false, samples = 5, gapMs = 220 }: { platform: string; unifiedMemory?: boolean; samples?: number; gapMs?: number },
): Promise<CardNote> {
  const readings: unknown[] = [];
  for (let index = 0; index < samples; index += 1) {
    const { output } = await run('nvidia-smi', ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'], 4000);
    const reading = output ? contention.parseNvidiaGpuQuery(output) : null;
    if (reading) readings.push(reading);
    if (index < samples - 1 && gapMs > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
  }
  // A median of several, as the app takes: a single reading of an ordinary
  // desktop lands anywhere from 12% to 44%.
  const median = contention.medianReading(readings);
  if (!median) return { level: 'unknown', reasons: [], apps: [], message: '' };
  const apps = contention.matchKnownGpuApps(await processNames(run, platform).catch(() => []));
  const assessment = assessCard(median, apps, { unifiedMemory });
  return {
    level: assessment.level,
    reasons: assessment.reasons,
    apps: assessment.apps,
    message: assessment.level === 'busy' || assessment.level === 'heavy' ? contention.describeGpuContention(assessment) : '',
  };
}

/**
 * A speed far below the grade's own estimate for this model on this card. The
 * grade is a guess, and a measured speed runs from a little under it to well
 * over (here 0.9 to 1.5 times it), so under half means something other than the model is
 * in the way: another program on the card, or a model that did not sit wholly
 * on it. Said on the result, because the points read as a slow PC otherwise.
 */
export const FAR_BELOW_ESTIMATE = 0.5;
export function farBelowEstimate(measure: Pick<TierMeasure, 'decodeTps'>, estimateTps: number | null): boolean {
  return Boolean(estimateTps && estimateTps > 0 && measure.decodeTps < estimateTps * FAR_BELOW_ESTIMATE);
}

// ---- The plan ----------------------------------------------------------------

export type PlanEntry =
  | { tier: RigTier; kind: 'run'; estimateTps: number | null }
  | { tier: RigTier; kind: 'missing'; command: string }
  | { tier: RigTier; kind: 'too-big'; needGb: number; haveGb: number };

/**
 * Every tier, and what happens to it here: run, if it is installed and this
 * card holds it; the download command, if it is missing (printed, never run);
 * "not run" if the card is too small, never a zero.
 */
export function planTiers(
  hardware: Pick<FitHardware, 'vramGb' | 'unifiedMemory'>,
  installed: readonly string[],
  estimates: ReadonlyMap<string, number | null> = new Map(),
): PlanEntry[] {
  return RIG_TIERS.map((tier) => {
    const availability = tierAvailability(tier, { vramGb: hardware.vramGb, isUnifiedMemory: hardware.unifiedMemory }, installed);
    if (availability.kind === 'too-big') return { tier, kind: 'too-big', needGb: availability.needGb, haveGb: availability.haveGb };
    if (availability.kind === 'needs-download') return { tier, kind: 'missing', command: pullCommand(tier.model) };
    return { tier, kind: 'run', estimateTps: estimates.get(tier.model) ?? null };
  });
}

/**
 * How long the runs should take, from the fit grade's estimated speed: a load
 * (disk speed unknown, so a cautious 1.5 GB a second), then a warm-up and the
 * timed runs, each reading the passage and writing 256 tokens.
 */
export function estimateSeconds(models: ReadonlyArray<{ sizeGb: number; estimateTps: number | null }>): number {
  const runs = RIG_WORKLOAD.warmupRuns + RIG_WORKLOAD.measuredRuns;
  return models.reduce((total, { sizeGb, estimateTps }) => {
    const tps = estimateTps && estimateTps > 0 ? estimateTps : 20;
    const perRun = RIG_WORKLOAD.numPredict / tps + RIG_WORKLOAD.promptTokensTarget / (tps * 40) + 0.5;
    return total + 2 + sizeGb / 1.5 + runs * perRun + 1;
  }, 0);
}

/** "about a minute", "about 3 minutes": it is minutes, so it never says seconds. */
export function describeDuration(seconds: number): string {
  return seconds <= 75 ? 'about a minute' : `about ${Math.ceil(seconds / 60)} minutes`;
}

// ---- Running the tiers ---------------------------------------------------------

export type MeasuredTier = {
  tier: RigTier; status: 'measured'; measure: TierMeasure; stamp: RigStamp; gpuShare: number | null; points: RigPoints; band: SpeedBand;
  /** The fit grade's guess for this model on this card, to check the measure against. */
  estimateTps: number | null;
};
export type TierLine =
  | MeasuredTier
  | { tier: RigTier; status: 'missing'; command: string }
  | { tier: RigTier; status: 'too-big'; message: string }
  /** Not reached: an earlier tier was stopped, or found the card busy. */
  | { tier: RigTier; status: 'skipped' }
  | { tier: RigTier; status: 'busy' | 'stopped' | 'failed'; message: string };

export type MeasureReport = {
  lines: TierLine[];
  /** Stopped with Ctrl+C. */
  stopped: boolean;
  /** Another program's model was in the way: the test did not run, or did not keep its numbers. */
  busy: boolean;
  /** What the graphics card was doing before and after the runs (checkCard); filled in by the caller. */
  card?: { before: CardNote | null; after: CardNote | null };
};

const tooBigMessage = (needGb: number, haveGb: number) => `Not run: needs ${needGb} GB of graphics memory, and this PC has ${Math.round(haveGb * 10) / 10} GB.`;

function measuredLine(tier: RigTier, measure: TierMeasure, stamp: RigStamp, gpuShare: number | null, estimateTps: number | null = null): MeasuredTier {
  return { tier, status: 'measured', measure, stamp, gpuShare, points: rigPoints(measure, stamp), band: speedBand(measure.decodeTps), estimateTps };
}

/**
 * The tiers in the plan, smallest first, one at a time. A busy card or Ctrl+C
 * ends the queue: the next tier would meet the same card.
 */
export async function measureTiers(
  plan: PlanEntry[],
  run: (request: RigRunRequest, tier: RigTier) => Promise<RigRunReply>,
  { now = () => new Date().toISOString(), onTierStart, onTierEnd }: {
    now?: () => string;
    onTierStart?: (tier: RigTier) => void;
    /** Each tier that ran, as it finishes, for the line that says how it went. */
    onTierEnd?: (line: TierLine) => void;
  } = {},
): Promise<MeasureReport> {
  const lines: TierLine[] = [];
  let stopped = false;
  let busy = false;
  for (const entry of plan) {
    const { tier } = entry;
    if (entry.kind === 'missing') { lines.push({ tier, status: 'missing', command: entry.command }); continue; }
    if (entry.kind === 'too-big') { lines.push({ tier, status: 'too-big', message: tooBigMessage(entry.needGb, entry.haveGb) }); continue; }
    if (stopped || busy) { lines.push({ tier, status: 'skipped' }); continue; }
    onTierStart?.(tier);
    const outcome = assembleTierResult(tier, await run(rigRunRequest(tier, `fit-${tier.id}`), tier), now());
    let line: TierLine;
    if (outcome.kind === 'measured') {
      line = measuredLine(tier, outcome.result.measure, outcome.result.stamp, outcome.result.gpuShare, entry.kind === 'run' ? entry.estimateTps : null);
    } else if (outcome.kind === 'not-installed') {
      line = { tier, status: 'missing', command: pullCommand(tier.model) };
    } else if (outcome.kind === 'too-big') {
      line = { tier, status: 'too-big', message: outcome.message };
    } else {
      line = { tier, status: outcome.kind, message: outcome.message };
      if (outcome.kind === 'stopped') stopped = true;
      if (outcome.kind === 'busy') busy = true;
    }
    lines.push(line);
    onTierEnd?.(line);
  }
  return { lines, stopped, busy };
}

/** How a tier that ran went, in one line: its speeds and points, or what stopped it. */
export function formatTierDone(line: TierLine): string {
  const lead = `${line.tier.label}, ${line.tier.model}: `;
  switch (line.status) {
    case 'measured': {
      const points = line.points.kind === 'points' ? `, ${number(line.points.points)} points` : '';
      return `${lead}${tps(line.measure.decodeTps)} tok/s writing, ${tps(line.measure.prefillTps)} tok/s reading${points}`;
    }
    case 'stopped': return `${lead}stopped`;
    case 'busy': return `${lead}not kept, Ollama was busy`;
    case 'failed': return `${lead}did not finish`;
    case 'missing': return `${lead}not installed`;
    case 'too-big': return `${lead}did not fit`;
    case 'skipped': return `${lead}not run`;
  }
}

/** The headline, as the app has it: the Standard tier, with points and its speed band. */
export function headlineOf(report: MeasureReport): MeasuredTier | null {
  return report.lines.find((line): line is MeasuredTier => line.status === 'measured' && line.tier.id === RIG_HEADLINE_TIER) ?? null;
}

// ---- One model -----------------------------------------------------------------

export type ModelReport = {
  model: string;
  /** The fit grade's estimate, to set beside the measure. */
  estimateTps: number | null;
  /** The tier this model is, when it is one: then it has points. */
  tier: RigTier | null;
  /** What the graphics card was doing before and after the run (checkCard); filled in by the caller. */
  card?: { before: CardNote | null; after: CardNote | null };
} & (
  | { status: 'measured'; measure: TierMeasure; stamp: RigStamp | RigModelStamp; gpuShare: number | null; points: RigPoints | null; band: SpeedBand }
  | { status: 'missing'; command: string }
  | { status: 'busy' | 'stopped' | 'failed' | 'too-big'; message: string }
);

/** The tier a model is, if it is one and this card holds it: measured as that tier, it gets points. */
export function tierFor(model: string, hardware: Pick<FitHardware, 'vramGb' | 'unifiedMemory'>): RigTier | null {
  const tier = RIG_TIERS.find((entry) => entry.model === model);
  if (!tier) return null;
  return tierAvailability(tier, { vramGb: hardware.vramGb, isUnifiedMemory: hardware.unifiedMemory }, [model]).kind === 'ready' ? tier : null;
}

export async function measureModel(
  model: string,
  { installed, hardware, estimateTps, run }: {
    installed: readonly string[];
    hardware: Pick<FitHardware, 'vramGb' | 'unifiedMemory'>;
    estimateTps: number | null;
    run: (request: RigRunRequest) => Promise<RigRunReply>;
  },
): Promise<ModelReport> {
  const base = { model, estimateTps, tier: tierFor(model, hardware) };
  if (!installed.includes(model)) return { ...base, status: 'missing', command: pullCommand(model) };
  if (base.tier) {
    const outcome = assembleTierResult(base.tier, await run(rigRunRequest(base.tier, `fit-${base.tier.id}`)), new Date().toISOString());
    if (outcome.kind !== 'measured') return { ...base, status: outcome.kind === 'not-installed' ? 'failed' : outcome.kind, message: outcome.message };
    const line = measuredLine(base.tier, outcome.result.measure, outcome.result.stamp, outcome.result.gpuShare);
    return { ...base, status: 'measured', measure: line.measure, stamp: line.stamp, gpuShare: line.gpuShare, points: line.points, band: line.band };
  }
  const outcome = assembleModelResult(model, await run(rigModelRequest(model, 'fit-model')));
  if (outcome.kind !== 'measured') return { ...base, status: outcome.kind === 'not-installed' ? 'failed' : outcome.kind, message: outcome.message };
  return { ...base, status: 'measured', measure: outcome.measure, stamp: outcome.stamp, gpuShare: outcome.gpuShare, points: null, band: speedBand(outcome.measure.decodeTps) };
}

// ---- Printing ------------------------------------------------------------------

/** Plain ASCII numbers with a comma, whatever the locale: the output stays ASCII. */
const number = (value: number) => Math.round(value).toLocaleString('en-US');
/** As the app rounds a speed: a tenth below 20, whole above (format.ts formatThroughputValue). */
const tps = (value: number) => (value >= 20 ? number(value) : String(Math.round(value * 10) / 10));
const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - text.length));

function pointsCell(points: RigPoints | null): string {
  if (!points) return '-';
  if (points.kind === 'points') return number(points.points);
  return points.kind === 'pending' ? 'pending' : '-';
}

/** The notes a measured tier carries: a spill, points it cannot have, what differs from the reference. */
function notesFor(label: string, line: { gpuShare: number | null; points: RigPoints | null; measure: TierMeasure; estimateTps: number | null }): string[] {
  const notes: string[] = [];
  if (farBelowEstimate(line.measure, line.estimateTps)) {
    notes.push(`${label}: writing ${tps(line.measure.decodeTps)} tok/s is far below the ~${number(line.estimateTps ?? 0)} tok/s estimated for this card. Something else may have been using the graphics card, or the model did not sit wholly on it, so this number is lower than this PC can do. Close other programs and run again before trusting it.`);
  }
  if (line.gpuShare !== null && line.gpuShare < 0.99) {
    notes.push(`${label} ran ${Math.round(line.gpuShare * 100)}% on the graphics card; the rest spilled into system memory.`);
  }
  if (line.points?.kind === 'not-comparable') notes.push(`${label}: no points, not the same test as the reference. ${line.points.notes.join(' ')}`);
  if (line.points?.kind === 'pending') notes.push(`${label}: points after the reference is measured.`);
  if (line.points?.kind === 'points' && line.points.notes.length) notes.push(`${label}, against the reference: ${line.points.notes.join(' ')}`);
  return notes;
}

/**
 * show: the game-show dressing, for a terminal. header: the title and the
 * card, for a report printed on its own (piped, where the intro went to
 * stderr); in a terminal the intro above it has already said both.
 */
export type PrintOptions = {
  show?: boolean; columns?: number; header?: FitHardware;
  /** What the card was doing before the runs: a busy one is said in the intro. */
  before?: CardNote | null;
};

/**
 * After the runs, a card that is still busy: something else was probably on it
 * during them. Only when the card itself reads busy (utilisation or memory):
 * a known program merely being open, Steam on most gaming PCs, is said before
 * the runs, as the app says it, but does not mean the runs were disturbed.
 */
function afterNote(card: CardNote | null | undefined): string[] {
  if (!card || (card.level !== 'busy' && card.level !== 'heavy') || card.reasons.length === 0) return [];
  const reasons = card.reasons.join(' and ');
  const named = card.apps.length ? ` ${card.apps.join(' and ')} ${card.apps.length === 1 ? 'is' : 'are'} running.` : '';
  return [`After the runs, ${reasons}.${named} Something else was probably using the graphics card during them, so these numbers are lower than this PC can do. Close other graphics-heavy programs and run again.`];
}

const headerLines = (title: string, header: FitHardware | undefined, columns: number | undefined) => (header
  ? [title, ...wrap(describeHardware(header), columns), '']
  : []);

/** What comes before the runs: who is on tonight, what is not, and how long it takes. */
export function formatIntro(hardware: FitHardware, plan: PlanEntry[], { show = false, columns, before }: PrintOptions = {}): string {
  const sign = show && (!columns || columns >= MARQUEE_BORDER.length);
  const running = plan.filter((entry) => entry.kind === 'run');
  const lines = [...(sign ? marquee('speed test', 'How fast is your PC, really?') : ['RigMatch speed test']), describeHardware(hardware)];
  const prose: string[] = [];
  for (const entry of plan) {
    if (entry.kind === 'missing') prose.push(`${entry.tier.label} needs ${entry.tier.model}, which is not installed. Get it with: ${entry.command} (${entry.tier.sizeGb} GB), then measure again.`);
    if (entry.kind === 'too-big') prose.push(`${entry.tier.label} (${entry.tier.model}) is not run: ${tooBigMessage(entry.needGb, entry.haveGb).replace(/^Not run: /, '')}`);
  }
  if (running.length) {
    const who = running.map((entry) => `${entry.tier.label} (${entry.tier.model})`).join(', ');
    const time = describeDuration(estimateSeconds(running.map((entry) => ({ sizeGb: entry.tier.sizeGb, estimateTps: entry.estimateTps }))));
    prose.push(`${show ? 'Tonight\'s speed dates' : 'Measuring'}: ${who}. This takes ${time}: each loads its model, warms it up, then times ${RIG_WORKLOAD.measuredRuns} runs. Ctrl+C stops and unloads.`);
  } else {
    prose.push('Nothing to measure: no RigScore tier model is installed that this card can hold.');
  }
  if (running.length && before?.message) prose.push(before.message);
  // In a terminal the runs that follow are the show's speed dates.
  return [...lines, ...prose.flatMap((text) => wrap(text, columns)), ...(show && running.length ? ['', 'Speed dates'] : [])].join('\n');
}

/** A progress line for one tier, as Ollama works through it. */
export function formatProgress(tier: Pick<RigTier, 'label' | 'model'>, phase: Phase): string {
  const what = phase.phase === 'checking' ? 'checking Ollama'
    : phase.phase === 'loading' ? 'loading, and a warm-up run (not timed)'
      : phase.phase === 'unloading' ? 'unloading'
        : `timed run ${phase.run} of ${phase.of}`;
  return `${tier.label}, ${tier.model}: ${what}`;
}

/** Before one model's runs: the sign, the card, and how long. */
export function formatModelIntro(
  model: string,
  hardware: FitHardware,
  { estimateTps, sizeGb }: { estimateTps: number | null; sizeGb: number | null },
  { show = false, columns, before }: PrintOptions = {},
): string {
  const sign = show && (!columns || columns >= MARQUEE_BORDER.length);
  const time = describeDuration(estimateSeconds([{ sizeGb: sizeGb ?? 5, estimateTps }]));
  return [
    ...(sign ? marquee('speed test', 'How fast is your PC, really?') : ['RigMatch speed test']),
    ...wrap(describeHardware(hardware), columns),
    ...wrap(`${show ? 'Tonight\'s speed date' : 'Measuring'}: ${model}. This takes ${time}: it loads the model, warms it up, then times ${RIG_WORKLOAD.measuredRuns} runs. Ctrl+C stops and unloads.`, columns),
    ...(before?.message ? wrap(before.message, columns) : []),
    ...(show ? ['', 'Speed date'] : []),
  ].join('\n');
}

/** The results: one row a tier, the notes, the headline and what 1,000 points is. */
export function formatReport(report: MeasureReport, { show = false, columns, header: card }: PrintOptions = {}): string {
  const header = ['Tier', 'Model', 'Writing', 'Reading', 'Points', 'Feels'];
  const rows = report.lines.map((line) => {
    const lead = [line.tier.label, line.tier.model];
    switch (line.status) {
      case 'measured': return [...lead, `${tps(line.measure.decodeTps)} tok/s`, `${tps(line.measure.prefillTps)} tok/s`, pointsCell(line.points), line.band.label];
      case 'missing': return [...lead, `Not installed: ${line.command}`];
      case 'skipped': return [...lead, report.stopped ? 'Not run: stopped' : 'Not run: Ollama was busy'];
      default: return [...lead, line.message];
    }
  });
  // Widths from the measured rows only: a message runs on past the columns.
  const full = rows.filter((row) => row.length === header.length);
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => (row.length === header.length || column < 2 ? (row[column] ?? '').length : 0))));
  const render = (row: string[]) => row.map((cell, at) => (at === row.length - 1 ? cell : pad(cell, widths[at]))).join('  ').trimEnd();
  const lines: string[] = headerLines('RigMatch speed test', card, columns);
  lines.push(render(full.length ? header : header.slice(0, 2)), ...rows.map(render));

  const notes = report.lines.flatMap((line) => (line.status === 'measured' ? notesFor(line.tier.label, line) : []));
  if (report.busy) notes.push('Another program had a model loaded in Ollama, so RigMatch left it alone and stopped. Run again when nothing else is using Ollama.');
  if (report.stopped) notes.push('Stopped with Ctrl+C. The model was unloaded, and nothing was kept for the tier that was running.');
  if (report.lines.some((line) => line.status === 'measured')) notes.push(...afterNote(report.card?.after));
  if (notes.length) lines.push('', ...notes.flatMap((text) => wrap(text, columns)));

  const headline = headlineOf(report);
  const closing: string[] = [];
  if (headline) {
    const score = headline.points.kind === 'points' ? `${number(headline.points.points)} points` : `${tps(headline.measure.decodeTps)} tok/s writing`;
    const feel = `${headline.band.label}: ${headline.band.feel.charAt(0).toLowerCase()}${headline.band.feel.slice(1)}`;
    closing.push(show ? `Tonight's RigScore: ${score} on the ${headline.tier.label} tier. ${feel}` : `RigScore: ${score} (${headline.tier.label} tier, ${headline.tier.model}). ${feel}`);
  } else if (!report.stopped && !report.busy) {
    const standard = RIG_TIERS.find((tier) => tier.id === RIG_HEADLINE_TIER);
    closing.push(`No RigScore yet: the headline is the ${standard?.label} tier, ${standard?.model}.`);
  }
  closing.push(`1,000 points is the reference PC, an ${RIG_REFERENCE_MACHINE}. Twice as fast at both writing and reading is 2,000. Writing is how fast the answer comes out; reading is how fast the prompt goes in.`);
  lines.push('', ...closing.flatMap((text) => wrap(text, columns)));
  return lines.join('\n');
}

/** How one model's run went, in one line. */
export function formatModelDone(report: ModelReport): string {
  if (report.status !== 'measured') return `${report.model}: ${report.status === 'busy' ? 'not kept, Ollama was busy' : report.status === 'failed' ? 'did not finish' : report.status}`;
  return `${report.model}: ${tps(report.measure.decodeTps)} tok/s writing, ${tps(report.measure.prefillTps)} tok/s reading`;
}

/** One model's measure beside its estimate. */
export function formatModelReport(report: ModelReport, { show = false, columns, header: card }: PrintOptions = {}): string {
  const lines = headerLines(`RigMatch speed test: ${report.model}`, card, columns);
  const estimate = report.estimateTps ? `~${number(report.estimateTps)} tok/s` : '-';
  if (report.status === 'measured') {
    const header = ['Model', 'Writing', 'Estimated', 'Reading', 'Loads in', 'Points'];
    const row = [report.model, `${tps(report.measure.decodeTps)} tok/s`, estimate, `${tps(report.measure.prefillTps)} tok/s`,
      report.measure.loadSeconds > 0 ? `${report.measure.loadSeconds.toFixed(1)} s` : '-', pointsCell(report.points)];
    const widths = header.map((title, at) => Math.max(title.length, row[at].length));
    const render = (cells: string[]) => cells.map((cell, at) => (at === cells.length - 1 ? cell : pad(cell, widths[at]))).join('  ').trimEnd();
    lines.push(render(header), render(row), '');
    const prose = [`${report.band.label}: ${report.band.feel.charAt(0).toLowerCase()}${report.band.feel.slice(1)}`,
      ...notesFor(report.model, report),
      report.tier ? `${report.model} is RigScore's ${report.tier.label} tier, so it has points against the reference PC, an ${RIG_REFERENCE_MACHINE}.`
        : 'Points are for the four RigScore tier models (--measure on its own runs them). This is this model\'s own speed on the same test.',
      'Estimated is the fit grade\'s guess from the size and the card; writing is measured.',
      ...afterNote(report.card?.after)];
    lines.push(...prose.flatMap((text) => wrap(text, columns)));
    if (show) lines.push('', ...wrap(`Tonight's date: ${report.model} writes ${tps(report.measure.decodeTps)} tok/s here.${report.points?.kind === 'points' ? ` ${number(report.points.points)} points.` : ''}`, columns));
  } else if (report.status === 'missing') {
    lines.push(...wrap(`${report.model} is not installed. Get it with: ${report.command}, then measure again.`, columns));
  } else {
    lines.push(...wrap(report.message, columns));
  }
  return lines.join('\n');
}

// ---- JSON ----------------------------------------------------------------------

const workloadJson = () => ({
  version: RIG_WORKLOAD.version,
  numCtx: RIG_WORKLOAD.numCtx,
  numPredict: RIG_WORKLOAD.numPredict,
  promptTokens: RIG_WORKLOAD.promptTokensTarget,
  warmupRuns: RIG_WORKLOAD.warmupRuns,
  measuredRuns: RIG_WORKLOAD.measuredRuns,
});

const hardwareJson = (hardware: FitHardware) => ({
  gpu: hardware.gpu,
  vramGb: hardware.vramGb,
  unifiedMemory: hardware.unifiedMemory,
  ramGb: hardware.ramGb,
  platform: hardware.platform,
  arch: hardware.arch,
});

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

const measureJson = (measure: TierMeasure, gpuShare: number | null) => ({
  writingTps: round(measure.decodeTps),
  readingTps: round(measure.prefillTps),
  loadSeconds: round(measure.loadSeconds, 2),
  runs: measure.runs,
  gpuShare,
});

const pointsJson = (points: RigPoints | null) => (points?.kind === 'points'
  ? { points: points.points, pointsNote: points.notes.join(' ') || null }
  : { points: null, pointsNote: points?.kind === 'pending' ? 'reference not measured yet' : points ? points.notes.join(' ') : null });

/** What the card was doing, for the JSON: the level and why, nothing else. */
const cardJson = (note: CardNote | null | undefined) => (note ? { level: note.level, reasons: note.reasons, apps: note.apps } : null);

/**
 * --measure --json: the measures, each tier's stamp and points. The stamp
 * carries what must match for two results to be compared, and nothing about
 * who ran it: no host name, no file paths, no prompts or answers.
 */
export function toMeasureJson(report: MeasureReport, hardware: FitHardware, version: string) {
  const headline = headlineOf(report);
  return {
    tool: 'rigmatch-fit',
    version,
    mode: 'measure',
    hardware: hardwareJson(hardware),
    workload: workloadJson(),
    reference: RIG_REFERENCE_MACHINE,
    tiers: report.lines.map((line) => {
      const base = { tier: line.tier.id, model: line.tier.model, status: line.status };
      switch (line.status) {
        case 'measured': return {
          ...base, ...measureJson(line.measure, line.gpuShare), ...pointsJson(line.points), band: line.band.id,
          estimatedTps: line.estimateTps, belowEstimate: farBelowEstimate(line.measure, line.estimateTps), stamp: line.stamp,
        };
        case 'missing': return { ...base, command: line.command, sizeGb: line.tier.sizeGb };
        case 'skipped': return base;
        default: return { ...base, message: line.message };
      }
    }),
    headline: headline ? { tier: headline.tier.id, ...pointsJson(headline.points), writingTps: round(headline.measure.decodeTps), band: headline.band.id } : null,
    stopped: report.stopped,
    busy: report.busy,
    contention: { before: cardJson(report.card?.before), after: cardJson(report.card?.after) },
  };
}

/** --measure <model> --json. */
export function toModelJson(report: ModelReport, hardware: FitHardware, version: string) {
  const base = { tool: 'rigmatch-fit', version, mode: 'measure-model', hardware: hardwareJson(hardware), workload: workloadJson(), model: report.model, tier: report.tier?.id ?? null, estimatedTps: report.estimateTps, status: report.status };
  if (report.status === 'measured') {
    return {
      ...base, ...measureJson(report.measure, report.gpuShare), ...pointsJson(report.points), band: report.band.id,
      belowEstimate: farBelowEstimate(report.measure, report.estimateTps), stamp: report.stamp,
      contention: { before: cardJson(report.card?.before), after: cardJson(report.card?.after) },
    };
  }
  if (report.status === 'missing') return { ...base, command: report.command };
  return { ...base, message: report.message };
}
