// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The command-line fit check, minus everything that touches the machine.
 *
 * Which models, graded how, printed how: rigmatch-fit.ts detects the hardware
 * and asks Ollama what is installed, then hands both to these. Kept apart so
 * the tests can feed in a 12 GB card and read the table back without a GPU.
 *
 * The models are the catalog snapshot the app ships for when it is offline
 * (electron/ollamaCapabilities.json, taken at release time), and every grade
 * comes from src/lib/modelGrade.ts, the module the Models list uses. An
 * installed model is graded on what Ollama reports for it, as the app does
 * (mergeModelRows), so the two agree about the models you have.
 */

import snapshot from '../electron/ollamaCapabilities.json' with { type: 'json' };
import ollamaCatalog from '../electron/ollamaCatalog.cjs';
import { gradeModel, mixtureSpillFit, pullCommand, type FitGrade, type GradeRow } from '../src/lib/modelGrade.ts';
import { canGenerateText, isEmbeddingModel } from '../src/lib/modelCatalog.ts';
import { isSpecialistModel } from '../src/lib/chooseLineup.ts';
import { NON_CHAT_NOTE, NON_CHAT_TAG, nonChatKind, type NonChatKind } from '../src/lib/modelKind.ts';
import { gpuDriverMessage, type GpuDriverProblem } from '../src/lib/gpuDriver.ts';

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
  /** --vram 0: there is no graphics card, as opposed to one nobody could read. */
  noGpu?: boolean;
  driverProblem?: GpuDriverProblem | null;
};

/** What Ollama's /api/tags lists: sizes in GiB, as the app reads them. */
export type InstalledModel = {
  name: string; sizeGb: number; params?: string;
  /** One of Ollama's cloud models: listed here, but it runs on Ollama's servers, not on this computer. */
  remote?: boolean;
};

/**
 * Where Ollama listens, read from OLLAMA_HOST the way Ollama's own client
 * reads it (envconfig.Host): with no scheme the port defaults to 11434, with
 * http:// to 80 and with https:// to 443, and a path is kept, so a proxy at
 * https://example.com/ollama works. "0.0.0.0" means this machine.
 */
export function ollamaUrl(raw = process.env.OLLAMA_HOST): string {
  const value = raw?.trim() || '127.0.0.1:11434';
  const scheme = value.match(/^(https?):\/\//i)?.[1].toLowerCase();
  const rest = scheme ? value.slice(scheme.length + 3) : value;
  const slash = rest.indexOf('/');
  const hostPort = slash < 0 ? rest : rest.slice(0, slash);
  const path = slash < 0 ? '' : rest.slice(slash).replace(/\/+$/, '');
  const withPort = hostPort.match(/^(\[[^\]]+\]|[^:]+):(\d+)$/);
  const host = (withPort ? withPort[1] : hostPort) || '127.0.0.1';
  const port = withPort ? withPort[2] : scheme === 'https' ? '443' : scheme === 'http' ? '80' : '11434';
  return `${scheme ?? 'http'}://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}${path}`;
}

/** A catalog size, with the other names Ollama lists it under. */
export type CatalogRow = GradeRow & { aliases?: string[] };

