// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Pure parsing helpers for the Ollama library catalog scrape. Extracted from
 * main.cjs so they can be unit-tested without booting Electron. No Electron,
 * filesystem, or network access here — all functions are string-in / value-out.
 */

const OLLAMA_FAMILY_TAG_LIMIT = 18;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function getPlainText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '));
}

// Ollama's "x/" namespace hosts a handful of non-chat models (image/video
// generation) that live outside the regular /library catalog. Allow that one
// namespace prefix through; nothing else needs a slash.
function isValidOllamaName(name) {
  return /^(?:x\/)?[a-z0-9][a-z0-9._-]*$/i.test(String(name || ''));
}

// Ollama's "x/" namespace (e.g. ollama.com/x/flux2-klein) hosts image/video
// generation models outside the regular /library listing, so they need their
// own scrape. Trailing-slash paths like /x/<name>/tags are excluded because
// the character class stops at the closing quote.
function extractOllamaNamespaceModels(html) {
  const source = String(html || '');
  const results = [];
  const seen = new Set();
  const pattern = /href=["']\/x\/([a-zA-Z0-9._-]+)["']/gi;
  let match;
  while ((match = pattern.exec(source))) {
    const name = `x/${decodeURIComponentSafe(match[1])}`;
    if (!isValidOllamaName(name) || seen.has(name)) continue;
    seen.add(name);
    results.push({ name, pulls: null });
  }
  return results;
}

function isValidOllamaTag(tag) {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(String(tag || ''));
}

/** A row's size as ollama.com writes it: decimal GB, so 512MB is 0.5. */
function parseSizeToGb(detail) {
  const match = String(detail || '').match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase() === 'mb'
    ? Math.round((value / 1000) * 10) / 10
    : Math.round(value * 10) / 10;
}

/** Both ends of a row that lists two sizes ("6.6GB - 9.5GB"), smaller first; null for a row with one. */
function parseSizeRangeGb(detail) {
  const match = String(detail || '').match(/(\d+(?:\.\d+)?\s*(?:GB|MB))\s*-\s*(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
  if (!match) return null;
  const [low, high] = [parseSizeToGb(match[1]), parseSizeToGb(match[2])];
  return low && high && low < high ? [low, high] : null;
}

/** The listing rounds to two figures, so a 18.73 GB build is listed as "19GB". */
const LISTED_SIZE_SLACK_GB = 0.6;

/**
 * Which end of a two-size row each kind of computer downloads.
 *
 * A row lists two sizes when its tag holds two builds. Ollama gives an Apple
 * chip the MLX build and every other computer the GGUF one, and either can be
 * the bigger: gemma4:e4b is 6.6 GB as GGUF and 9.5 as MLX, gemma4:12b is 8.0
 * and 7.7. Reading the first figure for everyone listed gemma4:e4b 2.9 GB
 * small on a Mac, and gemma4:26b 2.7 GB small on a PC. The page does not say
 * which end is which, so, in order:
 *  - `ggufGb`, the GGUF build's own size where the caller has it (the snapshot
 *    script reads it from the registry), names its end, and the other is MLX;
 *  - `mlxGb`, the size of the tag's "-mlx" twin on the same page, names the MLX
 *    end when it equals one;
 *  - otherwise both get the bigger end: what fits at that size fits either way.
 *
 * `sizeGb` is what a computer other than a Mac downloads, `appleSizeGb` what an
 * Apple chip does.
 */
function buildSizesFromRange([low, high], { ggufGb = null, mlxGb = null } = {}) {
  if (ggufGb > 0 && Math.min(Math.abs(ggufGb - low), Math.abs(ggufGb - high)) <= LISTED_SIZE_SLACK_GB) {
    return Math.abs(ggufGb - low) <= Math.abs(ggufGb - high)
      ? { sizeGb: low, appleSizeGb: high }
      : { sizeGb: high, appleSizeGb: low };
  }
  if (mlxGb === low) return { sizeGb: high, appleSizeGb: low };
  if (mlxGb === high) return { sizeGb: low, appleSizeGb: high };
  return { sizeGb: high, appleSizeGb: high };
}

/**
 * ollama.com's sizes are decimal GB (5.2 GB is 5.2 billion bytes). Graphics
 * memory, free disk, download progress and Ollama's own sizes for installed
 * models are GiB, so a listed size is converted before anything shows or
 * compares it. Left as listed, every download looked 7% bigger than the copy
 * it turns into.
 */
function decimalGbToGiB(decimalGb) {
  return Math.round(((decimalGb * 1e9) / 1024 ** 3) * 10) / 10;
}

/**
 * Catalog rows with their listed sizes in GiB, each the size this kind of
 * computer downloads: `apple` picks a row's Apple-chip size where it has one
 * (buildSizesFromRange). Rows with no size keep none.
 */
function catalogSizesInGiB(entries, { apple = false } = {}) {
  return entries.map(({ appleSizeGb, ...entry }) => {
    const listed = apple && appleSizeGb > 0 ? appleSizeGb : entry.sizeGb;
    return listed > 0 ? { ...entry, sizeGb: decimalGbToGiB(listed) } : entry;
  });
}

/**
 * Total parameters of the expert-count tags. "8x7b" is eight 7B experts that
 * share their attention layers, 46.7B in all, not 7B (the first number the
 * plain pattern below would find) and not 56B. Unlisted ones are estimated
 * at 80% of the product, which is where Mixtral's two land.
 */
const EXPERT_TAG_TOTALS = { '8x7b': '47B', '8x22b': '141B', '16x17b': '109B', '128x17b': '400B' };

/**
 * The parameter count a tag names. Given the tag's download size (decimal GB),
 * a count the download outweighs by more than 8 bytes a parameter, twice full
 * precision, is not a parameter count: internlm2:1m is the 7B with a 1M-token
 * context, 4.5 GB, and was graded as a 1M-parameter toy.
 */
function inferParamsFromTag(tag, sizeGb) {
  const experts = String(tag || '').toLowerCase().match(/^(\d+)x(\d+(?:\.\d+)?)b/);
  if (experts) {
    return EXPERT_TAG_TOTALS[`${experts[1]}x${experts[2]}b`]
      ?? `${Math.round(Number(experts[1]) * Number(experts[2]) * 0.8)}B`;
  }
  const match = String(tag || '').match(/(\d+(?:\.\d+)?)(m|b)/i);
  if (!match) return tag === 'latest' ? 'Latest' : 'Unknown';
  const billions = Number(match[1]) / (match[2].toLowerCase() === 'm' ? 1000 : 1);
  // The listing rounds sizes to 0.1 GB, so a tiny model is given that much slack.
  if (sizeGb > billions * 8 + 0.1) return 'Unknown';
  return `${match[1]}${match[2].toUpperCase()}`;
}

function inferParamsFromModelName(model) {
  const match = String(model || '').match(/(?:^|[-_:])(\d+(?:\.\d+)?)(m|b)(?:[-_:]|$)/i);
  if (!match) return null;
  return `${match[1]}${match[2].toUpperCase()}`;
}

function sortOllamaFamilyRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.tag === 'latest') return -1;
    if (b.tag === 'latest') return 1;
    if (Boolean(a.sizeGb) !== Boolean(b.sizeGb)) return a.sizeGb ? -1 : 1;
    const sizeDelta = (a.sizeGb || Number.POSITIVE_INFINITY) - (b.sizeGb || Number.POSITIVE_INFINITY);
    if (sizeDelta !== 0) return sizeDelta;
    return a.tag.localeCompare(b.tag);
  });
}

