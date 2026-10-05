// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Every screen has one h1 and sits in a main landmark, so a screen reader can
 * jump to it. The audit found no h1 on any of 236 views, and no main element
 * in Simple Mode at all.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');

test('Simple Mode is a main landmark with an h1 naming the step', () => {
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /<main className="sw-content">\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<h1 className="sr-only">RigMatch Simple Mode, step \{stepIndex \+ 1\}/);
  assert.equal((wizard.match(/<h1\b/g) ?? []).length, 1, 'one h1');
});

test('Advanced Mode names the screen in an h1 inside its main', () => {
  const app = read('../src/App.tsx');
  const main = app.slice(app.indexOf('<main className="stage-content">'), app.indexOf('</main>'));
  assert.match(main, /<h1 className="sr-only">RigMatch Advanced Mode: \{TOP_TABS\.find/);
});