export type RankedModel = {
  row: CatalogRow;
  grade: FitGrade;
  installed: boolean;
  /** `ollama run` for a model you have, under the name Ollama lists it by; a download command otherwise. */
  command: string;
  /** Set for a model that does not chat (a decision model): it is listed, but not graded as one. */
  kind: NonChatKind | null;
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
 * ollama.com's sizes are decimal GB (5.2 GB is 5.2 billion bytes), while
 * graphics memory and Ollama's own sizes for installed models are GiB. Graded
 * in the wrong unit, every download looked 7% bigger than it is.
 */
const toGiB = (decimalGb: number) => Math.round(((decimalGb * 1e9) / 1024 ** 3) * 10) / 10;

/**
 * One row per downloadable size in the snapshot.
 *
 * `latest` is kept only where no plain size weighs the same, since it is
 * usually one of them under another name; that size then answers to
 * family:latest as well, which is what Ollama lists after `ollama pull gemma3`.
 * Embedding models, image makers and speech models are left out: the question
 * here is which model to chat with. Decision models (kev, d3) stay in, marked,
 * for --all and --installed: they are real models, just not chat ones.
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
      // "Latest" and "Unknown" are labels, not sizes; the grade reads the download instead.
      const params = ollamaCatalog.inferParamsFromTag(tag);
      const row: CatalogRow = {
        name, displayName: name, params: /^\d/.test(params) ? params : '', sizeGb: toGiB(size.sizeGb ?? 0), capabilities,
        description: facts.description, ...(twin && twin[0] === tag ? { aliases: [`${family}:latest`] } : {}),
      };
      if (isListed(row)) rows.push(row);
    }
  }
  return rows;
}

/** Worth a row in the list: a chat model, or a decision model shown as what it is. */
function isListed(row: GradeRow): boolean {
  const kind = nonChatKind(row);
  if (kind) return kind === 'decision';
  return canGenerateText(row) && !isEmbeddingModel(row.name);
}

/**
 * Grade every model, best first: by points, then the bigger model, then the
 * name. An installed model is graded on Ollama's own size and parameter count
 * for it, and installed models the snapshot does not know (a Hugging Face
 * import, a custom build) are graded too. A mixture of experts too big for
 * graphics memory gets the app's "RAM assist" fit where it would still run at
 * a usable speed (mixtureSpillFit).
 */
export function rankModels(
  catalog: CatalogRow[],
  hardware: Pick<FitHardware, 'vramGb' | 'unifiedMemory'> & Partial<Pick<FitHardware, 'gpu' | 'ramGb' | 'noGpu'>>,
  { installed = null, provider = 'ollama' }: { installed?: InstalledModel[] | null; provider?: Provider } = {},
): RankedModel[] {
  const byName = new Map((installed ?? []).map((model) => [model.name, model]));
  const known = new Set(catalog.flatMap((row) => [row.name, ...(row.aliases ?? [])]));
  const extra: CatalogRow[] = (installed ?? [])
    .filter((model) => !known.has(model.name))
    .map((model) => ({ name: model.name, displayName: model.name, params: model.params ?? '', sizeGb: model.sizeGb || null }))
    .filter(isListed);
  return [...catalog, ...extra]
    .map((listed) => {
      const have = [listed.name, ...(listed.aliases ?? [])].map((name) => byName.get(name)).find(Boolean);
      const merged: CatalogRow = have
        ? { ...listed, sizeGb: have.sizeGb || listed.sizeGb, params: have.params || listed.params }
        : listed;
      const spill = mixtureSpillFit(merged, hardware);
      const row = spill ? { ...merged, fitOverride: spill } : merged;
      return {
        row,
        grade: gradeModel(row, hardware),
        installed: Boolean(have),
        command: have && provider === 'ollama' ? `ollama run ${have.name}` : pullCommand(row.name, provider),
        kind: nonChatKind(row),
      };
    })
    // Models that do not chat go after the ones that do: their points are the
    // fit alone, and a 600M decision model would otherwise outrank a chat model.
    .sort((a, b) => Number(Boolean(a.kind)) - Number(Boolean(b.kind))
      || (b.grade.points ?? -1) - (a.grade.points ?? -1)
      || (b.row.sizeGb ?? 0) - (a.row.sizeGb ?? 0)
      || a.row.name.localeCompare(b.row.name));
}

/**
 * Families built for one job rather than for talking to: code completion and
 * coding agents, SQL, maths, function calling, classification and decision
 * models, document reading and extraction, fact-checking, medicine and
 * translation. Read from the family name, or from its page's description
 * where the name does not say ("fast classification"). The safety classifiers
 * and OCR models Simple Mode leaves out are caught by isSpecialistModel, and
 * the models that do not chat at all (decision, speech) by nonChatKind, the
 * definition the app shares.
 */
const NICHE_FAMILY = /code|coder|devstral|sql|math|nexusraven|firefunction|tool-use|medllama|medgemma|meditron|translategemma/i;
const NICHE_DESCRIPTION = new RegExp([
  'code completion', 'text-to-sql', 'function calling', String.raw`\bfor (?:agentic )?coding\b`, 'agentic software engineer',
  'classification', 'document understanding', 'information extraction',
  'fact-checking', 'to markdown', 'semantic search', 'detect risks', 'safety reasoning',
].join('|'), 'i');

/** A model for conversation in general, as opposed to one job (NICHE_FAMILY) or none at all (nonChatKind). */
export function isGeneralModel(row: GradeRow): boolean {
  const name = row.displayName ?? row.name;
  return !nonChatKind(row) && !isSpecialistModel(name) && !NICHE_FAMILY.test(name.split(':')[0]) && !NICHE_DESCRIPTION.test(row.description ?? '');
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

/** Words to lines no wider than the terminal. Unlimited when it is not a terminal. */
export function wrap(text: string, columns: number | undefined): string[] {
  if (!columns || text.length <= columns) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > columns) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return [...lines, line];
}

/**
 * The show's sign, bulbs and all, for people reading in a terminal. Plain
 * ASCII like everything else here, and 41 columns wide.
 */
export const MARQUEE_BORDER = `${'o-*-'.repeat(10)}o`;

/** The sign with a show's name and its question: "fit check", or the speed test's. */
export function marquee(title: string, question: string): string[] {
  return [
    MARQUEE_BORDER,
    ...[`R I G M A T C H     ${title}`, question].map((text) => `|   ${pad(text, MARQUEE_BORDER.length - 5)}|`),
    MARQUEE_BORDER,
  ];
}

const MARQUEE = marquee('fit check', 'Who will your PC go home with?');

/**
 * The card line, in plain ASCII. Windows PowerShell 5.1 reads a captured
 * program's output in the console's code page, and the "·" these used turned
 * into "┬╖" there.
 */
export function describeHardware(hardware: FitHardware): string {
  const memory = hardware.unifiedMemory
    ? `${gb(hardware.vramGb)} shared memory`
    : hardware.vramGb > 0 ? `${gb(hardware.vramGb)} graphics memory` : hardware.noGpu ? null : 'no graphics memory found';
  return [hardware.gpu, memory, `${gb(hardware.ramGb)} system memory`].filter(Boolean).join(', ');
}

/**
 * The table people read: ASCII only, and no wider than the terminal. When it
 * would wrap, the command column goes first (it repeats the model's name)
 * with one line saying how to get any of them, then the Fit column.
 *
 * `show` adds the game-show dressing, the marquee and a closing Top Match
 * line, for a terminal. Output piped to a file or a script stays plain.
 */
export function formatTable(
  models: RankedModel[],
  hardware: FitHardware,
  { provider = 'ollama', ollamaReachable = false, all = false, installedOnly = false, limit = 20, columns, show = false }: {
    provider?: Provider; ollamaReachable?: boolean; all?: boolean; installedOnly?: boolean; limit?: number; columns?: number; show?: boolean;
  } = {},
): string {
  const running = models.filter(inDefaultList);
  const installed = models.filter((model) => model.installed);
  const shown = installedOnly ? installed : all ? models : running.slice(0, limit);
  const markedHere = shown.filter((model) => model.installed).length;
  // A terminal too narrow for the sign gets the plain title.
  const marquee = show && (!columns || columns >= MARQUEE_BORDER.length);
  const prose: string[] = [describeHardware(hardware)];
  if (hardware.source === 'flag') prose.push('Graded for the graphics memory you gave with --vram, not this computer\'s.');
  if (hardware.driverProblem) prose.push(gpuDriverMessage(hardware.driverProblem));
  if (provider === 'lm-studio') {
    prose.push('LM Studio names models its own way, so each command is a search: lms get shows what it found before downloading.');
  } else {
    // Installed models are often not among the best 20 for this PC, so the
    // line says how many of them the list actually shows.
    const count = installed.length;
    prose.push(!ollamaReachable
      ? `Ollama is not running here, so ${installedOnly ? 'there is no telling what is installed' : 'installed models are not marked'}.`
      : count === 0 ? 'Ollama is running, with none of these installed yet.'
        : installedOnly ? `Ollama is running: your ${plural(count, 'installed model')}, best first.`
          : markedHere === count ? `Ollama is running: ${count} of these ${count === 1 ? 'is' : 'are'} installed, marked *.`
            : markedHere === 0 ? `Ollama is running with ${plural(count, 'model')} installed, none of them in this list. --installed lists them.`
              : `Ollama is running with ${plural(count, 'model')} installed: ${markedHere} in this list, marked *. --installed lists all ${count}.`);
  }
  const lines = [...(marquee ? MARQUEE : ['RigMatch fit check']), ...prose.flatMap((text) => wrap(text, columns))];
  lines.push('');

  const header = ['Grade', 'Model', 'Size', 'Speed', 'Fit', provider === 'lm-studio' ? 'Search in LM Studio' : 'Command'];
  // A model that does not chat has no letter: its grade would only be its fit.
  const cells = shown.map((model) => [
    model.kind ? '-' : model.grade.letter,
    `${model.row.name}${model.installed ? ' *' : ''}`,
    model.row.sizeGb ? gb(model.row.sizeGb) : '?',
    model.grade.tokensPerSecond ? `~${Math.round(model.grade.tokensPerSecond)} tok/s` : '-',
    model.kind ? `${NON_CHAT_TAG[model.kind]} (${fitLabel(model.grade)})` : fitLabel(model.grade),
    model.command,
  ]);
  const widthOf = (keep: number[]) => keep.reduce((sum, column) => sum + Math.max(header[column].length, ...cells.map((row) => row[column].length)), 0)
    + 2 * (keep.length - 1);
  const fits = (keep: number[]) => !columns || widthOf(keep) <= columns;
  const keep = [[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4], [0, 1, 2, 3]].find(fits) ?? [0, 1, 2, 3];
  const widths = keep.map((column) => Math.max(header[column].length, ...cells.map((row) => row[column].length)));
  const render = (row: string[]) => keep.map((column, at) => (at === keep.length - 1 ? row[column] : pad(row[column], widths[at]))).join('  ').trimEnd();
  if (shown.length > 0) lines.push(render(header), ...cells.map(render));
  else lines.push(installedOnly ? 'No installed models to list.' : 'Nothing in the catalog runs on this computer.');

  const footer: string[] = [];
  if (shown.length > 0 && !keep.includes(5)) {
    footer.push(provider === 'lm-studio' ? 'Get one with: lms get <model>' : 'Get one with: ollama pull <model>. Run one you have with: ollama run <model>');
  }
  footer.push(installedOnly || all
    ? `${installedOnly ? plural(shown.length, 'installed model') : `All ${models.length} models`}. Fit grade A is the best pick for this computer, F will not fit.`
    : `The best ${shown.length} of ${running.length} models that run here. --all lists every model, --json prints them for scripts.`);
  // One line per kind shown, in the app's own words.
  for (const kind of new Set(shown.flatMap((model) => (model.kind ? [model.kind] : [])))) {
    footer.push(`${NON_CHAT_NOTE[kind]} It has no Fit grade; the Fit column is whether it fits.`);
  }
  footer.push('Speeds are estimates from the size and the card. RigMatch measures the real ones: https://github.com/DaveEuson/RigMatch');
  lines.push('', ...footer.flatMap((text) => wrap(text, columns)));
  // The best model that runs here, whichever list is showing.
  const top = running[0];
  if (show && top) {
    const speed = top.grade.tokensPerSecond ? `, ~${Math.round(top.grade.tokensPerSecond)} tok/s` : '';
    const hello = provider === 'lm-studio' ? `Find it with: lms get ${top.row.name}` : `Say hi: ollama run ${top.row.name}`;
    lines.push('', ...wrap(`Tonight's Top Match: ${top.row.name} (${top.grade.letter}${speed}). ${hello}`, columns));
  }
  return lines.join('\n');
}

/** What --json prints: the models, graded, best first, in ASCII like the table. */
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
    models: models.map(({ row, grade, installed, command, kind }) => ({
      model: row.name,
      grade: kind ? null : grade.letter,
      points: kind ? null : grade.points,
      verdict: grade.verdict,
      fit: fitLabel(grade),
      sizeGb: row.sizeGb,
      params: row.params || null,
      spareGb: grade.spareGb,
      tokensPerSecond: grade.tokensPerSecond,
      speedSource: grade.speedSource,
      installed,
      command,
      why: kind ? NON_CHAT_NOTE[kind] : grade.reasons.join('; '),
      // "chat", or the kind of model that does not (decision): it has a fit but no grade or points.
      kind: kind ?? 'chat',
    })),
  };
}
