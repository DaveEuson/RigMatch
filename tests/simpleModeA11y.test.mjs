// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Simple Mode's accessibility fixes from the 0.9.0 audit (WCAG 2.1 AA, run in
 * the real app with axe-core, a keyboard walk and 200%/400% zoom).
 *
 * Each of these was a markup or stylesheet detail that no unit test reached and
 * that looked fine to the eye, which is how they shipped. They are checked in
 * the source because that is where they break again.
 */

const tsx = readFileSync(new URL('../src/components/SimpleWizard.tsx', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../src/components/SimpleWizard.css', import.meta.url), 'utf-8');
const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf-8');
const splash = readFileSync(new URL('../src/components/FirstRunSplash.tsx', import.meta.url), 'utf-8');

test('the step labels are never removed from the accessibility tree', () => {
  // display: none hid the label from screen readers as well as from view, and
  // the number beside it is aria-hidden, so at 1280px and below every step
  // button had no name at all.
  assert.doesNotMatch(css, /\.sw-step-label\s*\{[^}]*display:\s*none/);
  assert.match(tsx, /<span className="sw-step-label">\{STEP_LABELS\[id\]\}<\/span>/);
});

test('every Pick button says which model it picks', () => {
  // Nine buttons all named "♥ Pick". The name follows the visible words, so a
  // voice user can still say what they see.
  assert.match(tsx, /Pick<span className="sr-only"> \{model\.name\}<\/span>/);
  assert.match(tsx, /Click to remove<span className="sr-only"> \{model\.name\}<\/span>/);
  assert.match(tsx, /<span aria-hidden="true">♥ <\/span>/, 'the heart glyph is read aloud as a word');
});

test('the running show and the hardware check speak through live regions', () => {
  assert.match(tsx, /<p className="sr-only" role="status">\{announcement\}<\/p>/);
  assert.match(tsx, /role="status">\s*\{isScanning/);
});

test('the pick, running and winner screens have headings', () => {
  assert.match(tsx, /<h2 className="sr-only">Pick your contestants<\/h2>/);
  assert.match(tsx, /<h3>\{model\.name\}<\/h3>/);
  assert.match(tsx, /<h2>\{plainRoundLabel\}<\/h2>/);
  assert.match(tsx, /<h2>\{getFriendlyModelName\(winner\.model\)\}<\/h2>/);
  assert.match(tsx, /<h3 className="sw-eyebrow">How the lineup finished<\/h3>/);
});

test('the wizard shell can shrink to a 320px window', () => {
  // With an auto column the widest thing on the Pick step set the width of the
  // whole shell at 400% zoom, and overflow: hidden cut the rest off.
  assert.match(css, /\.sw-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('goal explanations are not hover-only', () => {
  assert.match(splash, /aria-describedby=\{note \? noteId : undefined\}/);
  assert.match(splash, /<p className="goal-splash-nudge">\{COMFY_GOAL_NOTE\}<\/p>/);
});

const hex = (value) => [0, 2, 4].map((i) => parseInt(value.slice(1 + i, 3 + i), 16));
const luminance = (rgb) => {
  const c = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('"Skip tour" is readable at rest, not only on hover', () => {
  // It was #5a7080 on the tutorial's #11171b: 3.5:1, and it is the way out.
  const rest = appCss.match(/\.quiet-link\s*\{[^}]*?color:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(rest, '.quiet-link has no resting color to check');
  assert.ok(contrast(rest, '#11171b') >= 4.5, `${rest} on #11171b is ${contrast(rest, '#11171b').toFixed(2)}:1`);
});