// "decision" and "speech" are Ollama's own capability names (types/model/
// capability.go). d3, kev and the other decision families carry the first;
// no speech page has carried the second yet, so phonon is told apart by its
// description (src/lib/modelKind.ts).
const OLLAMA_BADGES = ['vision', 'tools', 'thinking', 'embedding', 'audio', 'cloud', 'decision', 'speech'];

/**
 * What a family page says about the whole family: the capability badges under
 * its name (rounded spans: vision, tools, thinking, embedding, audio, cloud,
 * decision, speech)
 * and its one-line description.
 *
 * This replaced /search?c=<capability>, which returned only the top twenty
 * per capability, and for c=audio ignored the filter and returned the newest
 * twenty models, none of which can hear.
 */
function parseOllamaFamilyFacts(html) {
  const source = String(html || '');
  const badges = [];
  for (const match of source.matchAll(/<span[^>]*class=["'][^"']*\brounded-md\b[^"']*["'][^>]*>\s*([a-z]+)\s*<\/span>/gi)) {
    const badge = match[1].toLowerCase();
    if (OLLAMA_BADGES.includes(badge) && !badges.includes(badge)) badges.push(badge);
  }
  const description = decodeHtml((source.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1] || '');
  return { badges, description };
}

/**
 * One size's row text: "3.3GB · 128K context window · Text, Image · 1 year ago",
 * "6.6GB - 9.5GB · …" when it has several quantizations, "- · 1M context
 * window · Text · …" when it only runs in Ollama's cloud.
 */
function parseOllamaRowFacts(detail) {
  const match = String(detail || '').match(/(?:^|\s)(-|\d+(?:\.\d+)?\s*[KMGT]?B(?:\s*-\s*\d+(?:\.\d+)?\s*[KMGT]?B)?)\s*·\s*(?:\d+(?:\.\d+)?[KM]?|-)\s+context window\s*·\s*([A-Za-z, ]+?)\s*·/);
  if (!match) return { inputs: null, cloudOnly: false };
  return {
    inputs: match[2].split(',').map((item) => item.trim().toLowerCase()).filter(Boolean),
    cloudOnly: match[1] === '-',
  };
}

/**
 * Sizes that hear, for families whose page badge says "audio" for all of them.
 * Ollama lists hearing per family; Gemma 4's own model card on its Ollama page
 * gives E2B and E4B "Text, Image, Audio" and the larger dense model "Text,
 * Image" with "No Audio", and gemma4:latest is the E4B. Without this, Listens
 * to audio offered gemma4:31b, which fails on the first clip.
 */
const HEARING_SIZES = {
  gemma4: /^(?:latest|e2b|e4b)(?:-|$)/i,
};

/**
 * What this size can do, in the words Ollama's /api/show uses for an installed
 * model (completion, vision, audio, tools, thinking, embedding, image), so a
 * row reads the same before and after download.
 *
 * Null when the page says nothing usable, which leaves the name rules to guess.
 */
function ollamaCapabilitiesFor({ name, tag, inputs, badges = [], description = '' }) {
  if (badges.includes('embedding')) return ['embedding'];
  // The x/ namespace is Ollama's experimental shelf: image makers, and the odd
  // model that is neither, so it is read from its description.
  if (/^x\//i.test(String(name))) {
    return /image[- ]generation|text-to-image|generat\w*\s+(?:an?\s+)?images?\b/i.test(description) ? ['image'] : null;
  }
  // A speech model returns audio, and a decision model returns a verdict
  // instead of a reply: neither "completes", so neither is given the word that
  // every chat filter looks for.
  if (badges.includes('speech')) return ['speech'];
  if (!inputs && badges.length === 0) return null;
  const capabilities = [badges.includes('decision') ? 'decision' : 'completion'];
  if (inputs ? inputs.includes('image') : badges.includes('vision')) capabilities.push('vision');
  const hearingSizes = HEARING_SIZES[String(name).toLowerCase()];
  if (badges.includes('audio') && (!hearingSizes || hearingSizes.test(String(tag)))) capabilities.push('audio');
  if (badges.includes('tools')) capabilities.push('tools');
  if (badges.includes('thinking')) capabilities.push('thinking');
  return capabilities;
}

/**
 * Every size linked on a family page, with what it accepts, unsorted.
 *
 * A row that lists two sizes keeps both in `sizeRangeGb` and is given the size
 * each kind of computer downloads (buildSizesFromRange): `sizeGb`, and
 * `appleSizeGb` where an Apple chip's differs. `ggufSizes` is the GGUF build's
 * size by tag, for a caller that has read it.
 */
function scanOllamaFamilyRows(name, source, ggufSizes = {}) {
  const rows = [];
  const byKey = new Map();
  // "x/" namespace models are served from /x/<name>, not /library/<name>.
  const pathPrefix = /^x\//i.test(name) ? name : `library/${name}`;
  const rowPattern = new RegExp(`href=["']/${escapeRegExp(pathPrefix)}:([^"'#?/<>\\s]+)["']`, 'gi');
  const matches = [...source.matchAll(rowPattern)];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const tag = decodeURIComponentSafe(decodeHtml(match[1]));
    if (!isValidOllamaTag(tag)) continue;
    const key = `${name}:${tag}`;

    // Scope the size lookup to THIS tag's own row: from just after its link to
    // the start of the next tag's link. The previous ±window bled into
    // neighboring rows, so a large tag could pick up a smaller tag's size
    // (e.g. a 30b tag reported as 2.8 GB — issue #6). Cap the window so a final
    // row with no following link doesn't scan the rest of the page.
    const rowStart = (match.index || 0) + match[0].length;
    const nextStart = i + 1 < matches.length ? (matches[i + 1].index ?? source.length) : source.length;
    const rowEnd = Math.min(nextStart, rowStart + 1400);
    const detail = getPlainText(source.slice(rowStart, rowEnd));
    const rowFacts = parseOllamaRowFacts(detail);

    // Each size is linked twice, once per layout; only one of them carries
    // the "· Text, Image ·" line, so a second sighting can fill it in.
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.inputs && rowFacts.inputs) {
        existing.inputs = rowFacts.inputs;
        existing.cloudOnly = rowFacts.cloudOnly;
      }
      continue;
    }

    const sizeGb = parseSizeToGb(detail);
    const sizeRangeGb = parseSizeRangeGb(detail);
    const row = {
      id: key,
      name,
      tag,
      params: inferParamsFromTag(tag, sizeGb),
      sizeGb,
      ...(sizeRangeGb ? { sizeRangeGb } : {}),
      pack: tag === 'latest' ? 'Live Latest' : 'Live Tag',
      source: 'Ollama library',
      live: true,
      inputs: rowFacts.inputs,
      cloudOnly: rowFacts.cloudOnly,
    };
    byKey.set(key, row);
    rows.push(row);
  }

  const ranged = rows.filter((row) => row.sizeRangeGb);
  const sameRange = (a, b) => a.sizeRangeGb[0] === b.sizeRangeGb[0] && a.sizeRangeGb[1] === b.sizeRangeGb[1];
  // "latest" has no "-mlx" twin of its own: it is one of the sizes under
  // another name, so it takes that size's answer.
  for (const row of [...ranged.filter((each) => each.tag !== 'latest'), ...ranged.filter((each) => each.tag === 'latest')]) {
    const named = row.tag === 'latest' ? ranged.find((other) => other !== row && sameRange(other, row)) : null;
    const sizes = named
      ? { sizeGb: named.sizeGb, appleSizeGb: named.appleSizeGb ?? named.sizeGb }
      : buildSizesFromRange(row.sizeRangeGb, { ggufGb: ggufSizes[row.tag], mlxGb: byKey.get(`${name}:${row.tag}-mlx`)?.sizeGb });
    row.sizeGb = sizes.sizeGb;
    if (sizes.appleSizeGb !== sizes.sizeGb) row.appleSizeGb = sizes.appleSizeGb;
  }
  return rows;
}

