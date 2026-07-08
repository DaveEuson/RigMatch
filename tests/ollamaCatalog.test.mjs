import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  parseOllamaFamilyRows,
  parseSizeToGb,
  inferParamsFromTag,
  inferParamsFromModelName,
  sortOllamaFamilyRows,
  isValidOllamaTag,
  isValidOllamaName,
} = require('../electron/ollamaCatalog.cjs');

// A trimmed-down shape of the Ollama library tags page: each tag row is an
// anchor to /library/<name>:<tag> followed by that tag's own size. The 4b row
// (2.8 GB) deliberately sits immediately before the 30b row (22 GB) — this is
// the layout that produced issue #6.
function tagsHtml(name, tags) {
  return tags
    .map((t) => `<div class="row"><a href="/library/${name}:${t.tag}">${t.tag}</a><span class="text-neutral-500">${t.size} · 128K context · 3 days ago</span></div>`)
    .join('\n');
}

test('parseOllamaFamilyRows: each tag keeps its own size (issue #6 regression)', () => {
  const html = tagsHtml('nemotron-3-nano', [
    { tag: 'latest', size: '22GB' },
    { tag: '4b', size: '2.8GB' },
    { tag: '30b', size: '22GB' },
  ]);
  const rows = parseOllamaFamilyRows('nemotron-3-nano', html);
  const byTag = Object.fromEntries(rows.map((r) => [r.tag, r.sizeGb]));

  assert.equal(byTag['4b'], 2.8, '4b keeps its own 2.8 GB');
  assert.equal(byTag['30b'], 22, '30b must not inherit the 4b tag size — it is 22 GB');
});

test('parseOllamaFamilyRows: does not bleed a neighbour size when a row lacks its own size', () => {
  // The 30b row has no size text of its own; it must resolve to null rather than
  // borrowing the following tag's 2.8 GB.
  const html = [
    '<div class="row"><a href="/library/foo:30b">30b</a><span>128K context · 3 days ago</span></div>',
    '<div class="row"><a href="/library/foo:4b">4b</a><span>2.8GB · 128K context · 3 days ago</span></div>',
  ].join('\n');
  const rows = parseOllamaFamilyRows('foo', html);
  const byTag = Object.fromEntries(rows.map((r) => [r.tag, r.sizeGb]));

  assert.equal(byTag['30b'], null, '30b has no size text, so sizeGb is null (not the 4b size)');
  assert.equal(byTag['4b'], 2.8);
});

test('parseOllamaFamilyRows: dedupes tags, tags latest, and marks rows live', () => {
  const html = tagsHtml('llama3.2', [
    { tag: 'latest', size: '2.0GB' },
    { tag: '3b', size: '2.0GB' },
    { tag: '3b', size: '2.0GB' }, // duplicate link — should collapse
    { tag: '1b', size: '1.3GB' },
  ]);
  const rows = parseOllamaFamilyRows('llama3.2', html);

  assert.equal(rows.filter((r) => r.tag === '3b').length, 1, 'duplicate tag collapses');
  assert.equal(rows[0].tag, 'latest', 'latest sorts first');
  assert.ok(rows.every((r) => r.live === true && r.source === 'Ollama library'));
  assert.equal(rows.find((r) => r.tag === '1b').params, '1B');
});

test('parseSizeToGb: parses GB, converts MB, and rejects missing/garbage', () => {
  assert.equal(parseSizeToGb('22GB · 128K'), 22);
  assert.equal(parseSizeToGb('2.8 GB'), 2.8);
  assert.equal(parseSizeToGb('512MB'), 0.5); // 512/1024 rounded to 1dp
  assert.equal(parseSizeToGb('128K context, no size'), null);
  assert.equal(parseSizeToGb(''), null);
  assert.equal(parseSizeToGb(null), null);
});

test('inferParamsFromTag / inferParamsFromModelName', () => {
  assert.equal(inferParamsFromTag('30b'), '30B');
  assert.equal(inferParamsFromTag('3.8b-instruct'), '3.8B');
  assert.equal(inferParamsFromTag('270m'), '270M');
  assert.equal(inferParamsFromTag('latest'), 'Latest');
  assert.equal(inferParamsFromTag('weird'), 'Unknown');

  assert.equal(inferParamsFromModelName('qwen2.5:7b'), '7B');
  assert.equal(inferParamsFromModelName('nemotron-3-nano:30b'), '30B');
  assert.equal(inferParamsFromModelName('mystery-model'), null);
});

test('sortOllamaFamilyRows: latest first, then smallest size, then tag name', () => {
  const sorted = sortOllamaFamilyRows([
    { tag: '30b', sizeGb: 22 },
    { tag: 'latest', sizeGb: 5 },
    { tag: '4b', sizeGb: 2.8 },
    { tag: 'special', sizeGb: null },
  ]);
  assert.deepEqual(sorted.map((r) => r.tag), ['latest', '4b', '30b', 'special']);
});

test('isValidOllamaTag rejects path-traversal / injection shapes', () => {
  assert.equal(isValidOllamaTag('30b'), true);
  assert.equal(isValidOllamaTag('q4_K_M'), true);
  assert.equal(isValidOllamaTag('../etc'), false);
  assert.equal(isValidOllamaTag('a b'), false);
  assert.equal(isValidOllamaTag(''), false);
});

test('isValidOllamaName allows the "x/" namespace but no other slash shapes', () => {
  assert.equal(isValidOllamaName('llama3.2'), true);
  assert.equal(isValidOllamaName('x/flux2-klein'), true);
  assert.equal(isValidOllamaName('x/z-image-turbo'), true);
  assert.equal(isValidOllamaName('y/flux2-klein'), false, 'only the x/ namespace is allowed');
  assert.equal(isValidOllamaName('x/../etc'), false);
  assert.equal(isValidOllamaName('a/b/c'), false, 'only one namespace level is allowed');
});

test('parseOllamaFamilyRows: "x/" namespace models parse from /x/<name>:<tag>, not /library/', () => {
  const html = [
    '<div class="row"><a href="/x/flux2-klein:latest">latest</a><span>5.7GB · - context window</span></div>',
    '<div class="row"><a href="/x/flux2-klein:9b">9b</a><span>12GB · - context window</span></div>',
    // A same-named /library/ link should not be picked up for the namespaced family.
    '<div class="row"><a href="/library/flux2-klein:decoy">decoy</a><span>1GB</span></div>',
  ].join('\n');
  const rows = parseOllamaFamilyRows('x/flux2-klein', html);
  const byTag = Object.fromEntries(rows.map((r) => [r.tag, r.sizeGb]));

  assert.equal(rows.length, 2);
  assert.equal(byTag['latest'], 5.7);
  assert.equal(byTag['9b'], 12);
  assert.ok(rows.every((r) => r.name === 'x/flux2-klein'));
});
