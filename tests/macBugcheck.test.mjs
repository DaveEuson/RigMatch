// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tiersThatFit, tierNeedsGb, RIG_TIERS } = await import('../src/lib/rigScore.ts');
const { tierAvailability, tooBigText } = await import('../src/lib/rigScoreRun.ts');
const { planTiers, formatIntro } = await import('../cli/measure.ts');
const { flaggedHardware, parseVramFlag, describeHardware, ollamaUrl } = await import('../cli/fitCheck.ts');
const { enduranceVerdict, ENDURANCE_STAGES } = await import('../src/lib/contextEndurance.ts');
const { loadOpenRouterKey, saveOpenRouterKey } = await import('../src/lib/openRouterKey.ts');
const { createSecretStore } = require('../electron/secretStore.cjs');

/**
 * What a full bug check of rigmatch-fit 0.11.2 on an Apple M4 with 16 GB
 * (2026-11-19) found that was new. The Ctrl+C one is in fitEndurance.test.mjs,
 * beside the other Ctrl+C tests.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const mac16 = { gpu: 'Apple M4', vramGb: 16, unifiedMemory: true, ramGb: 16, platform: 'darwin', arch: 'arm64', source: 'detected' };

test('a Mac is offered the speed test tiers its memory can give a model, not all four', () => {
  // --measure told this 16 GB Mac to download qwen3:30b-a3b, 17.7 GB, which its own fit grade calls too big.
  assert.deepEqual(tiersThatFit(16, true).map((tier) => tier.id), ['light', 'standard', 'heavy']);
  assert.deepEqual(tiersThatFit(8, true).map((tier) => tier.id), ['light', 'standard']);
  assert.deepEqual(tiersThatFit(24, true).map((tier) => tier.id), ['light', 'standard', 'heavy'], 'Extreme needs 26 GB of shared memory');
  assert.deepEqual(tiersThatFit(32, true).map((tier) => tier.id), ['light', 'standard', 'heavy', 'extreme']);
  assert.deepEqual(tiersThatFit(0, true).map((tier) => tier.id), RIG_TIERS.map((tier) => tier.id), 'memory nobody could read still offers every tier');
  assert.deepEqual(tiersThatFit(12).map((tier) => tier.id), ['light', 'standard', 'heavy'], 'a graphics card is unchanged');
  assert.equal(tierNeedsGb(RIG_TIERS[3], true), 26);
  assert.equal(tierNeedsGb(RIG_TIERS[3]), 24);

  const extreme = tierAvailability(RIG_TIERS[3], { vramGb: 16, isUnifiedMemory: true }, []);
  assert.deepEqual(extreme, { kind: 'too-big', needGb: 26, haveGb: 16, shared: true });
  assert.equal(tooBigText(extreme), 'Not run: needs 26 GB of shared memory, and this computer has 16 GB.');
  const intro = formatIntro(mac16, planTiers(mac16, ['llama3.2:3b']));
  assert.match(intro, /Extreme \(qwen3:30b-a3b\) is not run: needs 26 GB of shared memory, and this computer has 16 GB\./);
  assert.doesNotMatch(intro, /ollama pull qwen3:30b-a3b/);
});

test('--vram keeps a Mac a Mac, and refuses an empty or impossible size', () => {
  // "--vram 16" made this Mac "A 16 GB graphics card", graded about 4.7 times faster than detected.
  const common = { platform: 'darwin', arch: 'arm64' };
  const mac = flaggedHardware(16, mac16, common, 16);
  assert.equal(mac.gpu, 'Apple M4');
  assert.equal(mac.unifiedMemory, true);
  assert.equal(mac.source, 'flag');
  assert.equal(describeHardware(flaggedHardware(32, mac16, common, 16)), 'Apple M4, 32 GB shared memory, 32 GB system memory');
  const pc = flaggedHardware(16, null, { platform: 'win32', arch: 'x64' }, 32);
  assert.deepEqual([pc.gpu, pc.unifiedMemory], ['A 16 GB graphics card', false]);
  assert.equal(flaggedHardware(0, mac16, common, 16).noGpu, true, '0 is still no graphics card');

  assert.equal(parseVramFlag('12'), 12);
  assert.equal(parseVramFlag('0'), 0);
  assert.equal(parseVramFlag('1024'), 1024);
  for (const bad of ['', '  ', '99999', '-1', 'twelve', 'NaN']) {
    assert.throws(() => parseVramFlag(bad), /--vram takes a number of GB from 0 to 1024/, JSON.stringify(bad));
  }
});

/** A stage as the runner reads it, near the real llama3.2:3b on that Mac. */
const stage = (at, writingTps, extra = {}) => ({
  ...ENDURANCE_STAGES[at], status: 'ok', promptTokens: ENDURANCE_STAGES[at].targetTokens, writingTps, readingTps: 400, loadSeconds: 0,
  gpuShare: 1, contextReported: ENDURANCE_STAGES[at].numCtx, contextShort: false, passkeyKept: true, sizeOk: true, feels: 'Fast', ...extra,
});
const at16k = (share, options) => enduranceVerdict([stage(0, 40), stage(1, 40 * 0.8), stage(2, 40 * share)], options);

