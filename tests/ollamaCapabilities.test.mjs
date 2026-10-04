// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseOllamaFamilyFacts,
  parseOllamaRowFacts,
  parseOllamaFamilyRows,
  parseOllamaFamilySizes,
  ollamaCapabilitiesFor,
  applyCapabilitySnapshot,
} = require('../electron/ollamaCatalog.cjs');

// The shape of an ollama.com family page, October 2026: badges as rounded
// spans under the title, a meta description, and every size linked twice —
// a narrow-layout card carrying "size · context · inputs · age", then a wide
// table row whose link holds only the name.
function familyPage(name, { badges = [], description = '', sizes = [] }) {
  const badgeHtml = badges.map((b) => `<span class="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs">${b}</span>`).join('');
  const rows = sizes.map((s) => [
    `<a href="/library/${name}:${s.tag}" class="sm:hidden flex flex-col"><p>${name}:${s.tag}</p><p>${s.size} · ${s.context ?? '128K'} context window · ${s.inputs} · 1 year ago</p></a>`,
    `<a href="/library/${name}:${s.tag}" class="block group-hover:underline">${name}:${s.tag}</a><p class="col-span-2">${s.size}</p>`,
  ].join('\n')).join('\n');
  return `<html><head><meta name="description" content="${description}"></head><body>
    <h1>${name}</h1><div>${badgeHtml}</div>
    <p>This readme mentions tools and vision in passing.</p>
    ${rows}</body></html>`;
}

test('family facts: the rounded badges and the description, not words in the readme', () => {
  const facts = parseOllamaFamilyFacts(familyPage('qwen3', { badges: ['tools', 'thinking'], description: 'Qwen3 is the latest generation &amp; more.' }));
  assert.deepEqual(facts.badges, ['tools', 'thinking']);
  assert.equal(facts.description, 'Qwen3 is the latest generation & more.');
});

test('row facts: inputs, a size range, and a cloud-only size', () => {
  assert.deepEqual(parseOllamaRowFacts('gemma3:4b 3.3GB · 128K context window · Text, Image · 1 year ago'), { inputs: ['text', 'image'], cloudOnly: false });
  assert.deepEqual(parseOllamaRowFacts('gemma4:e4b 6.6GB - 9.5GB · 128K context window · Text, Image · 4 days ago'), { inputs: ['text', 'image'], cloudOnly: false });
  assert.deepEqual(parseOllamaRowFacts('glm-5.3:cloud - · 1M context window · Text · 1 month ago'), { inputs: ['text'], cloudOnly: true });
  assert.deepEqual(parseOllamaRowFacts('gemma3:1b 815MB'), { inputs: null, cloudOnly: false });
});

test('each size says what it accepts: gemma3:1b reads text, gemma3:4b reads pictures too', () => {
  const html = familyPage('gemma3', {
    badges: ['vision'],
    sizes: [
      { tag: '1b', size: '815MB', context: '32K', inputs: 'Text' },
      { tag: '4b', size: '3.3GB', inputs: 'Text, Image' },
    ],
  });
  const caps = Object.fromEntries(parseOllamaFamilyRows('gemma3', html).map((row) => [row.tag, row.capabilities]));
  assert.deepEqual(caps['1b'], ['completion']);
  assert.deepEqual(caps['4b'], ['completion', 'vision']);
  assert.deepEqual(parseOllamaFamilySizes('gemma3', html), { '1b': { inputs: ['text'] }, '4b': { inputs: ['text', 'image'] } });
});

test('a model that uses tools and thinks still writes text', () => {
  // The search index this replaced listed only ['tools', 'thinking'], and the
  // app read the missing 'completion' as "cannot write": 97 catalog rows,
  // gemma4 and qwen3.5 among them, were kept out of every lineup.
  const [row] = parseOllamaFamilyRows('qwen3', familyPage('qwen3', { badges: ['tools', 'thinking'], sizes: [{ tag: '8b', size: '5.2GB', inputs: 'Text' }] }));
  assert.deepEqual(row.capabilities, ['completion', 'tools', 'thinking']);
});

