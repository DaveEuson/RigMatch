// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The share buttons are plain <a target="_blank">, so Electron routes them
// through setWindowOpenHandler -> openExternalSafe, which drops any host not in
// ALLOWED_EXTERNAL_HOSTS. A host missing from that list makes the button do
// nothing at all. The LinkedIn button shipped that way.
//
// These read both files and compare them, so adding a share target without
// allowlisting it fails here instead of in someone's release.

const mainSource = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const shareSource = readFileSync(new URL('../src/components/ShareScorecard.tsx', import.meta.url), 'utf8');

function allowedHosts() {
  const block = mainSource.match(/const ALLOWED_EXTERNAL_HOSTS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(block, 'could not locate ALLOWED_EXTERNAL_HOSTS');
  // Drop the // comments before pairing quotes. One of them contains an
  // apostrophe ("what's OpenRouter"), which otherwise opens a phantom string and
  // desynchronizes every host read after it.
  const entries = block[1].replace(/\/\/[^\n]*/g, '');
  const hosts = new Set([...entries.matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase()));
  assert.ok(hosts.has('ollama.com'), 'host extraction is broken; it missed a known entry');
  return hosts;
}

/** Hosts of the https:// literals in the share-target list. */
function shareTargetHosts() {
  const block = shareSource.match(/const shareTargets[\s\S]*?\n {2}\];/);
  assert.ok(block, 'could not locate shareTargets');
  const hosts = [...block[0].matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  assert.ok(hosts.length >= 4, `expected the share buttons, found ${hosts.length}`);
  return hosts;
}

test('every share button targets an allowlisted host', () => {
  const allowed = allowedHosts();
  for (const host of shareTargetHosts()) {
    assert.ok(
      allowed.has(host),
      `${host} is used by a share button but missing from ALLOWED_EXTERNAL_HOSTS, so that button silently does nothing`,
    );
  }
});

test('linkedin is allowlisted', () => {
  // Regression: shipped without it, so the button was dead.
  assert.ok(allowedHosts().has('www.linkedin.com'));
});

test('a refused host is logged rather than dropped in silence', () => {
  const fn = mainSource.match(/function openExternalSafe\(url\) \{[\s\S]*?\n\}/);
  assert.ok(fn, 'could not locate openExternalSafe');
  assert.match(
    fn[0],
    /ALLOWED_EXTERNAL_HOSTS[\s\S]*?console\.warn/,
    'a blocked host must say so; a dead button with an empty log is undebuggable',
  );
});

test('openExternalSafe still refuses non-https and unparseable urls', () => {
  const fn = mainSource.match(/function openExternalSafe\(url\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /protocol !== 'https:'/);
  assert.match(fn, /new URL\(url\)/);
  // The allowlist check must gate the open, not merely precede it.
  assert.match(fn, /if \(!ALLOWED_EXTERNAL_HOSTS\.has\(host\)\) \{[\s\S]*?return;/);
});
