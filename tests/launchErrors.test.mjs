import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { launchComfy } = require('../electron/comfyLaunch.cjs');
const { companionLaunchMessage } = await import('../src/lib/companionLaunch.ts');

test('a launcher that cannot run is an error to report, not a crash', { skip: process.platform === 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-launch-'));
  const script = path.join(dir, 'run.sh');
  fs.writeFileSync(script, '#!/bin/sh\nexit 0\n', { mode: 0o644 });
  try {
    await assert.rejects(launchComfy(script), /Could not start .*run\.sh/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a companion that would not start says so and how to fix it', () => {
  const text = companionLaunchMessage({ ok: false, reason: 'spawn-failed', detail: 'spawn EACCES' });
  assert.match(text, /would not start/);
  assert.match(text, /EACCES/);
  assert.match(text, /chmod \+x/);
});
