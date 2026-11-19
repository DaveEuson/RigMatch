#!/usr/bin/env node
// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Snapshot what Ollama's own pages say every catalog family can do, into
 * electron/ollamaCapabilities.json. Run before each release (see RELEASE.md).
 *
 * The live catalog scan reads these same facts from the family pages it
 * fetches, but it opens only the first OLLAMA_LIBRARY_DETAIL_LIMIT families,
 * and none when offline. Everything else falls back to this file, and without
 * it to guessing from the model's name. Network calls, one family at a time,
 * so this is a script rather than a test.
 *
 * Given family names (`... snapshot-ollama-capabilities.mjs gemma4 qwen3.5`),
 * it reads only those again and leaves the rest of the file, and its date, as
 * they are.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseOllamaFamilyFacts, parseOllamaFamilySizes, rangedOllamaTags, extractOllamaNamespaceModels } = require('../electron/ollamaCatalog.cjs');

const SNAPSHOT = new URL('../electron/ollamaCapabilities.json', import.meta.url);
const HEADERS = { 'user-agent': 'RigMatch capability snapshot (+https://github.com/DaveEuson/RigMatch)' };
async function get(url, headers = {}) {
  const response = await fetch(url, { headers: { ...HEADERS, ...headers } });
  if (!response.ok) throw new Error(`answered HTTP ${response.status}`);
  return response.text();
}

/**
 * The GGUF build's size in decimal GB for each tag whose row lists two sizes,
 * from the registry `ollama pull` reads: asked plainly, it answers with the
 * GGUF build and every file in it. That says which end of the row is the GGUF
 * build and which the MLX one (buildSizesFromRange); a tag it cannot read is
 * left to that function's other rules.
 */
async function ggufSizes(family, html) {
  const sizes = {};
  for (const tag of rangedOllamaTags(family, html)) {
    try {
      const repository = family.includes('/') ? family : `library/${family}`;
      const manifest = JSON.parse(await get(`https://registry.ollama.ai/v2/${repository}/manifests/${tag}`, {
        accept: 'application/vnd.docker.distribution.manifest.v2+json',
      }));
      if (manifest.format !== 'gguf') throw new Error(`gave a ${manifest.format ?? 'nameless'} build`);
      sizes[tag] = manifest.layers.reduce((bytes, layer) => bytes + layer.size, 0) / 1e9;
    } catch (error) {
      console.log(`  ** ${family}:${tag}: the registry ${error.message}; its two sizes are told apart from the page alone`);
    }
  }
  return sizes;
}

const only = process.argv.slice(2).map((name) => name.toLowerCase());
const previous = only.length ? JSON.parse(readFileSync(SNAPSHOT, 'utf8')) : null;

// Every family the app can list: the three library listings it scans, the x/
// shelf, and the bundled catalog.
const families = new Set(only);
if (!only.length) {
  for (const url of ['https://ollama.com/library?sort=newest', 'https://ollama.com/library', 'https://ollama.com/library?sort=popular']) {
    for (const match of (await get(url)).matchAll(/href="\/library\/([a-z0-9][a-z0-9._-]*)"/gi)) families.add(match[1].toLowerCase());
  }
  for (const { name } of extractOllamaNamespaceModels(await get('https://ollama.com/x'))) families.add(name.toLowerCase());
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  for (const match of main.matchAll(/catalogEntry\('([^']+)'/g)) families.add(match[1].toLowerCase());
}

const records = previous?.families ?? {};
let failed = 0;
for (const family of [...families].sort()) {
  const url = family.startsWith('x/') ? `https://ollama.com/${family}` : `https://ollama.com/library/${family}`;
  try {
    const html = await get(url);
    const { badges, description } = parseOllamaFamilyFacts(html);
    records[family] = { badges, description, sizes: parseOllamaFamilySizes(family, html, await ggufSizes(family, html)) };
  } catch (error) {
    failed += 1;
    console.log(`  ** ${family}: ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// One family per line, so a release diff shows exactly which families changed.
const body = Object.entries(records).map(([family, record]) => `  ${JSON.stringify(family)}: ${JSON.stringify(record)}`).join(',\n');
writeFileSync(
  SNAPSHOT,
  `{\n "generatedAt": ${JSON.stringify(previous?.generatedAt ?? new Date().toISOString())},\n "source": "https://ollama.com",\n "families": {\n${body}\n }\n}\n`,
);
console.log(`${Object.keys(records).length} families written to electron/ollamaCapabilities.json${only.length ? ` (${only.length} read again)` : ''}, ${failed} failed.`);
process.exit(failed ? 1 : 0);
