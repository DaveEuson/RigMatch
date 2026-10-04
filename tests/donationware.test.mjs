// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * RigMatch is donationware: every feature is free and nothing is locked. The
 * redesign once lost the only button that said so (it lived in the deleted
 * side menu), leaving the support dialog with nothing to open it, and Settings
 * still hinted that Advanced might become paid. These pin both.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');

test('the top bar has a Donate button in both modes, and it opens the support dialog', () => {
  const bar = read('../src/components/TopBar.tsx');
  const donate = bar.indexOf('className="top-bar-donate"');
  assert.ok(donate > 0, 'the top bar lost its Donate button');
  // Settings is Advanced only; Donate must not sit inside that condition.
  assert.ok(donate < bar.indexOf('{advanced && onOpenSettings && ('), 'Donate moved behind the Advanced-only Settings condition');
  assert.match(bar, /onClick=\{onOpenSupport\}/);
  const app = read('../src/App.tsx');
  assert.match(app, /onOpenSupport=\{\(\) => setSupportModalOpen\(true\)\}/, 'nothing opens the support dialog');
  assert.match(app, /<SupportModal onClose=/);
});

test('the support dialog says donating unlocks nothing', () => {
  const dialogs = read('../src/components/dialogs.tsx');
  const modal = dialogs.slice(dialogs.indexOf('export function SupportModal'), dialogs.indexOf('export function ClearDataModal'));
  assert.match(modal, /RigMatch is free\. All of it\./);
  assert.match(modal, /It unlocks nothing, because nothing is locked\./);
  assert.match(modal, /href=\{BUY_ME_A_COFFEE_URL\}/);
});

test('nothing in the app suggests a feature is, or will be, paid', () => {
  const dirs = ['../src/', '../src/components/', '../src/lib/', '../rigmatch-chat/src/'];
  const hint = /supporter (tools|experiments|features)|premium feature|pro version|paid tier|unlock (it|this|more) (with|by) (a )?donat/i;
  for (const dir of dirs) {
    for (const file of readdirSync(new URL(dir, import.meta.url)).filter((name) => /\.(ts|tsx)$/.test(name))) {
      assert.doesNotMatch(read(`${dir}${file}`), hint, `${dir}${file} hints at a paid feature`);
    }
  }
});