/** The tags of a family page whose rows list two sizes: the ones worth a look at the registry. */
function rangedOllamaTags(name, html) {
  return scanOllamaFamilyRows(name, String(html || '')).filter((row) => row.sizeRangeGb).map((row) => row.tag);
}

/** What each size accepts and weighs, keyed by tag: the snapshot's per-size record. */
function parseOllamaFamilySizes(name, html, ggufSizes = {}) {
  return Object.fromEntries(scanOllamaFamilyRows(name, String(html || ''), ggufSizes)
    .filter((row) => row.inputs)
    .map((row) => [row.tag, {
      inputs: row.inputs,
      ...(row.sizeGb ? { sizeGb: row.sizeGb } : {}),
      ...(row.appleSizeGb ? { appleSizeGb: row.appleSizeGb } : {}),
      ...(row.cloudOnly ? { cloudOnly: true } : {}),
    }]));
}

function parseOllamaFamilyRows(name, html) {
  const source = String(html || '');
  const facts = parseOllamaFamilyFacts(source);
  const described = scanOllamaFamilyRows(name, source).map(({ inputs, cloudOnly, sizeRangeGb, ...row }) => {
    const capabilities = ollamaCapabilitiesFor({ name, tag: row.tag, inputs, badges: facts.badges, description: facts.description });
    return {
      ...row,
      // Two sizes the page alone could not tell apart: kept for the snapshot,
      // which read the registry, to settle (applyCapabilitySnapshot).
      ...(sizeRangeGb && !row.appleSizeGb ? { sizeRangeGb } : {}),
      ...(capabilities ? { capabilities } : {}),
      ...(facts.description ? { description: facts.description } : {}),
      ...(cloudOnly ? { cloudOnly: true } : {}),
    };
  });
  return sortOllamaFamilyRows(described).slice(0, OLLAMA_FAMILY_TAG_LIMIT);
}

