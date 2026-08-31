// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { LINEUP_STRIP_SCREENS, navItems, SIMPLE_NAV_ORDER } = await import('../src/lib/appConfig.ts');

/**
 * The Speed Dating lineup strip is 172px tall and used to sit under every
 * Advanced screen except Comparison. Measured at 1280x800 the shell gives the
 * content stage 318px, so the strip was taking a third of the window on
 * screens that cannot use it: Scorecards was reading 1057px of content through
 * a 60px slot with "Dating Game Setup" parked underneath.
 *
 * Dropping it where it does not belong took the stage from 318px to 549px.
 */

test('the lineup strip only appears where a lineup is assembled', () => {
  assert.deepEqual([...LINEUP_STRIP_SCREENS].sort(), ['models', 'whatsNew']);
});

test('it is gone from the screens that cannot use it', () => {
  for (const id of ['history', 'agent', 'lan', 'activity', 'settings']) {
    assert.ok(!LINEUP_STRIP_SCREENS.includes(id), `${id} should not carry the lineup strip`);
  }
});

test('Comparison never carries it — it has its own copy inline', () => {
  assert.ok(!LINEUP_STRIP_SCREENS.includes('speedDate'));
});

test('every screen it names is a real screen', () => {
  // A typo here would silently hide the strip everywhere rather than erroring.
  const ids = new Set(navItems.map((item) => item.id));
  for (const id of LINEUP_STRIP_SCREENS) {
    assert.ok(ids.has(id), `${id} is not a nav id`);
  }
});

test('the screens it names are reachable in Simple Mode order too', () => {
  // Simple Mode does not show the strip at all, but a screen that exists only
  // in Advanced would make the rule harder to reason about later.
  assert.ok(SIMPLE_NAV_ORDER.includes('models'));
});