test('a reading near the endurance line says the same thing either side of it', () => {
  // gemma4 kept 54% at 16K one day and 57% the next, and llama3.2:3b 53%: with
  // a 55% line the headline flipped between "Slows down" and "Holds up".
  const said = [0.53, 0.54, 0.57].map((share) => at16k(share));
  assert.deepEqual(said.map((verdict) => verdict.kind), ['holds', 'holds', 'holds']);
  for (const verdict of said) assert.equal(verdict.headline, 'Holds up to 16K on your card, writing a little slower');
  assert.equal(at16k(0.75).headline, 'Holds up to 16K on your card', 'well above the line, nothing is added');
  const slow = at16k(0.45);
  assert.deepEqual([slow.kind, slow.headline], ['slows', 'Slows down past 8K']);
});

test('on shared memory the endurance verdict says GPU and this computer, not graphics card', () => {
  const held = at16k(0.75, { sharedMemory: true });
  assert.equal(held.headline, 'Holds up to 16K on this computer');
  assert.match(held.detail, /The whole model stays on the GPU\./);
  const spilled = enduranceVerdict([stage(0, 40), stage(1, 38), stage(2, 36, { gpuShare: 0.8 })], { sharedMemory: true });
  assert.equal(spilled.headline, 'Part of the model moves to the processor past 8K');
  assert.match(spilled.detail, /Only 80% of the model fits on the GPU there; the rest runs on the processor\./);
  assert.doesNotMatch(JSON.stringify([held, spilled]), /graphics card|your card/);
  assert.match(at16k(0.75).detail, /The whole model stays on the graphics card\./, 'a PC is unchanged');
});

const runCli = (args, env = {}) => new Promise((resolve) => {
  execFile(process.execPath, [join(root, 'cli', 'rigmatch-fit.ts'), ...args], { cwd: root, env: { ...process.env, OLLAMA_HOST: '127.0.0.1:9', ...env }, timeout: 30_000 }, (error, stdout, stderr) => {
    resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
  });
});

test('the command line says what went wrong in its own words, and in JSON when JSON was asked for', async () => {
  const unknown = await runCli(['--nope']);
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stderr.trim(), 'rigmatch-fit: rigmatch-fit has no option --nope. rigmatch-fit --help lists them.');
  assert.doesNotMatch(unknown.stderr, /positional argument/, "not Node's own parser message");

  const json = await runCli(['--json', '--vram', '']);
  assert.equal(json.code, 1);
  assert.equal(json.stderr, '');
  assert.match(JSON.parse(json.stdout).error, /^--vram takes a number of GB from 0 to 1024/);

  const host = await runCli(['--installed'], { OLLAMA_HOST: 'not_a_host:xx' });
  assert.equal(host.code, 1);
  assert.match(host.stderr, /OLLAMA_HOST is "not_a_host:xx", which is not an address/);
  assert.throws(() => ollamaUrl('not_a_host:xx'), /not an address/);
  assert.equal(ollamaUrl('box.lan:11500'), 'http://box.lan:11500', 'a real port still works');
});

