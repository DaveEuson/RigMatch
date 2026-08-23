// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import { GOALS, goalHardwareExpectation } from '../src/lib/goals.ts';
import { USE_CASES, getFirstModelPicks } from '../src/lib/firstModel.ts';

/**
 * The fit advice, swept across graphics cards nobody here owns.
 *
 * Everything about hardware fit — which models are a sweet spot, which are out
 * of your league, what a goal will feel like — is decided from one number, and
 * it has only ever been seen at one value: the 12 GB card this was written on.
 * Every other tier is untested opinion, and the app states it confidently.
 *
 * These functions take the number as an argument, so no fake profile or
 * environment override is needed to see the whole range. What is checked is not
 * the wording, which is allowed to change, but the properties that must hold at
 * every tier or the advice contradicts itself.
 */

// Realistic cards: integrated, entry, mainstream, the machine this was built on,
// enthusiast, and a workstation.
const TIERS = [0, 4, 6, 8, 12, 16, 24, 48];
const TONE_RANK = { unlikely: 0, tight: 1, ready: 2 };

test('every goal has an answer at every tier', () => {
  for (const goal of GOALS) {
    for (const vram of TIERS) {
      const expectation = goalHardwareExpectation(goal, vram);
      assert.ok(expectation, `${goal.id} at ${vram}GB returned nothing`);
      assert.ok(TONE_RANK[expectation.tone] !== undefined,
        `${goal.id} at ${vram}GB has an unknown tone: ${expectation.tone}`);
      assert.ok(expectation.note && expectation.note.trim().length > 10,
        `${goal.id} at ${vram}GB says nothing useful: ${JSON.stringify(expectation.note)}`);
      assert.ok(['measured', 'heuristic'].includes(expectation.source),
        `${goal.id} at ${vram}GB does not say where its claim comes from`);
    }
  }
});

test('a bigger card is never described as worse for the same goal', () => {
  // The invariant that matters. Advice assembled from thresholds can easily
  // say "tight" at 16 GB and "ready" at 12 if a bound is written backwards, and
  // nobody testing on one card would ever see it.
  for (const goal of GOALS) {
    let previous = null;
    for (const vram of TIERS) {
      const tone = goalHardwareExpectation(goal, vram).tone;
      if (previous !== null) {
        assert.ok(TONE_RANK[tone] >= TONE_RANK[previous.tone],
          `${goal.id} got worse with more VRAM: ${previous.vram}GB was ${previous.tone}, ${vram}GB is ${tone}`);
      }
      previous = { vram, tone };
    }
  }
});

test('no goal claims to be ready on a machine with no graphics card at all', () => {
  // 0 GB is a real reading — integrated graphics, or a failed probe. Promising
  // a video model there would be the emptiest promise the app could make.
  const heavy = GOALS.filter((goal) => /video|image/i.test(goal.id));
  assert.ok(heavy.length > 0, 'expected some image or video goals to check');
  for (const goal of heavy) {
    assert.notEqual(goalHardwareExpectation(goal, 0).tone, 'ready',
      `${goal.id} claims to be ready with no VRAM`);
  }
});

test('first-model picks are offered at every tier, and stay small on small cards', () => {
  for (const useCase of USE_CASES.map((entry) => entry.id)) {
    for (const vram of TIERS) {
      const picks = getFirstModelPicks(useCase, vram);
      assert.ok(Array.isArray(picks) && picks.length > 0,
        `no first model offered for ${useCase} at ${vram}GB — the setup step would be empty`);
      for (const pick of picks) {
        assert.ok(pick.id && pick.name && pick.size,
          `${useCase} at ${vram}GB offered an incomplete pick: ${JSON.stringify(pick)}`);
      }
    }
  }
});

test('a small card is never handed a model far larger than it', () => {
  // The recommendation is where a bad threshold does real damage: a 4 GB card
  // told to fetch a 40 GB model wastes an hour of downloading to fail.
  for (const useCase of USE_CASES.map((entry) => entry.id)) {
    for (const vram of [4, 6, 8]) {
      for (const pick of getFirstModelPicks(useCase, vram)) {
        const gb = Number.parseFloat(String(pick.size).replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(gb)) continue;
        assert.ok(gb <= vram * 2.5,
          `${useCase} at ${vram}GB suggests ${pick.name} (${pick.size}), far past what the card holds`);
      }
    }
  }
});
