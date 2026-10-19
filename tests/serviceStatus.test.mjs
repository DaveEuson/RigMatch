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
} from '../src/lib/serviceStatus.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const words = (look) => CONNECTION_WORDS[comfyConnection(look)];

test('the ComfyUI dot says "not found" once RigMatch has looked, not "not checked"', () => {
  // Dave's 0.9.8: grey dot, "not checked", on a PC RigMatch had already looked on.
  assert.equal(words({ checked: true, reachable: false, folder: '' }), 'not found');
  assert.equal(words({ checked: true, reachable: false, folder: 'D:\\ComfyUI\\models' }), 'not answering');
  assert.equal(words({ checked: true, reachable: true, folder: '' }), 'connected');
  // Before the first look comes back there is nothing to report yet.
  assert.equal(words({ checked: false, reachable: false, folder: '' }), 'checking');
  assert.notEqual(comfyConnection({ checked: true, reachable: false, folder: '' }), 'untested');
});

test('the ComfyUI tooltip says where to go about a missing or stopped ComfyUI', () => {
  assert.equal(comfyDotTitle('missing'), 'ComfyUI: not found. Open My PC to get it');
  assert.equal(comfyDotTitle('down'), 'ComfyUI: not answering. Open My PC to start it');
  assert.equal(comfyDotTitle('ok'), 'ComfyUI: connected');
});

test('My PC tells ready, busy, stopped and missing ComfyUI apart', () => {
  const pc = { platform: 'win32', arch: 'x64' };
  const folder = 'D:\\ComfyUI\\models';
  const row = (look) => comfyDoctorRow({ checked: true, reachable: false, folder: '', pictureModels: 0, queue: 0, ...pc, ...look });

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
  assert.equal(stopped.value, 'Not running');

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
  assert.match(comfyDoctorRow({ checked: true, reachable: false, folder: '', pictureModels: 0, queue: 0, platform: 'darwin', arch: 'x64' }).detail, /installed by hand/);

  // One source for the words: Simple Mode's steps and the Setup Doctor both call it.
  assert.match(read('../src/components/SimpleWizard.tsx'), /<p className="sw-muted">\{comfyRequirements\(platform, arch\)\}<\/p>/);
  const doctor = read('../src/components/SetupDoctor.tsx');
  assert.match(doctor, /comfyDoctorRow\(/);
  assert.match(doctor, /comfyRow\.kind === 'not-found' && <GetComfyLink \/>/);
  assert.match(doctor, /comfyRow\.kind === 'not-running' && <ComfyStartButton folder=\{comfy\.folder\} \/>/);
});

test('the services pill brings the ComfyUI row into view without moving the top bar', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /comfy: comfyConnection\(\{ checked: comfyChecked, reachable: comfyReachable, folder: comfySettings\.folder \}\)/);
  assert.match(app, /selectNav\('lan'\);\s*setFocusComfy\(true\);/);
  const lan = read('../src/components/LanBrowser.tsx');
  assert.match(lan, /\[data-doctor-row="ComfyUI"\]/);
  assert.doesNotMatch(lan, /\.scrollIntoView\(/, 'scrollIntoView scrolls the shell too');
});