/** Electron's safeStorage, for a test: reversible, and plainly not the text. */
const fakeSafeStorage = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (text) => Buffer.from(`enc:${[...text].reverse().join('')}`),
  decryptString: (buffer) => [...buffer.toString().replace(/^enc:/, '')].reverse().join(''),
});

test('the OpenRouter key is kept encrypted, and only under its own name', () => {
  const folder = mkdtempSync(join(tmpdir(), 'rigmatch-secrets-'));
  try {
    const file = join(folder, 'secrets.json');
    const store = createSecretStore({ file, safeStorage: fakeSafeStorage() });
    assert.deepEqual(store.read('openrouter-key'), { available: true, value: '' });
    assert.deepEqual(store.write('openrouter-key', '  sk-or-test-123  '), { available: true });
    assert.deepEqual(store.read('openrouter-key'), { available: true, value: 'sk-or-test-123' });
    assert.doesNotMatch(readFileSync(file, 'utf8'), /sk-or-test-123/, 'not written as text');
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    store.write('openrouter-key', '');
    assert.deepEqual(store.read('openrouter-key'), { available: true, value: '' }, 'an empty key removes it');
    assert.throws(() => store.read('hf-token'), /No secret is kept under "hf-token"/);
    assert.throws(() => store.write('../../etc', 'x'), /No secret is kept/);

    const none = createSecretStore({ file, safeStorage: fakeSafeStorage(false) });
    assert.deepEqual(none.write('openrouter-key', 'sk-or-test-123'), { available: false }, 'no keyring: nothing is written');
    assert.deepEqual(none.read('openrouter-key'), { available: false, value: '' });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** The page's local storage, and the bridge to the store above. */
function fakePage({ legacy = '', available = true } = {}) {
  const local = new Map(legacy ? [['rigmatch:openrouter-key:v1', legacy]] : []);
  const storage = { getItem: (key) => local.get(key) ?? null, setItem: (key, value) => local.set(key, value), removeItem: (key) => local.delete(key) };
  const folder = mkdtempSync(join(tmpdir(), 'rigmatch-secrets-'));
  const store = createSecretStore({ file: join(folder, 'secrets.json'), safeStorage: fakeSafeStorage(available) });
  const bridge = { get: async (name) => store.read(name), set: async (name, value) => store.write(name, value) };
  return { local, storage, bridge, store, done: () => rmSync(folder, { recursive: true, force: true }) };
}

test('a key already in local storage moves to the encrypted store, and stays put where there is none', async () => {
  const page = fakePage({ legacy: 'sk-or-old-456' });
  try {
    assert.deepEqual(await loadOpenRouterKey(page.bridge, page.storage), { value: 'sk-or-old-456', place: 'secure' });
    assert.equal(page.local.size, 0, 'gone from local storage');
    assert.deepEqual(page.store.read('openrouter-key'), { available: true, value: 'sk-or-old-456' });
    assert.equal(await saveOpenRouterKey(page.bridge, page.storage, 'secure', 'sk-or-new-789'), 'secure');
    assert.deepEqual([page.store.read('openrouter-key').value, page.local.size], ['sk-or-new-789', 0]);
    await saveOpenRouterKey(page.bridge, page.storage, 'secure', '');
    assert.equal(page.store.read('openrouter-key').value, '', 'cleared');
  } finally {
    page.done();
  }

  const linux = fakePage({ legacy: 'sk-or-old-456', available: false });
  try {
    assert.deepEqual(await loadOpenRouterKey(linux.bridge, linux.storage), { value: 'sk-or-old-456', place: 'local' });
    assert.equal(linux.local.get('rigmatch:openrouter-key:v1'), 'sk-or-old-456', 'kept where it was, not lost');
    assert.equal(await saveOpenRouterKey(linux.bridge, linux.storage, 'local', 'sk-or-new-789'), 'local');
    assert.equal(linux.local.get('rigmatch:openrouter-key:v1'), 'sk-or-new-789');
  } finally {
    linux.done();
  }

  const browser = fakePage({ legacy: 'sk-or-old-456' });
  try {
    assert.deepEqual(await loadOpenRouterKey(undefined, browser.storage), { value: 'sk-or-old-456', place: 'local' }, 'no bridge (the page outside Electron)');
  } finally {
    browser.done();
  }
});
