// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collapseModelVariants, compareForWizard } from '../src/lib/wizardVariants.ts';

// The reviewer's actual grid: several Gemma 4 sizes with Mistral-nemo landing in
// the middle of the run, because the wizard sorts by size and families interleave.
const mk = (displayName, name, installed = false) => ({ name, row: { displayName, installed } });

const reviewerGrid = [
  mk('gemma4:e4b', 'Gemma4'),
  mk('mistral-nemo:12b', 'Mistral-nemo'),
  mk('gemma4:e2b', 'Gemma4'),
  mk('gemma3:4b', 'Gemma3'),
  mk('gemma4:2b', 'Gemma4'),
  mk('mistral:7b', 'Mistral'),
];

test('one card per model name, first (best) variant representing it', () => {
  const out = collapseModelVariants(reviewerGrid, new Set());
  assert.deepEqual(out.map((m) => m.row.displayName), [
    'gemma4:e4b',       // best Gemma4 — the list arrives best-first
    'mistral-nemo:12b',
    'gemma3:4b',        // a different generation keeps its own card
    'mistral:7b',
  ]);
});

test('a collapsed card says how many sizes it stands in for', () => {
  const out = collapseModelVariants(reviewerGrid, new Set());
  const gemma4 = out.find((m) => m.name === 'Gemma4');
  assert.equal(gemma4.variantCount, 3);
  // Cards that never collapsed anything must not claim to.
  assert.equal(out.find((m) => m.name === 'Gemma3').variantCount, undefined);
});

test('families no longer interleave — each name holds its best position', () => {
  const out = collapseModelVariants(reviewerGrid, new Set());
  const names = out.map((m) => m.name);
  // Every name appears exactly once, so a later sibling can no longer split
  // another family's run — the reviewer's "Mistral-nemo break the in-order".
  assert.equal(new Set(names).size, names.length);
});

test('a shortlisted variant represents its card even when a better one exists', () => {
  // Shortlists survive from Advanced Mode and older sessions. If gemma4:2b is in
  // the lineup but the card showed gemma4:e4b, the card would render unpicked
  // while the tray shows Gemma4 — the same model, apparently both in and out.
  const out = collapseModelVariants(reviewerGrid, new Set(['gemma4:2b']));
  assert.equal(out.find((m) => m.name === 'Gemma4').row.displayName, 'gemma4:2b');
});

test('an installed variant beats one that needs a download', () => {
  const grid = [
    mk('gemma4:e4b', 'Gemma4', false),
    mk('gemma4:2b', 'Gemma4', true),
  ];
  const out = collapseModelVariants(grid, new Set());
  // "Already on your PC · free" is worth more to a beginner than a bigger
  // download — within the same model, the installed size wins the card.
  assert.equal(out[0].row.displayName, 'gemma4:2b');
  assert.equal(out[0].variantCount, 2);
});

test('shortlisted beats installed — the lineup is the stronger promise', () => {
  const grid = [
    mk('gemma4:e4b', 'Gemma4', true),
    mk('gemma4:2b', 'Gemma4', false),
  ];
  const out = collapseModelVariants(grid, new Set(['gemma4:2b']));
  assert.equal(out[0].row.displayName, 'gemma4:2b');
});

test('a list with no duplicate names passes through untouched', () => {
  const grid = [mk('mistral:7b', 'Mistral'), mk('gemma3:4b', 'Gemma3')];
  const out = collapseModelVariants(grid, new Set());
  assert.deepEqual(out.map((m) => m.row.displayName), ['mistral:7b', 'gemma3:4b']);
  assert.ok(out.every((m) => m.variantCount === undefined));
});

// The Windows check of 0.10.0: "Let's go" with no goal opened Pick on four
// models that each needed a 6+ GB download, with the one installed model in
// the middle. Same fit, so the order fell to size alone.
const entry = (displayName, tone, sizeGb, installed = false) => ({ name: displayName, row: { displayName, sizeGb, installed }, fit: { tone } });
const order = (entries) => [...entries].sort(compareForWizard).map((e) => e.row.displayName);

test('among models that fit equally well, the installed one comes first', () => {
  const lineup = [
    entry('solar:10.7b', 'sweet-spot', 6.1),
    entry('falcon2:11b', 'sweet-spot', 6.4),
    entry('qwen3.5:9b', 'sweet-spot', 5.9, true),
    entry('ornith:9b', 'sweet-spot', 6.8),
  ];
  assert.deepEqual(order(lineup), ['qwen3.5:9b', 'ornith:9b', 'falcon2:11b', 'solar:10.7b']);
});

test('fit tone still comes before installed: a better fit to download beats a tight one on disk', () => {
  const lineup = [
    entry('tight-and-installed:14b', 'tight', 9.3, true),
    entry('good-and-installed:8b', 'good', 5.2, true),
    entry('great-to-download:7b', 'sweet-spot', 4.4),
  ];
  assert.deepEqual(order(lineup), ['great-to-download:7b', 'good-and-installed:8b', 'tight-and-installed:14b']);
});

test('within installed and within not installed, the largest that fits still leads', () => {
  const lineup = [
    entry('small-installed:3b', 'sweet-spot', 2, true),
    entry('big-download:12b', 'sweet-spot', 7.5),
    entry('big-installed:8b', 'sweet-spot', 5.2, true),
    entry('small-download:4b', 'sweet-spot', 2.6),
  ];
  assert.deepEqual(order(lineup), ['big-installed:8b', 'small-installed:3b', 'big-download:12b', 'small-download:4b']);
});

test('a row with no size or no installed flag sorts as not installed and sizeless, without throwing', () => {
  const lineup = [
    { name: 'a', row: { displayName: 'a', sizeGb: null }, fit: { tone: 'good' } },
    entry('b', 'good', 3, true),
    entry('c', 'good', 3),
  ];
  assert.deepEqual(order(lineup), ['b', 'c', 'a']);
});

test('the card for a family is its installed size, and the family sits where its best card sorts', () => {
  const sorted = [
    entry('gemma3:4b', 'sweet-spot', 3.3, true),
    entry('gemma3:12b', 'sweet-spot', 8.1),
    entry('mistral:7b', 'sweet-spot', 4.4),
  ].map((e, i) => ({ ...e, name: i < 2 ? 'Gemma3' : 'Mistral' })).sort(compareForWizard);
  const cards = collapseModelVariants(sorted, new Set());
  assert.deepEqual(cards.map((c) => c.row.displayName), ['gemma3:4b', 'mistral:7b']);
  assert.equal(cards[0].variantCount, 2);
});
