// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  OLLAMA_FAMILY_TAG_LIMIT,
  parseOllamaFamilyFacts,
  parseOllamaRowFacts,
  parseOllamaFamilyRows,
  parseOllamaFamilySizes,
  rangedOllamaTags,
  catalogSizesInGiB,
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
  assert.deepEqual(parseOllamaFamilySizes('gemma3', html), { '1b': { inputs: ['text'], sizeGb: 0.8 }, '4b': { inputs: ['text', 'image'], sizeGb: 3.3 } });
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
    gemma3: { badges: ['vision'], description: 'Gemma 3', sizes: { '1b': { inputs: ['text'], sizeGb: 0.8 }, '4b': { inputs: ['text', 'image'], sizeGb: 3.3 } } },
    'kimi-k2.6': { badges: ['vision', 'tools', 'thinking', 'cloud'], description: 'Kimi', sizes: { cloud: { inputs: ['text', 'image'], cloudOnly: true } } },
  } };
  const [small, big, live, cloud, bundled] = applyCapabilitySnapshot([
    { id: 'gemma3:1b', name: 'gemma3', tag: '1b', sizeGb: null },
    { id: 'gemma3:4b', name: 'gemma3', tag: '4b', sizeGb: 3.1 },
    { id: 'gemma3:12b', name: 'gemma3', tag: '12b', capabilities: ['completion'] },
    { id: 'kimi-k2.6:latest', name: 'kimi-k2.6', tag: 'latest' },
    { id: 'gemma3:4b', name: 'gemma3', tag: '4b', sizeGb: 2.0, live: false },
  ], snapshot);
  assert.equal(bundled.sizeGb, 3.3, 'a hand-typed bundled size gives way to the snapshot');
  assert.deepEqual(small.capabilities, ['completion']);
  assert.deepEqual(big.capabilities, ['completion', 'vision']);
  assert.equal(small.description, 'Gemma 3');
  assert.equal(small.sizeGb, 0.8, 'a row with no size takes the snapshot size, so Good fit can place it');
  assert.equal(big.sizeGb, 3.1, 'a size the scan already had is kept');
  assert.deepEqual(live.capabilities, ['completion'], 'a live reading is never overwritten');
  assert.equal(cloud.tag, 'cloud', 'a family with no local size is named by its cloud tag, which every cloud check reads');
  assert.equal(cloud.id, 'kimi-k2.6:cloud');
  assert.equal(cloud.cloudOnly, true);
});

// What getOllamaCatalog makes of a family it listed but did not open: the
// library page named it, and its own page was past the detail limit.
const unopened = (name) => ({
  id: `${name}:latest`, name, tag: 'latest', params: 'Unknown', sizeGb: null, pack: 'Live Family', source: 'Ollama library', live: true, pulls: 1200,
});

test('snapshot: a family the scan listed but did not open gets every size its page lists', () => {
  // gemma4 slid past the detail limit as newer families were published, and
  // the Models list was left with gemma4:latest and no other size to pick.
  const page = familyPage('gemma4', {
    badges: ['vision', 'tools', 'thinking', 'audio', 'cloud'],
    description: 'Gemma 4',
    sizes: [
      { tag: '12b', size: '7.7GB', inputs: 'Text, Image' },
      { tag: '31b-cloud', size: '-', inputs: 'Text, Image' },
      { tag: 'e2b', size: '4.6GB', inputs: 'Text, Image' },
      { tag: 'latest', size: '6.6GB', inputs: 'Text, Image' },
    ],
  });
  const snapshot = { families: { gemma4: { ...parseOllamaFamilyFacts(page), sizes: parseOllamaFamilySizes('gemma4', page) } } };
  const rows = applyCapabilitySnapshot([unopened('gemma4')], snapshot);
  assert.deepEqual(rows.map((row) => row.id), ['gemma4:latest', 'gemma4:e2b', 'gemma4:12b', 'gemma4:31b-cloud']);
  assert.deepEqual(
    rows,
    parseOllamaFamilyRows('gemma4', page).map((row) => ({ ...row, pulls: 1200 })),
    'the rows are the ones its opened page would have given',
  );
});

