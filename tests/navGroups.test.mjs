// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { groupNavItems, NAV_GROUPS } = await import('../src/lib/navGroups.ts');
const { navItems } = await import('../src/lib/appConfig.ts');

/**
 * Advanced Mode's nav was eight undifferentiated rows. Grouping them by what
 * you go there to do is the same argument as the two rails: structure that
 * encodes something true, so you aim at the menu instead of re-reading it.
 */

const ids = (groups) => groups.flatMap((g) => g.items.map((i) => i.id));

test('every screen survives grouping', () => {
  // The failure that matters here is a screen vanishing from the menu.
  const grouped = groupNavItems(navItems);
  assert.deepEqual([...ids(grouped)].sort(), navItems.map((i) => i.id).sort());
});

test('no screen is claimed by two groups', () => {
  const seen = ids(groupNavItems(navItems));
  assert.equal(seen.length, new Set(seen).size);
});

test('the groups say what you go there to do', () => {
  const grouped = groupNavItems(navItems);
  assert.deepEqual(grouped.map((g) => g.label), ['Find', 'Test', 'Your setup']);
});

test('a group nothing survives into prints no heading over nothing', () => {
  // Top Pick and Scorecards are both hidden until something has been scored,
  // and Comparison can be filtered out too — leaving Test empty.
  const withoutTest = navItems.filter((i) => !['speedDate', 'history', 'agent'].includes(i.id));
  const grouped = groupNavItems(withoutTest);
  assert.ok(!grouped.some((g) => g.label === 'Test'));
  assert.deepEqual([...ids(grouped)].sort(), withoutTest.map((i) => i.id).sort());
});

test('a screen nobody grouped is still reachable', () => {
  // Adding a nav item and forgetting this file should cost it a heading, not
  // its place in the menu.
  const stray = { id: 'brandNew', label: 'Brand New', description: 'x', icon: null };
  const grouped = groupNavItems([...navItems, stray]);
  assert.ok(ids(grouped).includes('brandNew'));
  assert.equal(grouped[grouped.length - 1].label, '');
});

test('an empty menu produces no groups rather than three empty ones', () => {
  assert.deepEqual(groupNavItems([]), []);
});

test('every id the groups name is a real screen', () => {
  const real = new Set(navItems.map((i) => i.id));
  for (const group of NAV_GROUPS) {
    for (const id of group.members) {
      assert.ok(real.has(id), `${id} in group ${group.id} is not a nav id`);
    }
  }
});

test('items keep their order inside a group', () => {
  const grouped = groupNavItems(navItems);
  assert.deepEqual(grouped.find((g) => g.label === 'Test').items.map((i) => i.id), ['speedDate', 'history', 'agent']);
});
