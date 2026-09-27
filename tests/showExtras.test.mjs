// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readShowExtras } from '../src/lib/showExtras.ts';

/**
 * The theme song and the show effects are opt-in. The show's look is for
 * everyone; its noise and its bounce are for whoever switches them on. These
 * pin "off unless switched on" in every place it could leak, and the promises
 * the switches' own words make: nothing downloaded, nothing over a listening
 * round, nothing moving under reduced motion.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const wizard = read('../src/components/SimpleWizard.tsx');
const wizardCss = read('../src/components/SimpleWizard.css');
const appCss = read('../src/App.css');

test('both extras are off unless explicitly switched on', () => {
  assert.deepEqual(readShowExtras(null), { music: false, effects: false });
  assert.deepEqual(readShowExtras('not json'), { music: false, effects: false });
  assert.deepEqual(readShowExtras('null'), { music: false, effects: false });
  // "yes", 1 and "true" are not true.
  assert.deepEqual(readShowExtras('{"music":"yes","effects":1}'), { music: false, effects: false });
  assert.deepEqual(readShowExtras('{"music":true}'), { music: true, effects: false });
  assert.deepEqual(readShowExtras('{"music":true,"effects":true}'), { music: true, effects: true });
});

test('every effect is rendered only when effects are on', () => {
  // Each piece of show-effects scenery sits behind the switch.
  for (const [what, pattern] of [
    ['the curtains', /effects && \(\s*<div className="sw-curtains"/],
    ['the hearts', /effects && hearts > 0 && \(\s*<span key=\{hearts\} className="sw-heart-burst"/],
    ['the applause sign on the stage', /extras\.effects && <ApplauseSign lit=\{applause\} \/>/],
    ['the applause sign for the winner', /effects && <ApplauseSign lit \/>/],
    ['the walk-on', /extras\.effects \? 'sw-podiums walk-on' : 'sw-podiums'/],
    ['the winner flash', /<ShowMarquee framed flash=\{effects\} \/>/],
  ]) {
    assert.match(wizard, pattern, `${what} is no longer gated on the effects switch`);
  }
});

test('the music follows its switch, and never plays over a listening round', () => {
  assert.match(wizard, /useShowTheme\(musicState, extras\.music && props\.round !== 'listening'\)/);
  assert.match(wizard, /extras\.music && showRound !== 'listening'/, 'the bulbs dance with no music playing');
});

test('the theme is synthesized, not shipped', () => {
  // The Settings text promises no audio file and nothing downloaded.
  const theme = read('../src/lib/showTheme.ts');
  assert.doesNotMatch(theme, /^import /m, 'showTheme.ts started importing something — an audio file?');
  assert.doesNotMatch(theme, /fetch\(|new Audio\(|\.(mp3|ogg|wav|m4a)\b/);
});

test('every effect stands still under reduced motion', () => {
  const start = wizardCss.indexOf('@media (prefers-reduced-motion: reduce) {\n  /* The skeleton');
  const reduced = wizardCss.slice(start, wizardCss.indexOf('\n}\n', start));
  for (const selector of ['.sw-curtains', '.sw-heart-burst', '.sw-podiums.walk-on .sw-podium', '.sw-applause.lit']) {
    assert.ok(reduced.includes(selector), `${selector} still moves under reduced motion`);
  }
  // More specific than App.css's general bulb rule, so stopped by name.
  assert.match(appCss, /\.live-show-marquee\.to-the-beat i,\n  \.live-show-marquee\.flash i \{\n    animation: none;/);
});