/**
 * The rows parseOllamaFamilyRows would have made from a family's page, built
 * from the snapshot's record of that page instead: the same fields, order and
 * limit. `entry` is the family's one unopened row, and carries what the
 * library listing said about it (its pulls).
 */
function snapshotFamilyRows(entry, facts) {
  const rows = Object.entries(facts.sizes ?? {}).filter(([tag]) => isValidOllamaTag(tag)).map(([tag, size]) => {
    const sizeGb = size.sizeGb ?? null;
    const capabilities = ollamaCapabilitiesFor({
      name: entry.name,
      tag,
      inputs: size.inputs ?? null,
      badges: facts.badges ?? [],
      description: facts.description ?? '',
    });
    return {
      ...entry,
      id: `${entry.name}:${tag}`,
      tag,
      params: inferParamsFromTag(tag, sizeGb),
      sizeGb,
      ...(size.appleSizeGb ? { appleSizeGb: size.appleSizeGb } : {}),
      pack: tag === 'latest' ? 'Live Latest' : 'Live Tag',
      ...(capabilities ? { capabilities } : {}),
      ...(facts.description ? { description: facts.description } : {}),
      ...(size.cloudOnly ? { cloudOnly: true } : {}),
    };
  });
  return sortOllamaFamilyRows(rows).slice(0, OLLAMA_FAMILY_TAG_LIMIT);
}