test('snapshot: only an unopened family is given rows, and no more than an opened page gives', () => {
  const many = Object.fromEntries(Array.from({ length: 25 }, (_, at) => [`${at + 1}b`, { inputs: ['text'], sizeGb: at + 1 }]));
  const snapshot = { families: {
    gemma3: { badges: ['vision'], sizes: { '1b': { inputs: ['text'], sizeGb: 0.8 }, '4b': { inputs: ['text', 'image'], sizeGb: 3.3 } } },
    'x/flux2-klein': { badges: [], description: 'Image-generation models.', sizes: {} },
    wizardlm: { badges: [], sizes: many },
  } };
  const bundled = { id: 'gemma3:4b', name: 'gemma3', tag: '4b', sizeGb: 3.3, pack: 'Balanced', source: 'Bundled catalog', live: false };
  const rows = applyCapabilitySnapshot([bundled, unopened('mystery'), unopened('x/flux2-klein'), unopened('wizardlm')], snapshot);
  assert.deepEqual(rows.slice(0, 3).map((row) => row.id), ['gemma3:4b', 'mystery:latest', 'x/flux2-klein:latest'],
    'a bundled size, a family the snapshot does not know and one with no sizes stay one row each');
  const wizard = rows.slice(3);
  assert.equal(wizard.length, OLLAMA_FAMILY_TAG_LIMIT, 'capped like an opened page');
  assert.equal(wizard[0].id, 'wizardlm:1b', 'smallest first');
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, 'no id twice');
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

test('sizes typed by hand elsewhere in the app match the snapshot, in GiB', async () => {
  const { decimalGbToGiB } = require('../electron/ollamaCatalog.cjs');
  const { families } = require('../electron/ollamaCapabilities.json');
  const { RIG_TIERS } = await import('../src/lib/rigScore.ts');
  const { USE_CASES, getFirstModelPicks } = await import('../src/lib/firstModel.ts');
  const typed = [
    ...RIG_TIERS.map((tier) => [tier.model, tier.sizeGb]),
    ...USE_CASES.flatMap(({ id }) => [4, 8, 12, 24].flatMap((vramGb) => getFirstModelPicks(id, vramGb)))
      .map((pick) => [pick.id, Number.parseFloat(pick.size)]),
  ];
  // ollama.com lists phi3:mini under its size tag only; skipping it let a
  // decimal 2.3 GB stand beside the converted 2.0 in the same picks.
  const tagAliases = { 'phi3:mini': 'phi3:3.8b' };
  let checked = 0;
  for (const [id, sizeGb] of typed) {
    const [name, tag] = (tagAliases[id] ?? id).split(':');
    const listed = families[name]?.sizes?.[tag]?.sizeGb;
    if (!listed) continue;
    checked += 1;
    assert.equal(sizeGb, decimalGbToGiB(listed), `${id} says ${sizeGb} GB; ollama.com lists ${listed} GB, which is ${decimalGbToGiB(listed)} GiB`);
  }
  assert.ok(checked >= 20, `only ${checked} sizes were checked`);
});

// gemma4's page, November 2026. A tag that holds two builds lists both sizes,
// smaller first, and the MLX builds have rows of their own. An Apple chip
// downloads the MLX build of a plain tag; everything else the GGUF one.
const twoBuilds = familyPage('gemma4', {
  badges: ['vision'],
  sizes: [
    { tag: 'latest', size: '6.6GB - 9.5GB', inputs: 'Text, Image' },
    { tag: 'e4b', size: '6.6GB - 9.5GB', inputs: 'Text, Image' },
    { tag: '12b', size: '7.7GB - 8.0GB', inputs: 'Text, Image' },
    { tag: '26b', size: '16GB - 19GB', inputs: 'Text, Image' },
    { tag: 'e4b-mlx', size: '9.5GB', inputs: 'Text, Image' },
    { tag: '12b-mlx', size: '7.7GB', inputs: 'Text, Image' },
    { tag: '26b-mlx', size: '18GB', inputs: 'Text, Image' },
  ],
});
const sizesOf = (rows) => Object.fromEntries(rows.map((row) => [row.tag, [row.sizeGb, row.appleSizeGb ?? row.sizeGb]]));

test('a tag with two builds is sized for a PC and for a Mac, not by whichever figure comes first', () => {
  // The first figure was taken for everyone: gemma4:e4b read 6.6 GB on a Mac
  // that downloaded 9.5, and gemma4:12b read 7.7 on a PC that downloaded 8.0.
  const rows = parseOllamaFamilyRows('gemma4', twoBuilds);
  assert.deepEqual(sizesOf(rows), {
    latest: [6.6, 9.5], e4b: [6.6, 9.5], '12b': [8, 7.7], '26b': [19, 19],
    'e4b-mlx': [9.5, 9.5], '12b-mlx': [7.7, 7.7], '26b-mlx': [18, 18],
  }, '[a PC, a Mac]; latest is the e4b under another name; 26b cannot be told from the page, so both get the bigger');
  assert.deepEqual(rows.find((row) => row.tag === '26b').sizeRangeGb, [16, 19], 'kept for the snapshot to settle');
  assert.ok(rows.filter((row) => row.tag !== '26b').every((row) => !('sizeRangeGb' in row)));

  // The snapshot script reads the GGUF build's size from the registry, which settles every one.
  assert.deepEqual(rangedOllamaTags('gemma4', twoBuilds), ['latest', 'e4b', '12b', '26b']);
  const recorded = parseOllamaFamilySizes('gemma4', twoBuilds, { e4b: 6.58, '12b': 8.02, '26b': 18.73 });
  assert.deepEqual(recorded['26b'], { inputs: ['text', 'image'], sizeGb: 19, appleSizeGb: 16 });
  assert.deepEqual(recorded.e4b, { inputs: ['text', 'image'], sizeGb: 6.6, appleSizeGb: 9.5 });
  assert.deepEqual(recorded.latest, recorded.e4b);
  assert.deepEqual(recorded['12b-mlx'], { inputs: ['text', 'image'], sizeGb: 7.7 }, 'a row with one size has one');
});

test('snapshot: both sizes reach a family the scan did not open, a bundled row, and a live row the page could not settle', () => {
  const snapshot = { families: { gemma4: { badges: ['vision'], sizes: parseOllamaFamilySizes('gemma4', twoBuilds, { e4b: 6.58, '12b': 8.02, '26b': 18.73 }) } } };
  const inGiB = (entries, apple) => Object.fromEntries(catalogSizesInGiB(applyCapabilitySnapshot(entries, snapshot), { apple }).map((row) => [row.tag, row.sizeGb]));

  const listed = [unopened('gemma4')];
  assert.deepEqual(inGiB(listed, false), { latest: 6.1, e4b: 6.1, '12b': 7.5, '26b': 17.7, 'e4b-mlx': 8.8, '12b-mlx': 7.2, '26b-mlx': 16.8 });
  assert.deepEqual(inGiB(listed, true), { latest: 8.8, e4b: 8.8, '12b': 7.2, '26b': 14.9, 'e4b-mlx': 8.8, '12b-mlx': 7.2, '26b-mlx': 16.8 });

  const bundled = [{ id: 'gemma4:26b', name: 'gemma4', tag: '26b', sizeGb: 16, pack: 'Heavyweight', source: 'Bundled catalog', live: false }];
  assert.deepEqual([inGiB(bundled, false), inGiB(bundled, true)], [{ '26b': 17.7 }, { '26b': 14.9 }]);

  // The page as the live scan reads it: 26b is "16GB - 19GB" with nothing to say which is the Mac's.
  const live = parseOllamaFamilyRows('gemma4', twoBuilds);
  assert.deepEqual([inGiB(live, false)['26b'], inGiB(live, true)['26b']], [17.7, 14.9], 'the snapshot saw the same two sizes, and knows');
  const rebuilt = live.map((row) => (row.tag === '26b' ? { ...row, sizeGb: 21, sizeRangeGb: [17, 21] } : row));
  assert.deepEqual([inGiB(rebuilt, false)['26b'], inGiB(rebuilt, true)['26b']], [19.6, 19.6], 'a tag rebuilt since keeps the bigger size for everyone');
  for (const entries of [listed, bundled, live, rebuilt]) {
    for (const made of [applyCapabilitySnapshot(entries, snapshot), applyCapabilitySnapshot(entries, null)]) {
      assert.ok(made.every((row) => !('sizeRangeGb' in row)), 'the two-size note never reaches the app');
    }
  }
});
