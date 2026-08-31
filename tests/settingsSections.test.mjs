// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const { SETTINGS_SECTIONS, buildSettingsRail } = await import('../src/lib/settingsSections.ts');

/**
 * Settings was seven accordions in a two-thousand-pixel column: closed they
 * named a section without saying what it held, open they pushed the rest off
 * the screen. The rail is the contents list, and the thing that makes it worth
 * the width is the current value beside each entry.
 */

test('every section the panel renders is offered in the rail', () => {
  const rail = buildSettingsRail({}, { advanced: true });
  assert.deepEqual(rail.map((s) => s.id), SETTINGS_SECTIONS.map((s) => s.id));
});

test('Simple Mode is not shown a section Simple Mode cannot use', () => {
  const rail = buildSettingsRail({}, { advanced: false });
  assert.ok(!rail.some((s) => s.id === 'advanced'));
  assert.ok(rail.some((s) => s.id === 'interface'));
});

test('a supplied status rides along with its section', () => {
  const rail = buildSettingsRail({ providers: 'Ollama v0.30.10' }, { advanced: true });
  assert.equal(rail.find((s) => s.id === 'providers').status, 'Ollama v0.30.10');
});

test('a section with nothing true to say gets no status line', () => {
  // Rather than "Configured" or "Ready", which is filler wearing the clothes
  // of information — the reader would learn nothing and click anyway.
  const rail = buildSettingsRail({ providers: 'Ollama v0.30.10' }, { advanced: true });
  assert.equal(rail.find((s) => s.id === 'support').status, null);
  assert.equal(rail.find((s) => s.id === 'generation').status, null);
});

test('an empty or blank status counts as nothing to say', () => {
  const rail = buildSettingsRail({ storage: '', updates: '   ' }, { advanced: true });
  assert.equal(rail.find((s) => s.id === 'storage').status, null);
  assert.equal(rail.find((s) => s.id === 'updates').status, null);
});

test('a status is trimmed rather than rendered with its padding', () => {
  const rail = buildSettingsRail({ interface: '  Simple Mode · Stage Plum  ' }, { advanced: true });
  assert.equal(rail.find((s) => s.id === 'interface').status, 'Simple Mode · Stage Plum');
});

test('null and undefined are both "no status", not "null"', () => {
  const rail = buildSettingsRail({ storage: null, updates: undefined }, { advanced: true });
  assert.equal(rail.find((s) => s.id === 'storage').status, null);
  assert.equal(rail.find((s) => s.id === 'updates').status, null);
});

test('the rail carries the eyebrow and title the accordion shows', () => {
  // Both are rendered from this one array, so a section cannot be called one
  // thing in the contents list and another where it lands.
  const rail = buildSettingsRail({}, { advanced: true });
  const storage = rail.find((s) => s.id === 'storage');
  assert.equal(storage.eyebrow, 'Storage');
  assert.equal(storage.title, 'The Closet');
});

test('exactly one section is marked advanced-only', () => {
  const advancedOnly = SETTINGS_SECTIONS.filter((s) => s.advancedOnly);
  assert.deepEqual(advancedOnly.map((s) => s.id), ['advanced']);
});
