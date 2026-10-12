import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { buildFeedbackUrl } = await import('../src/lib/feedback.ts');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

const system = {
  platform: 'linux',
  arch: 'x64',
  os: { distro: 'Pop!_OS', release: '24.04' },
  gpu: { model: 'NVIDIA GeForce RTX 4070', vramGb: 12.0 },
  memory: { totalGb: 59.6 },
  storage: { availableGb: 1100 },
  cpu: { brand: 'Ryzen' },
};

test('the feedback form opens a GitHub issue, labelled, with the Top Match and the setup', () => {
  const url = new URL(buildFeedbackUrl(system, { model: 'qwen2.5:7b', scoreLabel: '92.7', grade: 'A', ollamaVersion: '0.35.1' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/DaveEuson/RigMatch/issues/new');
  assert.equal(url.searchParams.get('labels'), 'feedback');
  assert.match(url.searchParams.get('title'), /^Feedback \[v\d+\.\d+\.\d+\]$/);
  const body = url.searchParams.get('body');
  assert.match(body, /crowned \*\*qwen2\.5:7b\*\* \(92\.7, grade A\)/);
  assert.match(body, /Pop!_OS 24\.04 \(linux x64\)/);
  assert.match(body, /GPU: NVIDIA GeForce RTX 4070 · 12 GB VRAM/);
  assert.match(body, /RAM: 60 GB/);
  assert.match(body, /Ollama v0\.35\.1/);
  assert.match(body, /Delete this line if you would rather not share your setup/);
});

test('it carries nothing the person did not see: no log path, no host name', () => {
  const body = new URL(buildFeedbackUrl(system)).searchParams.get('body');
  assert.doesNotMatch(body, /Log:|hostname|\/home\/|C:\\\\/i);
  assert.doesNotMatch(body, /crowned/, 'with no Top Match it must not claim one');
});

test('the link sits on the Winner screen and in Settings, and says nothing is sent from the app', () => {
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /buildFeedbackUrl\(system, \{ model: winner\.model/);
  assert.match(wizard, /Nothing is sent until you press Submit there/);
  const panel = read('../src/components/UtilityPanel.tsx');
  assert.match(panel, /buildFeedbackUrl\(system, \{ ollamaVersion: ollama\.version \}\)/);
});