/**
 * Fills in what the live scan did not reach — families past the detail limit,
 * and the bundled list when offline — from the snapshot taken at release time
 * (electron/ollamaCapabilities.json, written by
 * scripts/snapshot-ollama-capabilities.mjs). The live page always wins.
 *
 * A family with no local size at all cannot be downloaded, so its row is given
 * the family's real cloud tag: every cloud check in the app reads the tag.
 *
 * A family the scan listed but did not open arrives as one "latest" row with
 * no size. It is replaced by the rows its page would have given, one for each
 * size in the snapshot (snapshotFamilyRows). Filling in that one row's size
 * was not enough: the scan opens the newest families only, so gemma4 slid
 * past the limit as newer ones were published and was left with gemma4:latest
 * and no other size to pick. A family the snapshot has no sizes for keeps its
 * one row.
 *
 * A bundled row (live: false) takes the snapshot's size over its own. The
 * bundled sizes are typed by hand and drift as ollama.com rebuilds a tag:
 * smallthinker was listed at 1.2 GB against a real 3.6 GB.
 *
 * A live row whose page listed two sizes it could not tell apart
 * (`sizeRangeGb`) takes the snapshot's answer when the snapshot saw the same
 * two: it knows which is the Mac's build, from the registry. Otherwise the row
 * keeps the bigger size for everyone.
 */
