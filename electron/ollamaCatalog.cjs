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

function isValidOllamaName(name) {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(String(name || ''));
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

function parseOllamaFamilyRows(name, html) {
  const rows = [];
  const seen = new Set();
  const source = String(html || '');
  const rowPattern = new RegExp(`href=["']/library/${escapeRegExp(name)}:([^"'#?/<>\\s]+)["']`, 'gi');
  const matches = [...source.matchAll(rowPattern)];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const tag = decodeURIComponentSafe(decodeHtml(match[1]));
    if (!isValidOllamaTag(tag)) continue;
    const key = `${name}:${tag}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Scope the size lookup to THIS tag's own row: from just after its link to
    // the start of the next tag's link. The previous ±window bled into
    // neighbouring rows, so a large tag could pick up a smaller tag's size
    // (e.g. a 30b tag reported as 2.8 GB — issue #6). Cap the window so a final
    // row with no following link doesn't scan the rest of the page.
    const rowStart = (match.index || 0) + match[0].length;
    const nextStart = i + 1 < matches.length ? (matches[i + 1].index ?? source.length) : source.length;
    const rowEnd = Math.min(nextStart, rowStart + 1400);
    const detail = getPlainText(source.slice(rowStart, rowEnd));
    const sizeGb = parseSizeToGb(detail);

    rows.push({
      id: key,
      name,
      tag,
      params: inferParamsFromTag(tag),
      sizeGb,
      pack: tag === 'latest' ? 'Live Latest' : 'Live Tag',
      source: 'Ollama library',
      live: true,
    });
  }

  return sortOllamaFamilyRows(rows).slice(0, OLLAMA_FAMILY_TAG_LIMIT);
}

module.exports = {
  OLLAMA_FAMILY_TAG_LIMIT,
  escapeRegExp,
  decodeHtml,
  decodeURIComponentSafe,
  getPlainText,
  isValidOllamaName,
  isValidOllamaTag,
  parseSizeToGb,
  inferParamsFromTag,
  inferParamsFromModelName,
  sortOllamaFamilyRows,
  parseOllamaFamilyRows,
};
