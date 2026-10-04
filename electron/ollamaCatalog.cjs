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

function parseSizeToGb(detail) {
  const match = String(detail || '').match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase() === 'mb'
    ? Math.round((value / 1024) * 10) / 10
    : Math.round(value * 10) / 10;
}

function inferParamsFromTag(tag) {
  const match = String(tag || '').match(/(\d+(?:\.\d+)?)(m|b)/i);
  if (!match) return tag === 'latest' ? 'Latest' : 'Unknown';
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

const OLLAMA_BADGES = ['vision', 'tools', 'thinking', 'embedding', 'audio', 'cloud'];

/**
 * What a family page says about the whole family: the capability badges under
 * its name (rounded spans: vision, tools, thinking, embedding, audio, cloud)
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
  if (!inputs && badges.length === 0) return null;
  const capabilities = ['completion'];
  if (inputs ? inputs.includes('image') : badges.includes('vision')) capabilities.push('vision');
  const hearingSizes = HEARING_SIZES[String(name).toLowerCase()];
  if (badges.includes('audio') && (!hearingSizes || hearingSizes.test(String(tag)))) capabilities.push('audio');
  if (badges.includes('tools')) capabilities.push('tools');
  if (badges.includes('thinking')) capabilities.push('thinking');
  return capabilities;
}

/** Every size linked on a family page, with what it accepts, unsorted. */
function scanOllamaFamilyRows(name, source) {
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

    const row = {
      id: key,
      name,
      tag,
      params: inferParamsFromTag(tag),
      sizeGb: parseSizeToGb(detail),
      pack: tag === 'latest' ? 'Live Latest' : 'Live Tag',
      source: 'Ollama library',
      live: true,
      inputs: rowFacts.inputs,
      cloudOnly: rowFacts.cloudOnly,
    };
    byKey.set(key, row);
    rows.push(row);
  }
  return rows;
}

/** What each size accepts, keyed by tag: the snapshot's per-size record. */
function parseOllamaFamilySizes(name, html) {
  return Object.fromEntries(scanOllamaFamilyRows(name, String(html || ''))
    .filter((row) => row.inputs)
    .map((row) => [row.tag, { inputs: row.inputs, ...(row.cloudOnly ? { cloudOnly: true } : {}) }]));
}

function parseOllamaFamilyRows(name, html) {
  const source = String(html || '');
  const facts = parseOllamaFamilyFacts(source);
  const described = scanOllamaFamilyRows(name, source).map(({ inputs, cloudOnly, ...row }) => {
    const capabilities = ollamaCapabilitiesFor({ name, tag: row.tag, inputs, badges: facts.badges, description: facts.description });
    return {
      ...row,
      ...(capabilities ? { capabilities } : {}),
      ...(facts.description ? { description: facts.description } : {}),
      ...(cloudOnly ? { cloudOnly: true } : {}),
    };
  });
  return sortOllamaFamilyRows(described).slice(0, OLLAMA_FAMILY_TAG_LIMIT);
}

/**
 * Fills in what the live scan did not reach — families past the detail limit,
 * and the bundled list when offline — from the snapshot taken at release time
 * (electron/ollamaCapabilities.json, written by
 * scripts/snapshot-ollama-capabilities.mjs). The live page always wins.
 *
 * A family with no local size at all cannot be downloaded, so its row is given
 * the family's real cloud tag: every cloud check in the app reads the tag.
 */
function applyCapabilitySnapshot(entries, snapshot) {
  const families = snapshot?.families ?? {};
  return entries.map((entry) => {
    if (entry.capabilities) return entry;
    const facts = families[String(entry.name || '').toLowerCase()];
    if (!facts) return entry;
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
    return {
      ...entry,
      ...(tag !== entry.tag ? { tag, id: `${entry.name}:${tag}` } : {}),
      ...(capabilities ? { capabilities } : {}),
      ...(facts.description && !entry.description ? { description: facts.description } : {}),
      ...(sizes[tag]?.cloudOnly ? { cloudOnly: true } : {}),
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
  inferParamsFromTag,
  inferParamsFromModelName,
  sortOllamaFamilyRows,
  parseOllamaFamilyFacts,
  parseOllamaRowFacts,
  ollamaCapabilitiesFor,
  parseOllamaFamilySizes,
  parseOllamaFamilyRows,
  applyCapabilitySnapshot,
};
