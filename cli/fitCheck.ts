// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The command-line fit check, minus everything that touches the machine.
 *
 * Which models, graded how, printed how: rigmatch-fit.ts detects the hardware
 * and asks Ollama what is installed, then hands both to these. Kept apart so
 * the tests can feed in a 12 GB card and read the table back without a GPU.
 *
 * The models are the catalog snapshot the app ships for when it is offline
 * (electron/ollamaCapabilities.json, refreshed at release time), and every
 * grade comes from src/lib/modelGrade.ts — the same module the Models list
 * uses, so the terminal and the app cannot disagree about a model.
 */

import snapshot from '../electron/ollamaCapabilities.json' with { type: 'json' };
import ollamaCatalog from '../electron/ollamaCatalog.cjs';
import { gradeModel, pullCommand, type FitGrade, type GradeRow } from '../src/lib/modelGrade.ts';
import { canGenerateText, isEmbeddingModel } from '../src/lib/modelCatalog.ts';
import { isSpecialistModel } from '../src/lib/chooseLineup.ts';

export type Provider = 'ollama' | 'lm-studio';

export type FitHardware = {
  gpu: string;
  vramGb: number;
  unifiedMemory: boolean;
  ramGb: number;
  platform: string;
  arch: string;
  /** 'detected', or 'flag' when --vram replaced the card. */
  source: 'detected' | 'flag';
  driverProblem?: string | null;
};

/** What Ollama's /api/tags lists, or null when nothing answered. */
export type InstalledModel = { name: string; sizeGb: number; params?: string };

export type RankedModel = {
  row: GradeRow;
  grade: FitGrade;
  installed: boolean;
  command: string;
};

type SnapshotSize = { inputs?: string[]; sizeGb?: number; cloudOnly?: boolean };
type SnapshotFamily = { badges: string[]; description?: string; sizes: Record<string, SnapshotSize> };

/** The catalog's own reading of a family page (electron/ollamaCatalog.cjs), typed for this file. */
const capabilitiesFor = ollamaCatalog.ollamaCapabilitiesFor as (facts: {
  name: string; tag: string; inputs?: string[]; badges?: string[]; description?: string;
}) => string[] | null;

/** A plain size: "8b", "0.6b", "135m", "e4b", "8x7b" — not a quantization, a cloud tag or an MLX build. */
const SIZE_TAG = /^(?:\d+(?:\.\d+)?[mb]|e\d+(?:\.\d+)?b|\d+x\d+(?:\.\d+)?b)$/i;

/**
 * One row per downloadable size in the snapshot.
 *
 * `latest` is kept only where no plain size weighs the same, since it is
 * usually one of them under another name. Embedding models and image makers
 * are left out: the question here is which model to chat with.
 */
export function catalogRows(families: Record<string, SnapshotFamily> = snapshot.families as Record<string, SnapshotFamily>): GradeRow[] {
  const rows: GradeRow[] = [];
  for (const [family, facts] of Object.entries(families)) {
    const sizes = Object.entries(facts.sizes ?? {}).filter(([, size]) => !size.cloudOnly && (size.sizeGb ?? 0) > 0);
    const plain = sizes.filter(([tag]) => SIZE_TAG.test(tag));
    const latest = sizes.find(([tag]) => tag === 'latest');
    const kept = latest && !plain.some(([, size]) => size.sizeGb === latest[1].sizeGb) ? [...plain, latest] : plain;
    for (const [tag, size] of kept) {
      const name = `${family}:${tag}`;
      const capabilities = capabilitiesFor({
        name: family, tag, inputs: size.inputs, badges: facts.badges, description: facts.description,
      }) ?? undefined;
      const row: GradeRow = { name, displayName: name, params: ollamaCatalog.inferParamsFromTag(tag), sizeGb: size.sizeGb ?? null, capabilities };
      if (isChatModel(row)) rows.push(row);
    }
  }
  return rows;
}

function isChatModel(row: GradeRow): boolean {
  return canGenerateText(row) && !isEmbeddingModel(row.name);
}

/**
 * Grade every model and sort best first: by points, then the bigger model,
 * then the name. Installed models Ollama lists that the snapshot does not
 * know (a Hugging Face import, a custom build) are graded too.
 */
export function rankModels(
  catalog: GradeRow[],
  hardware: Pick<FitHardware, 'vramGb' | 'unifiedMemory'>,
  { installed = null, provider = 'ollama' }: { installed?: InstalledModel[] | null; provider?: Provider } = {},
): RankedModel[] {
  const have = new Set((installed ?? []).map((model) => model.name));
  const known = new Set(catalog.map((row) => row.name));
  const extra: GradeRow[] = (installed ?? [])
    .filter((model) => !known.has(model.name))
    .map((model) => ({ name: model.name, displayName: model.name, params: model.params ?? '', sizeGb: model.sizeGb || null }))
    .filter(isChatModel);
  return [...catalog, ...extra]
    .map((row) => ({
      row,
      grade: gradeModel(row, hardware),
      installed: have.has(row.name),
      command: pullCommand(row.name, provider),
    }))
    .sort((a, b) => (b.grade.points ?? -1) - (a.grade.points ?? -1)
      || (b.row.sizeGb ?? 0) - (a.row.sizeGb ?? 0)
      || a.row.name.localeCompare(b.row.name));
}

