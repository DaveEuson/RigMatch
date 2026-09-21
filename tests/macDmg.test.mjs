// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const productApp = `${pkg.build.productName ?? pkg.productName ?? 'RigMatch'}.app`;

/**
 * An app in the DMG other than RigMatch itself has to say where it comes from.
 *
 * electron-builder fills a missing dmg.contents path with the main app. The
 * "RigMatch Chat.app" entry had a name and no path, so every Mac DMG before
 * 0.9.0 carried RigMatch twice: 250 MB where the app zips to 125, and a Mac user
 * who dragged "RigMatch Chat" to Applications got a second RigMatch. Nothing
 * failed, which is why it lasted from 0.1.8 to here.
 */
test('every extra app in the DMG names its own source', () => {
  const extras = (pkg.build.dmg?.contents ?? [])
    .filter((entry) => entry.type === 'file' && entry.name && entry.name !== productApp);
  assert.ok(extras.length > 0, 'the DMG no longer offers RigMatch Chat.app — was that intended?');
  for (const entry of extras) {
    assert.ok(entry.path, `${entry.name} has no path, so electron-builder would put RigMatch there instead`);
    assert.ok(entry.path.endsWith(`/${entry.name}`), `${entry.name} is taken from ${entry.path}, a different app`);
  }
});

test('the DMG takes RigMatch Chat from where afterPack signs it', () => {
  // Apple silicon refuses unsigned code, so the copy in the DMG has to be the
  // one afterPack ad-hoc signed, not a sibling that nothing signed.
  const chat = pkg.build.dmg.contents.find((entry) => entry.name === 'RigMatch Chat.app');
  const afterPack = readFileSync(new URL('../scripts/afterPack.cjs', import.meta.url), 'utf-8').replace(/\s+/g, ' ');
  const signed = chat.path.split('/').map((part) => `'${part}'`).join(', ');
  assert.ok(afterPack.includes(signed), `afterPack does not build the path ${chat.path} it would need to sign`);
  assert.match(afterPack, /adhocSign\(chatApp, /, 'afterPack must sign the Chat bundle the DMG reads');
});
