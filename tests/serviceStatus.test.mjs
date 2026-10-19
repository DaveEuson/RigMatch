// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONNECTION_WORDS,
  comfyConnection,
  comfyDoctorRow,
  comfyDotTitle,
  comfyRequirements,
  localAiDoctor,
} from '../src/lib/serviceStatus.ts';
import { COMFY_FOUND_URL_STORAGE_KEY, COMFY_URL_STORAGE_KEY, comfyFoundBefore } from '../src/lib/comfySettings.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const look = (overrides) => ({ checked: true, reachable: false, folder: '', known: false, ...overrides });
const words = (overrides) => CONNECTION_WORDS[comfyConnection(look(overrides))];

test('the ComfyUI dot says "not found" once RigMatch has looked, not "not checked"', () => {
  // Dave's 0.9.8: grey dot, "not checked", on a PC RigMatch had already looked on.
  assert.equal(words({}), 'not found');
  assert.equal(words({ folder: 'D:\\ComfyUI\\models' }), 'not answering');
  assert.equal(words({ reachable: true }), 'connected');
  // Before the first look comes back there is nothing to report yet.
  assert.equal(words({ checked: false }), 'checking');
  assert.notEqual(comfyConnection(look({})), 'untested');
});

test('a stopped ComfyUI that answered before is not answering, not missing, with or without a folder', () => {
  // People who start their own ComfyUI or ComfyUI Desktop never pick a folder.
  assert.equal(words({ known: true }), 'not answering');
  const row = comfyDoctorRow({ ...look({ known: true }), pictureModels: 0, queue: 0, platform: 'win32', arch: 'x64' });
  assert.equal(row.kind, 'not-running');
  assert.equal(row.value, 'Not running');
  assert.match(row.detail, /Start it the way you normally do/);
  assert.doesNotMatch(row.detail, /5 GB/);
});

test('an address RigMatch found or was given counts as set up; nothing stored does not', () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } };
  try {
    assert.equal(comfyFoundBefore(), false);
    store.set(COMFY_FOUND_URL_STORAGE_KEY, 'http://127.0.0.1:8000');
    assert.equal(comfyFoundBefore(), true);
    store.clear();
    store.set(COMFY_URL_STORAGE_KEY, 'http://127.0.0.1:8190');
    assert.equal(comfyFoundBefore(), true);
    // A stored 8188 is the old field's leftover default, not a choice.
    store.set(COMFY_URL_STORAGE_KEY, 'http://127.0.0.1:8188');
    assert.equal(comfyFoundBefore(), false);
  } finally {
    delete globalThis.window;
  }
});

test('the ComfyUI tooltip says where to go about a missing or stopped ComfyUI', () => {
  assert.equal(comfyDotTitle('missing'), 'ComfyUI: not found. Open My PC to get it');
  assert.equal(comfyDotTitle('down'), 'ComfyUI: not answering. Open My PC to start it');
  assert.equal(comfyDotTitle('ok'), 'ComfyUI: connected');
});

test('My PC tells ready, busy, stopped and missing ComfyUI apart', () => {
  const folder = 'D:\\ComfyUI\\models';
  const row = (overrides) => comfyDoctorRow({ ...look(overrides), pictureModels: 0, queue: 0, platform: 'win32', arch: 'x64', ...overrides });

  const ready = row({ reachable: true, folder, pictureModels: 2 });
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.value, 'Ready');
  assert.match(ready.detail, /2 picture models/);
  assert.match(row({ reachable: true, pictureModels: 1 }).detail, /1 picture model\./);

  const busy = row({ reachable: true, folder, pictureModels: 2, queue: 3 });
  assert.equal(busy.kind, 'busy');
  assert.match(busy.detail, /3 jobs in its queue/);

  assert.equal(row({ reachable: true }).kind, 'no-model');
  assert.equal(row({ checked: false }).kind, 'checking');

  const stopped = row({ folder });
  assert.equal(stopped.kind, 'not-running');
  assert.match(stopped.detail, /^Set up on this PC/);

  const missing = row({});
  assert.equal(missing.kind, 'not-found');
  assert.equal(missing.value, 'Not found');
  assert.match(missing.detail, /separate free program of about 5 GB/);
  assert.ok(missing.detail.endsWith(comfyRequirements('win32', 'x64')));
});