/**
 * The models worth showing by default: anything that runs here and talks.
 * Safety classifiers and document readers are left to --all, as Simple Mode
 * leaves them out of a newcomer's lineup (isSpecialistModel).
 */
export function runsHere(model: RankedModel): boolean {
  return model.grade.letter !== 'F' && model.grade.letter !== '?' && !isSpecialistModel(model.row.name);
}

const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - text.length));
const gb = (value: number) => `${Math.round(value * 10) / 10} GB`;

/** "Sweet spot", not "Good fit · 9.3 GB": the size has its own column. */
const fitLabel = (grade: FitGrade) => grade.fit.label.replace(/\s*·.*$/, '');

export function describeHardware(hardware: FitHardware): string {
  const memory = hardware.unifiedMemory
    ? `${gb(hardware.vramGb)} shared memory`
    : hardware.vramGb > 0 ? `${gb(hardware.vramGb)} graphics memory` : 'no graphics memory found';
  return `${hardware.gpu} · ${memory} · ${gb(hardware.ramGb)} system memory`;
}

/**
 * The table people read. Plain ASCII, so a Windows console on an old code page
 * prints it as cleanly as a Mac terminal does.
 */
export function formatTable(
  models: RankedModel[],
  hardware: FitHardware,
  { provider = 'ollama', ollamaReachable = false, all = false, limit = 20 }: { provider?: Provider; ollamaReachable?: boolean; all?: boolean; limit?: number } = {},
): string {
  const running = models.filter(runsHere);
  const shown = all ? models : running.slice(0, limit);
  const installedCount = models.filter((model) => model.installed).length;
  const lines = ['RigMatch fit check', describeHardware(hardware)];
  if (hardware.source === 'flag') lines.push('Graded for the graphics memory you gave with --vram, not this computer\'s.');
  if (hardware.driverProblem) {
    lines.push('Your NVIDIA card did not answer, so models are sized as if it had no graphics memory. Repair or update its driver, then run this again.');
  }
  if (provider === 'lm-studio') {
    lines.push('LM Studio names models its own way, so each command is a search: lms get shows what it found before downloading.');
  } else {
    lines.push(!ollamaReachable ? 'Ollama is not running here, so installed models are not marked.'
      : installedCount > 0 ? `Ollama is running: ${installedCount} of these are installed, marked *.`
        : 'Ollama is running, with none of these installed yet.');
  }
  lines.push('');

  const header = ['Grade', 'Model', 'Size', 'Speed', 'Fit', provider === 'lm-studio' ? 'Search in LM Studio' : 'Get it'];
  const cells = shown.map((model) => [
    model.grade.letter,
    `${model.row.name}${model.installed ? ' *' : ''}`,
    model.row.sizeGb ? gb(model.row.sizeGb) : '?',
    model.grade.tokensPerSecond ? `~${Math.round(model.grade.tokensPerSecond)} tok/s` : '-',
    fitLabel(model.grade),
    model.command,
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...cells.map((row) => row[column].length)));
  const render = (row: string[]) => row.map((cell, column) => (column === row.length - 1 ? cell : pad(cell, widths[column]))).join('  ').trimEnd();
  lines.push(render(header), ...cells.map(render));
  if (shown.length === 0) lines.push('Nothing in the catalog runs on this computer.');

  lines.push('');
  lines.push(all
    ? `All ${models.length} models. Fit grade A is the best pick for this computer, F will not fit.`
    : `The best ${shown.length} of ${running.length} models that run here. --all lists every model, --json prints them for scripts.`);
  lines.push('Speeds are estimates from the size and the card. RigMatch measures the real ones: https://github.com/DaveEuson/RigMatch');
  return lines.join('\n');
}

/** What --json prints: every model, graded, best first. */
export function toJson(
  models: RankedModel[],
  hardware: FitHardware,
  { provider = 'ollama', ollamaReachable = false, version = '0.0.0' }: { provider?: Provider; ollamaReachable?: boolean; version?: string } = {},
) {
  return {
    tool: 'rigmatch-fit',
    version,
    hardware: {
      gpu: hardware.gpu,
      vramGb: hardware.vramGb,
      unifiedMemory: hardware.unifiedMemory,
      ramGb: hardware.ramGb,
      platform: hardware.platform,
      arch: hardware.arch,
      source: hardware.source,
      ...(hardware.driverProblem ? { driverProblem: hardware.driverProblem } : {}),
    },
    provider,
    ollamaReachable: provider === 'ollama' ? ollamaReachable : null,
    models: models.map(({ row, grade, installed, command }) => ({
      model: row.name,
      grade: grade.letter,
      points: grade.points,
      verdict: grade.verdict,
      fit: fitLabel(grade),
      sizeGb: row.sizeGb,
      params: row.params || null,
      spareGb: grade.spareGb,
      tokensPerSecond: grade.tokensPerSecond,
      speedSource: grade.speedSource,
      installed,
      command,
      why: grade.summary,
    })),
  };
}
