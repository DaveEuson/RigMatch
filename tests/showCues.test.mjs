// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The redesign's sound rule: two switches, both off by default. Show effects
 * covers the short cues, Theme music the loop. Before this, the run jingles
 * and a test's "done" chime played for everyone, switches or not.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');

let contexts = 0;
globalThis.window = {
  AudioContext: class {
    constructor() {
      contexts += 1;
      // Counting is all this test needs; a real graph is not built.
      throw new Error('no audio in tests');
    }
  },
  setTimeout,
};

const { playCue, playJingle } = await import('../src/lib/sound.ts');
const { setShowExtras } = await import('../src/lib/showExtras.ts');
const { CUE_SECONDS } = await import('../src/lib/showTheme.ts');

test('no cue makes a sound with Show effects off, which is the default', () => {
  for (const cue of Object.keys(CUE_SECONDS)) playCue(cue);
  playJingle('test-complete');
  playJingle('its-a-match');
  assert.equal(contexts, 0);
});

test('with Show effects on, a cue reaches the synth', () => {
  setShowExtras({ effects: true });
  assert.throws(() => playCue('sting'), /no audio in tests/);
  assert.equal(contexts, 1);
  setShowExtras({ effects: false });
});

test('the cues are the sound brief\'s, at its lengths', () => {
  assert.deepEqual(CUE_SECONDS, { curtain: 0.6, sting: 0.4, jingle: 0.9, applause: 1.6, buzz: 0.35, fanfare: 2.7 });
});

test('every cue goes through the switch: nothing calls the synth around it', () => {
  // Music (start, winner, sad) belongs to useShowTheme, which the music switch
  // drives. The effect cues and the romance are only ever called from sound.ts.
  const app = read('../src/App.tsx');
  assert.doesNotMatch(app, /playDoneJingle/);
  assert.doesNotMatch(read('../src/lib/modelCatalog.ts'), /AudioContext/);
  for (const file of ['../src/App.tsx', '../src/components/dialogs.tsx', '../src/components/TrojanReveal.tsx', '../src/components/SimpleWizard.tsx']) {
    assert.doesNotMatch(read(file), /showTheme\.(cue|romance)\(/, `${file} plays a cue around the switch`);
  }
  // Where the cues fire.
  assert.match(app, /setIsListTesting\(true\);\n\s*playCue\('curtain'\);/);
  assert.match(app, /Model download failed[^\n]*\n\s*playCue\('buzz'\);/);
  assert.match(app, /The test stopped[^\n]*\n\s*playCue\('buzz'\);/);
});

test('the Trojan hero gets the reveal and the fanfare; other badges get the sting', () => {
  const reveal = read('../src/components/TrojanReveal.tsx');
  assert.match(reveal, /if \(fresh\.includes\('trojan-hero'\)\) setPending/);
  assert.match(reveal, /if \(pending\.reveal\) setReveal\(true\);\n\s*else playCue\('sting'\);/);
  assert.match(reveal, /playCue\('fanfare'\)/);
  assert.match(reveal, />Take a bow</);
  // Badges found as the app opens are recorded as seen, and stay quiet.
  assert.match(reveal, /!state\.seen\.includes\(id\)/);
  // Never mid-run: Ajax finishing first in a lineup must not cover the show.
  assert.match(reveal, /if \(busy \|\| \(!pending\.reveal && !pending\.sting\)\) return;/);
  assert.match(read('../src/App.tsx'), /<AchievementCues busy=\{isBenchmarking \|\| isListTesting\} \/>/);
});
