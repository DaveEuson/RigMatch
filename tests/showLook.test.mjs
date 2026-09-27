// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The show's look came back to Simple Mode as decoration that costs nothing:
 * no height, no focus stops, no text, nothing lit that carries a number. These
 * pin the parts of that which fail silently — a clipped step, a theme that
 * turns plum, a decoration a screen reader reads out, an animation that
 * ignores the OS setting.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const css = read('../src/components/SimpleWizard.css');
const tsx = read('../src/components/SimpleWizard.tsx');
const appCss = read('../src/App.css');

/** The body of the first rule whose selector line is exactly `selector {`. */
function ruleBody(source, selector) {
  const start = source.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} rule not found`);
  const open = source.indexOf('{', start);
  return source.slice(open + 1, source.indexOf('\n}', open));
}

/** The body of an at-rule block, matched by its opening line. */
function blockBody(source, opener) {
  const start = source.indexOf(opener);
  assert.ok(start >= 0, `${opener} not found`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i);
  }
  throw new Error(`${opener} never closes`);
}

test('the Compare step scrolls instead of clipping its own progress and scores', () => {
  // flex: 1 stretched it to the scroll box, and overflow: hidden then cut off
  // the progress bar and the answer strip at 1280x800 with no way down.
  const compare = ruleBody(css, '.sw-compare');
  assert.match(compare, /flex: 0 0 auto;/);
  assert.doesNotMatch(compare, /flex: 1;/);
});

test('the stage floor follows the theme', () => {
  // #14101e is plum-black: it painted the avocado and teal themes' stage plum.
  assert.ok(!css.includes('#14101e'), 'a hard-coded stage color is back in SimpleWizard.css');
  // data-theme sits on the app's root div, so the token has to be declared
  // under it; declared on :root it resolves --bg once, in the default theme.
  assert.match(ruleBody(css, '.sw-shell'), /--stage-floor: color-mix\(in srgb, var\(--bg\)/);
  assert.ok(!read('../src/index.css').includes('--stage-floor'), '--stage-floor declared on :root');
});

test('every piece of scenery is hidden from assistive technology', () => {
  for (const cls of ['sw-stage-bg', 'sw-pick-empty-art']) {
    const tags = tsx.match(new RegExp(`<div className="${cls}"[^>]*>`, 'g')) ?? [];
    assert.ok(tags.length > 0, `${cls} is not rendered`);
    for (const tag of tags) assert.match(tag, /aria-hidden="true"/, `${cls} is announced`);
  }
  assert.match(read('../src/components/ShowMarquee.tsx'), /aria-hidden="true"/);
});

test('data is never under the stage lights', () => {
  // Theater frames, data leads: the progress bar and the answer scores sit
  // outside the lit stage, and the scoreboard outside the winner's.
  const stageStart = tsx.indexOf("'sw-stage lights-down' : 'sw-stage'");
  const dataStart = tsx.indexOf('<div className="sw-stage-data">');
  assert.ok(stageStart > 0 && dataStart > stageStart);
  const stage = tsx.slice(stageStart, dataStart);
  assert.ok(!stage.includes('sw-show-progress') && !stage.includes('sw-answer-strip'));
  // The stage closes before the board opens.
  const winnerStart = tsx.indexOf("<div className={effects ? 'sw-winner-stage curtained' : 'sw-winner-stage'}>");
  const boardStart = tsx.indexOf('<div className="sw-scoreboard">', winnerStart);
  assert.ok(winnerStart > 0 && boardStart > winnerStart);
  const between = tsx.slice(winnerStart, boardStart);
  const opens = (between.match(/<div\b/g) ?? []).length - (between.match(/<div\b[^>]*\/>/g) ?? []).length;
  const closes = (between.match(/<\/div>/g) ?? []).length;
  assert.equal(opens, closes, 'the scoreboard renders inside the lit winner stage');
});

test('gold stays the verdict: the Pick buttons are not gold', () => {
  // Gold marks the winner and the single next action (DESIGN.md). Six gold
  // Pick bars competed with Next on the one step where Next matters most.
  assert.doesNotMatch(ruleBody(css, '.sw-card-btn'), /gold/);
});

test('step names hide by the room the rail has, not by the window', () => {
  const laptop = blockBody(css, '@media (max-width: 1280px)');
  assert.ok(!laptop.includes('.sw-step-label'), 'step names hidden on every <=1280px window again');
  assert.match(blockBody(css, '@container steps'), /\.sw-step-label/);
  assert.match(ruleBody(css, '.sw-steps'), /container: steps \/ inline-size;/);
});

test('every new animation stands still when the OS asks for less motion', () => {
  const reduced = blockBody(css, '@media (prefers-reduced-motion: reduce) {\n  /* The skeleton');
  for (const selector of ['.sw-winner-avatar-wrap::before', '.sw-podium::before', '.sw-lineup-slot.filled']) {
    assert.ok(reduced.includes(selector), `${selector} is not covered by reduced motion`);
  }
  // Lights down holds the bulbs still in every mode, not only reduced motion.
  assert.match(appCss, /\.live-show-marquee\.lights-down i \{\n  animation: none;/);
});