test('hearing: the family badge, narrowed to the gemma4 sizes that have an audio encoder', () => {
  const badges = ['vision', 'tools', 'thinking', 'audio', 'cloud'];
  const hears = (tag) => ollamaCapabilitiesFor({ name: 'gemma4', tag, inputs: ['text', 'image'], badges }).includes('audio');
  assert.equal(hears('e2b'), true);
  assert.equal(hears('e4b-mlx'), true);
  assert.equal(hears('latest'), true, 'gemma4:latest is the E4B');
  assert.equal(hears('31b'), false);
  assert.equal(hears('26b'), false);
  assert.equal(ollamaCapabilitiesFor({ name: 'otherfam', tag: '7b', inputs: ['text'], badges: ['audio'] }).includes('audio'), true, 'other families follow the badge');
});

test('embedding, image makers and the unknown', () => {
  assert.deepEqual(ollamaCapabilitiesFor({ name: 'embeddinggemma', tag: '300m', inputs: ['text'], badges: ['embedding'] }), ['embedding']);
  assert.deepEqual(ollamaCapabilitiesFor({ name: 'x/flux2-klein', tag: 'latest', inputs: null, description: "Black Forest Labs' fastest image-generation models to date." }), ['image']);
  assert.equal(ollamaCapabilitiesFor({ name: 'x/canary', tag: 'latest', inputs: null, description: 'Get up and running with large language models.' }), null);
  assert.equal(ollamaCapabilitiesFor({ name: 'mystery', tag: 'latest', inputs: null, badges: [] }), null, 'nothing known leaves the name rules to guess');
});

test('a cloud-only size is marked, and a local size is not', () => {
  const html = familyPage('nemotron-3-nano', { badges: ['tools', 'thinking', 'cloud'], sizes: [
    { tag: '30b', size: '24GB', inputs: 'Text' },
    { tag: '30b-cloud', size: '-', inputs: 'Text' },
  ] });
  const rows = Object.fromEntries(parseOllamaFamilyRows('nemotron-3-nano', html).map((row) => [row.tag, row]));
  assert.equal(rows['30b'].cloudOnly, undefined);
  assert.equal(rows['30b-cloud'].cloudOnly, true);
});

test('snapshot: fills what the live scan did not reach, and the live page wins', () => {
  const snapshot = { families: {
    gemma3: { badges: ['vision'], description: 'Gemma 3', sizes: { '1b': { inputs: ['text'] }, '4b': { inputs: ['text', 'image'] } } },
    'kimi-k2.6': { badges: ['vision', 'tools', 'thinking', 'cloud'], description: 'Kimi', sizes: { cloud: { inputs: ['text', 'image'], cloudOnly: true } } },
  } };
  const [small, big, live, cloud] = applyCapabilitySnapshot([
    { id: 'gemma3:1b', name: 'gemma3', tag: '1b' },
    { id: 'gemma3:4b', name: 'gemma3', tag: '4b' },
    { id: 'gemma3:12b', name: 'gemma3', tag: '12b', capabilities: ['completion'] },
    { id: 'kimi-k2.6:latest', name: 'kimi-k2.6', tag: 'latest' },
  ], snapshot);
  assert.deepEqual(small.capabilities, ['completion']);
  assert.deepEqual(big.capabilities, ['completion', 'vision']);
  assert.equal(small.description, 'Gemma 3');
  assert.deepEqual(live.capabilities, ['completion'], 'a live reading is never overwritten');
  assert.equal(cloud.tag, 'cloud', 'a family with no local size is named by its cloud tag, which every cloud check reads');
  assert.equal(cloud.id, 'kimi-k2.6:cloud');
  assert.equal(cloud.cloudOnly, true);
});

test('the shipped snapshot is readable and covers the catalog', () => {
  const snapshot = require('../electron/ollamaCapabilities.json');
  assert.ok(Date.parse(snapshot.generatedAt), 'generatedAt is a date');
  const families = Object.entries(snapshot.families);
  assert.ok(families.length >= 100, `only ${families.length} families`);
  for (const [family, record] of families) {
    assert.ok(Array.isArray(record.badges), `${family}: badges`);
    assert.equal(typeof record.sizes, 'object', `${family}: sizes`);
  }
  assert.ok(snapshot.families.embeddinggemma?.badges.includes('embedding'));
});