function applyCapabilitySnapshot(entries, snapshot) {
  const families = snapshot?.families ?? {};
  return entries.flatMap(({ sizeRangeGb, ...listed }) => {
    const facts = families[String(listed.name || '').toLowerCase()];
    const known = sizeRangeGb ? facts?.sizes?.[listed.tag] : null;
    const settled = known?.appleSizeGb
      && Math.min(known.sizeGb, known.appleSizeGb) === sizeRangeGb[0]
      && Math.max(known.sizeGb, known.appleSizeGb) === sizeRangeGb[1];
    const entry = settled ? { ...listed, sizeGb: known.sizeGb, appleSizeGb: known.appleSizeGb } : listed;
    if (entry.capabilities) return entry;
    if (!facts) return entry;
    if (entry.pack === 'Live Family' && entry.sizeGb == null) {
      const rows = snapshotFamilyRows(entry, facts);
      if (rows.length) return rows;
    }
    const sizes = facts.sizes ?? {};
    const tags = Object.keys(sizes);
    let tag = entry.tag;
    if (tags.length && tags.every((t) => sizes[t].cloudOnly) && !/cloud/i.test(tag)) {
      tag = tags.find((t) => /cloud/i.test(t)) ?? 'cloud';
    }
    const capabilities = ollamaCapabilitiesFor({
      name: entry.name,
      tag,
      inputs: sizes[tag]?.inputs ?? null,
      badges: facts.badges ?? [],
      description: facts.description ?? '',
    });
    const takesSize = (entry.sizeGb == null || entry.live === false) && sizes[tag]?.sizeGb;
    return {
      ...entry,
      ...(tag !== entry.tag ? { tag, id: `${entry.name}:${tag}` } : {}),
      ...(capabilities ? { capabilities } : {}),
      ...(facts.description && !entry.description ? { description: facts.description } : {}),
      ...(sizes[tag]?.cloudOnly ? { cloudOnly: true } : {}),
      ...(takesSize ? { sizeGb: sizes[tag].sizeGb } : {}),
      ...(takesSize && sizes[tag].appleSizeGb ? { appleSizeGb: sizes[tag].appleSizeGb } : {}),
    };
  });
}

module.exports = {
  OLLAMA_FAMILY_TAG_LIMIT,
  escapeRegExp,
  decodeHtml,
  decodeURIComponentSafe,
  getPlainText,
  isValidOllamaName,
  isValidOllamaTag,
  extractOllamaNamespaceModels,
  parseSizeToGb,
  parseSizeRangeGb,
  buildSizesFromRange,
  decimalGbToGiB,
  catalogSizesInGiB,
  inferParamsFromTag,
  inferParamsFromModelName,
  sortOllamaFamilyRows,
  parseOllamaFamilyFacts,
  parseOllamaRowFacts,
  ollamaCapabilitiesFor,
  rangedOllamaTags,
  parseOllamaFamilySizes,
  parseOllamaFamilyRows,
  applyCapabilitySnapshot,
};
