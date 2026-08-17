#!/usr/bin/env node
/**
 * Every licence link the download consent dialog can produce, checked against
 * the real servers.
 *
 * That dialog is the app's only legal gate: it asks the user to confirm they
 * understand the models' terms and links to them. The links for most families
 * are BUILT from the model name rather than written by hand, so a renamed or
 * mistyped model yields a 404 — terms the user is told to read and cannot.
 *
 * Usage:  node scripts/check-license-links.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The models to check.
 *
 * The catalogue is populated from Ollama's live tag list, so there is no static
 * set to enumerate and the generated links are pattern-based. What can be
 * verified is the pattern itself against the models RigMatch actually ships as
 * its default lineup, plus the fixed provider and Gemma links that every
 * download shows.
 */
function catalogueModels() {
  const source = readFileSync(join(root, 'src/lib/appConfig.ts'), 'utf-8');
  const literal = source.match(/DEFAULT_SHORTLIST_IDS\s*=\s*\[([^\]]+)\]/)?.[1] ?? '';
  const names = [...literal.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  // A few more families a first-time user is likely to reach for, so the
  // pattern is exercised beyond the five defaults.
  return [...new Set([...names, 'deepseek-r1:7b', 'codellama:7b', 'llava:7b'])];
}

const { licenseLinksForModels } = await import('../src/lib/modelLicenses.ts');

const models = catalogueModels();
if (models.length === 0) {
  console.error('found no model names in appConfig.ts — DEFAULT_SHORTLIST_IDS probably moved');
  process.exit(1);
}

const links = licenseLinksForModels(models);
console.log(`${models.length} catalogue models produce ${links.length} distinct links\n`);

let bad = 0;
for (const link of links) {
  let status = 'ERR';
  try {
    // Some hosts refuse HEAD; fall back to a ranged GET rather than reporting
    // a false failure.
    let response = await fetch(link.href, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(link.href, { headers: { range: 'bytes=0-64' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    }
    status = String(response.status);
    if (!response.ok) bad += 1;
  } catch (error) {
    bad += 1;
    status = error instanceof Error ? error.message.slice(0, 40) : 'failed';
  }
  console.log(`  ${status.padEnd(6)} ${link.label.padEnd(28)} ${link.href}`);
}

console.log(bad === 0
  ? `\nAll ${links.length} licence links resolve.`
  : `\n${bad} of ${links.length} licence links are dead — the consent dialog would cite terms nobody can open.`);
process.exit(bad === 0 ? 0 : 1);
