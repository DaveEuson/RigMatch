import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collapseModelVariants } from '../src/lib/wizardVariants.ts';

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
