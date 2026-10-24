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

/** A catalog size, with the other names Ollama lists it under. */
export type CatalogRow = GradeRow & { aliases?: string[] };

export type RankedModel = {
  row: CatalogRow;
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
 * usually one of them under another name; that size then answers to
 * family:latest as well, which is what Ollama lists after `ollama pull gemma3`.
 * Embedding models and image makers are left out: the question here is which
 * model to chat with.
 */
export function catalogRows(families: Record<string, SnapshotFamily> = snapshot.families as Record<string, SnapshotFamily>): CatalogRow[] {
  const rows: CatalogRow[] = [];
  for (const [family, facts] of Object.entries(families)) {
    const sizes = Object.entries(facts.sizes ?? {}).filter(([, size]) => !size.cloudOnly && (size.sizeGb ?? 0) > 0);
    const plain = sizes.filter(([tag]) => SIZE_TAG.test(tag));
    const latest = sizes.find(([tag]) => tag === 'latest');
    const twin = latest && plain.find(([, size]) => size.sizeGb === latest[1].sizeGb);
    const kept = latest && !twin ? [...plain, latest] : plain;
    for (const [tag, size] of kept) {
      const name = `${family}:${tag}`;
      const capabilities = capabilitiesFor({
        name: family, tag, inputs: size.inputs, badges: facts.badges, description: facts.description,
      }) ?? undefined;
      const row: CatalogRow = {
        name, displayName: name, params: ollamaCatalog.inferParamsFromTag(tag), sizeGb: size.sizeGb ?? null, capabilities, description: facts.description,
        ...(twin && twin[0] === tag ? { aliases: [`${family}:latest`] } : {}),
      };
      if (isChatModel(row)) rows.push(row);
    }
  }
  return rows;
}

function isChatModel(row: GradeRow): boolean {
  return canGenerateText(row) && !isEmbeddingModel(row.name);
}

/**
 * Grade every model and sort best first: by letter, then by what it can do,
 * then by points and size. Installed models Ollama lists that the snapshot
 * does not know (a Hugging Face import, a custom build) are graded too.
 */
export function rankModels(
  catalog: CatalogRow[],
  hardware: Pick<FitHardware, 'vramGb' | 'unifiedMemory'>,
  { installed = null, provider = 'ollama' }: { installed?: InstalledModel[] | null; provider?: Provider } = {},
): RankedModel[] {
  const have = new Set((installed ?? []).map((model) => model.name));
  const known = new Set(catalog.flatMap((row) => [row.name, ...(row.aliases ?? [])]));
  const extra: CatalogRow[] = (installed ?? [])
    .filter((model) => !known.has(model.name))
    .map((model) => ({ name: model.name, displayName: model.name, params: model.params ?? '', sizeGb: model.sizeGb || null }))
    .filter(isChatModel);
  return [...catalog, ...extra]
    .map((row) => ({
      row,
      grade: gradeModel(row, hardware),
      installed: have.has(row.name) || (row.aliases ?? []).some((alias) => have.has(alias)),
      command: pullCommand(row.name, provider),
    }))
    // Within a letter, models that can do more come first. The snapshot has
    // no pull counts or release dates, and tool use, thinking and images are
    // the nearest honest sign of a current model: without this, a 12 GB card's
    // A list opened with falcon2, yi and glm4 on a size tie-break.
    .sort((a, b) => GRADE_ORDER.indexOf(a.grade.letter) - GRADE_ORDER.indexOf(b.grade.letter)
      || abilities(b.row) - abilities(a.row)
      || (b.grade.points ?? -1) - (a.grade.points ?? -1)
      || (b.row.sizeGb ?? 0) - (a.row.sizeGb ?? 0)
      || a.row.name.localeCompare(b.row.name));
}

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F', '?'];
const abilities = (row: GradeRow) => (row.capabilities ?? []).filter((c) => ['tools', 'thinking', 'vision', 'audio'].includes(c)).length;

/**
 * Families built for one job rather than for talking to: code completion and
 * coding agents, SQL, maths, function calling, medicine and translation. Read
 * from the family name, or from its page's description where the name does
 * not say ("for agentic coding"). The safety classifiers and document readers
 * Simple Mode leaves out are caught by isSpecialistModel.
 */
const NICHE_FAMILY = /code|coder|devstral|sql|math|nexusraven|firefunction|tool-use|medllama|medgemma|meditron|translategemma/i;
const NICHE_DESCRIPTION = /code completion|text-to-sql|function calling|\bfor (?:agentic )?coding\b/i;

/** A model for conversation in general, as opposed to one job (NICHE_FAMILY). */
export function isGeneralModel(row: GradeRow): boolean {
  const name = row.displayName ?? row.name;
  return !isSpecialistModel(name) && !NICHE_FAMILY.test(name.split(':')[0]) && !NICHE_DESCRIPTION.test(row.description ?? '');
}

/**
 * The models the default list draws from: general ones that run here. The
 * question it answers is "which model should I chat with"; --all has the
 * rest. Without this the top of a 12 GB card's list was codegeex4, yi-coder
 * and nexusraven, and with no GPU it was starcoder2 and duckdb-nsql.
 */
export function inDefaultList(model: RankedModel): boolean {
  return model.grade.letter !== 'F' && model.grade.letter !== '?' && isGeneralModel(model.row);
}

const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - text.length));
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
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
  { provider = 'ollama', ollamaReachable = false, all = false, installedOnly = false, limit = 20 }: {
    provider?: Provider; ollamaReachable?: boolean; all?: boolean; installedOnly?: boolean; limit?: number;
  } = {},
): string {
  const running = models.filter(inDefaultList);
  const installed = models.filter((model) => model.installed);
  const shown = installedOnly ? installed : all ? models : running.slice(0, limit);
  const markedHere = shown.filter((model) => model.installed).length;
  const lines = ['RigMatch fit check', describeHardware(hardware)];
  if (hardware.source === 'flag') lines.push('Graded for the graphics memory you gave with --vram, not this computer\'s.');
  if (hardware.driverProblem) {
    lines.push('Your NVIDIA card did not answer, so models are sized as if it had no graphics memory. Repair or update its driver, then run this again.');
  }
  if (provider === 'lm-studio') {
    lines.push('LM Studio names models its own way, so each command is a search: lms get shows what it found before downloading.');
  } else {
    // Installed models are often not among the best 20 for this PC, so the
    // line says how many of them the list actually shows.
    const count = installed.length;
    lines.push(!ollamaReachable
      ? `Ollama is not running here, so ${installedOnly ? 'there is no telling what is installed' : 'installed models are not marked'}.`
      : count === 0 ? 'Ollama is running, with none of these installed yet.'
        : installedOnly ? `Ollama is running: your ${plural(count, 'installed model')}, best first.`
          : markedHere === count ? `Ollama is running: ${count} of these ${count === 1 ? 'is' : 'are'} installed, marked *.`
            : markedHere === 0 ? `Ollama is running with ${plural(count, 'model')} installed, none of them in this list. --installed lists them.`
              : `Ollama is running with ${plural(count, 'model')} installed: ${markedHere} in this list, marked *. --installed lists all ${count}.`);
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
  if (shown.length > 0) lines.push(render(header), ...cells.map(render));
  else lines.push(installedOnly ? 'No installed models to list.' : 'Nothing in the catalog runs on this computer.');

  lines.push('');
  lines.push(installedOnly || all
    ? `${installedOnly ? plural(shown.length, 'installed model') : `All ${models.length} models`}. Fit grade A is the best pick for this computer, F will not fit.`
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
