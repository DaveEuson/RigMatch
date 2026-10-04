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
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseOllamaFamilyFacts, parseOllamaFamilySizes, extractOllamaNamespaceModels } = require('../electron/ollamaCatalog.cjs');

const HEADERS = { 'user-agent': 'RigMatch capability snapshot (+https://github.com/DaveEuson/RigMatch)' };
async function get(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`answered HTTP ${response.status}`);
  return response.text();
}

// Every family the app can list: the three library listings it scans, the x/
// shelf, and the bundled catalog.
const families = new Set();
for (const url of ['https://ollama.com/library?sort=newest', 'https://ollama.com/library', 'https://ollama.com/library?sort=popular']) {
  for (const match of (await get(url)).matchAll(/href="\/library\/([a-z0-9][a-z0-9._-]*)"/gi)) families.add(match[1].toLowerCase());
}
for (const { name } of extractOllamaNamespaceModels(await get('https://ollama.com/x'))) families.add(name.toLowerCase());
const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
for (const match of main.matchAll(/catalogEntry\('([^']+)'/g)) families.add(match[1].toLowerCase());

const records = {};
let failed = 0;
for (const family of [...families].sort()) {
  const url = family.startsWith('x/') ? `https://ollama.com/${family}` : `https://ollama.com/library/${family}`;
  try {
    const html = await get(url);
    const { badges, description } = parseOllamaFamilyFacts(html);
    records[family] = { badges, description, sizes: parseOllamaFamilySizes(family, html) };
  } catch (error) {
    failed += 1;
    console.log(`  ** ${family}: ${error.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// One family per line, so a release diff shows exactly which families changed.
const body = Object.entries(records).map(([family, record]) => `  ${JSON.stringify(family)}: ${JSON.stringify(record)}`).join(',\n');
writeFileSync(
  new URL('../electron/ollamaCapabilities.json', import.meta.url),
  `{\n "generatedAt": ${JSON.stringify(new Date().toISOString())},\n "source": "https://ollama.com",\n "families": {\n${body}\n }\n}\n`,
);
console.log(`${Object.keys(records).length} families written to electron/ollamaCapabilities.json, ${failed} failed.`);
process.exit(failed ? 1 : 0);