test('the requirements are said for each kind of computer, in Simple Mode and on My PC alike', () => {
  assert.equal(comfyRequirements('win32', 'x64'), 'It runs best with an NVIDIA or AMD graphics card.');
  assert.equal(comfyRequirements('darwin', 'arm64'), 'On a Mac it needs Apple silicon and macOS 13 or later.');
  assert.match(comfyRequirements('darwin', 'x64'), /^ComfyUI Desktop needs a Mac with Apple silicon/);
  assert.match(comfyDoctorRow({ ...look({}), pictureModels: 0, queue: 0, platform: 'darwin', arch: 'x64' }).detail, /installed by hand/);

  // One source for the words: Simple Mode's steps and the Setup Doctor both call it.
  assert.match(read('../src/components/SimpleWizard.tsx'), /<p className="sw-muted">\{comfyRequirements\(platform, arch\)\}<\/p>/);
  const doctor = read('../src/components/SetupDoctor.tsx');
  assert.match(doctor, /comfyDoctorRow\(/);
  assert.match(doctor, /comfyRow\.kind === 'not-found' && <GetComfyLink \/>/);
  // A Start button needs a folder to find the launcher beside.
  assert.match(doctor, /comfyRow\.kind === 'not-running' && comfy\.folder && <ComfyStartButton folder=\{comfy\.folder\} \/>/);
});

test('Setup Doctor counts LM Studio and installed models, not the catalog', () => {
  const none = { ready: false, models: 0 };

  // Only LM Studio running: ready, as the top bar and Simple Mode already say.
  const lmOnly = localAiDoctor({ ollama: none, lmStudio: { ready: true, models: 3 } });
  assert.equal(lmOnly.headline, 'Ready for local model tests');
  assert.equal(lmOnly.ollama.value, 'Not running');
  assert.equal(lmOnly.ollama.tone, 'info');
  assert.equal(lmOnly.pool.value, 'Contestants ready');
  assert.equal(lmOnly.pool.detail, '3 installed models ready to test.');
  assert.equal(lmOnly.pool.check, false);

  const both = localAiDoctor({ ollama: { ready: true, models: 5 }, lmStudio: { ready: true, models: 1 } });
  assert.equal(both.ollama.detail, '5 installed models visible.');
  assert.equal(both.pool.detail, '6 installed models ready to test.');

  const nothing = localAiDoctor({ ollama: none, lmStudio: none });
  assert.equal(nothing.headline, 'One setup step before the show starts');
  assert.equal(nothing.ollama.value, 'Needs setup');
  assert.equal(nothing.pool.value, 'No local models');
  assert.equal(nothing.pool.check, true);

  // The catalog length no longer reaches the doctor.
  assert.doesNotMatch(read('../src/App.tsx'), /modelCount=\{modelRows\.length\}/);
});

test('the services pill opens Overview and brings the ComfyUI row into view without moving the top bar', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /comfy: comfyConnection\(\{ checked: comfyChecked, reachable: comfyReachable, folder: comfySettings\.folder, known: comfyKnown \}\)/);
  // Left on Logs, the pill opened the log and the focus scrolled a later visit.
  assert.match(app, /selectNav\('lan'\);[\s\S]{0,200}?setMyPcView\('overview'\);\s*setFocusComfy\(true\);/);
  const lan = read('../src/components/LanBrowser.tsx');
  assert.match(lan, /\[data-doctor-row="ComfyUI"\]/);
  assert.doesNotMatch(lan, /\.scrollIntoView\(/, 'scrollIntoView scrolls the shell too');
});
