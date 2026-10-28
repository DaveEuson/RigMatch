// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
//
// A degenerate answer must not hold the main process. The drawing round's
// cleaner runs there on every drawing, and a show froze at "Drawing a picture
// in code" with the main process busy for minutes while the model sat idle.
// Found by feeding the cleaner generated degenerate answers: it worked out
// every <style> rule for every element (selectors x declarations x elements,
// minutes on 20,000 characters), and re-walked a <use> target's subtree for
// every <use> (elements squared). Each test here builds one such answer and
// asserts how long checking it takes, so a return of either shows as a slow
// test rather than as a frozen app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DRAWING_CLEAN_BUDGET_MS,
  DRAWING_MAX_USES,
  DRAWING_SVG_MAX_CHARS,
  checkDrawing,
} = require('../electron/drawingRound.cjs');
const { scoreSobriety, heuristicCanGrade } = require('../electron/benchmarkScoring.cjs');

/**
 * A real drawing takes a few milliseconds to check, and the worst answers
 * below took one to twenty-five seconds before the fix. The bound sits
 * between them, with room for a loaded CI machine on either side.
 */
const LIMIT_MS = 300;

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">';
const wrap = (body) => `${OPEN}${body}</svg>`;

/** The check, and how many milliseconds it took. Every answer here is small enough to reach the cleaner. */
function timed(answer) {
  assert.ok(answer.length <= DRAWING_SVG_MAX_CHARS, `${answer.length} characters would be turned away unread`);
  const started = performance.now();
  const check = checkDrawing(answer);
  return { check, ms: performance.now() - started };
}

// ── Fixtures: the degenerate answers ───────────────────────────────────────

/**
 * One rule for many copies of the same selector, whose body repeats a
 * declaration, and the shapes it colours: a looping model writing a stylesheet.
 * Before the fix every shape went through every selector and every declaration.
 */
function repeatedSelectorsAndDeclarations(selectors, declarations, shapes) {
  const css = `${'rect,'.repeat(selectors)}rect{${'fill:red;'.repeat(declarations)}}`;
  return wrap(`<style>${css}</style>${'<rect/>'.repeat(shapes)}`);
}

/** The same, reaching the shapes through a class. */
function repeatedClassSelectors(selectors, declarations, shapes) {
  const css = `${'.a,'.repeat(selectors)}.a{${'fill:red;stroke:blue;'.repeat(declarations / 2)}}`;
  return wrap(`<style>${css}</style>${'<rect class="a"/>'.repeat(shapes)}`);
}

/**
 * A group with a deep subtree and many <use> of it. Every <use> had to find out
 * whether its target held a <use> of its own, by walking the whole subtree each
 * time.
 */
function manyUsesOfABigGroup(depth, leaves, uses) {
  return wrap(`<g id="a">${'<g>'.repeat(depth - 1)}${'<rect/>'.repeat(leaves)}${'</g>'.repeat(depth - 1)}</g>${'<use href="#a"/>'.repeat(uses)}`);
}

// ── The slow ones ──────────────────────────────────────────────────────────

test('a thousand repeated selectors with a body of repeated declarations are checked in milliseconds', () => {
  // 15,600 characters; five seconds before the fix, and minutes at twice the size.
  const answer = repeatedSelectorsAndDeclarations(1000, 400, 1000);
  const { check, ms } = timed(answer);
  assert.ok(ms < LIMIT_MS, `took ${Math.round(ms)} ms`);
  // Still the cleaned drawing, every shape coloured by the one rule.
  assert.equal(check.ok, true);
  assert.equal(check.svg.match(/<rect [^>]*style="fill: red"/g).length, 1000);
  // The scorer and the grader ask the same question of the same answer.
  assert.equal(scoreSobriety({ type: 'drawing' }, answer), 50);
  assert.equal(heuristicCanGrade('drawing', 'Draw a rectangle.', answer), false);
});

test('selectors that reach shapes by class are checked in milliseconds too', () => {
  const { check, ms } = timed(repeatedClassSelectors(1500, 400, 500));
  assert.ok(ms < LIMIT_MS, `took ${Math.round(ms)} ms`);
  assert.equal(check.ok, true);
  assert.equal(check.svg.match(/style="fill: red; stroke: blue"/g).length, 500);
});

test('a <style> as large as the cap allows is no slower', () => {
  // As much CSS as fits beside as many shapes as the element cap allows.
  const answer = repeatedSelectorsAndDeclarations(2500, 500, 1700);
  assert.ok(answer.length > 28000, `${answer.length} characters`);
  const { check, ms } = timed(answer);
  assert.ok(ms < LIMIT_MS, `took ${Math.round(ms)} ms`);
  assert.equal(check.ok, true);
  assert.equal(check.svg.match(/style="fill: red"/g).length, 1700);
});

test('many <use> of a group with a big subtree are checked in milliseconds', () => {
  // 21,800 characters; up to a second and a half before the fix.
  const { check, ms } = timed(manyUsesOfABigGroup(46, 1000, 900));
  assert.ok(ms < LIMIT_MS, `took ${Math.round(ms)} ms`);
  // The cap on copies is unchanged: this many are kept and the rest dropped.
  assert.equal(check.ok, true);
  assert.equal(check.svg.match(/<use /g).length, DRAWING_MAX_USES);
});

test('copies of a group that holds a <use> are still refused, however big the group', () => {
  const answer = wrap(`<g id="a">${'<rect/>'.repeat(300)}<use href="#b"/></g><rect id="b"/>${'<use href="#a"/>'.repeat(300)}`);
  const { check, ms } = timed(answer);
  assert.ok(ms < LIMIT_MS, `took ${Math.round(ms)} ms`);
  assert.equal(check.ok, true);
  // Only the <use> inside the group survives: nothing copies a copy.
  assert.equal(check.svg.match(/<use /g).length, 1);
});

// ── The cascade is what it was ─────────────────────────────────────────────

test('folding the rules leaves the cascade as it was: specificity, then order, each property placed where it first appears', () => {
  const answer = wrap([
    '<style>',
    '.a { fill: red; stroke: blue }',
    '.b { fill: green }',
    '.a { stroke: black }',
    'rect { fill: yellow; opacity: 0.5; fill: orange }',
    '#x { opacity: 1 }',
    'g, .c, text { color: purple; color: teal }',
    '</style>',
    '<rect id="x" class="a b" width="1" height="1" style="stroke-width: 3; fill: pink"/>',
    '<rect class="b a" width="1" height="1"/>',
    '<g class="c"><text x="1" y="1" class="a">hi</text></g>',
  ].join(''));
  const { svg } = checkDrawing(answer);
  // The element's own style beats every rule; #x beats the classes; .a and .b
  // are equal, so the later rule wins each property; rect is the weakest, and
  // its second fill replaces its first.
  assert.match(svg, /<rect id="x" class="a b" [^>]*style="fill: pink; opacity: 1; stroke: black; stroke-width: 3">/);
  assert.match(svg, /<rect class="b a" [^>]*style="fill: green; opacity: 0\.5; stroke: black">/);
  assert.match(svg, /<g class="c" style="color: teal">/);
  assert.match(svg, /<text x="1" y="1" class="a" style="color: teal; fill: red; stroke: black">/);
});

test('rules from several <style> blocks keep the order they are read in', () => {
  const answer = wrap('<style>rect { fill: red }</style><defs><style>rect { fill: blue }</style></defs><rect width="1" height="1"/><style>rect { stroke: red }</style>');
  assert.match(checkDrawing(answer).svg, /<rect width="1" height="1" style="fill: blue; stroke: red">/);
});

test('a declaration repeated thousands of times is one declaration', () => {
  const answer = wrap(`<rect width="1" height="1" style="${'fill: red; '.repeat(2000)}stroke: blue; fill: green"/>`);
  assert.match(checkDrawing(answer).svg, /style="fill: green; stroke: blue"/);
});

// ── Every shape of degenerate answer is quick ──────────────────────────────

const FENCE = '```';
const DEGENERATE = {
  'seven hundred identical shapes': () => wrap('<rect x="0" y="0" width="1" height="1"/>'.repeat(700)),
  'more shapes than the element cap': () => wrap('<rect/>'.repeat(3500)),
  'stepping numbers to the token cap, cut off': () => wrap(Array.from({ length: 220 }, (_, i) => `<rect x="0" y="${530 + 10 * i}" width="1" height="1"/>`).join('\n')).slice(0, -6),
  'one very long attribute': () => wrap(`<path d="M0 0${' L1 1'.repeat(5500)}"/>`),
  'thousands of attributes on one element': () => wrap(`<rect ${Array.from({ length: 2500 }, (_, i) => `a${i}="1"`).join(' ')}/>`),
  'thousands of unclosed groups': () => OPEN + '<g>'.repeat(9000),
  'thousands of <svg openers': () => '<svg '.repeat(5000),
  'repeated </svg>': () => '</svg>'.repeat(5000),
  'nesting past the cap': () => wrap(`${'<g>'.repeat(5000)}<rect/>`),
  'a <style> of braces and commas': () => wrap(`<style>${'{},'.repeat(10000)}</style><rect/>`),
  'a <style> that never closes its brace or comment': () => wrap(`<style>rect{fill:red${'/*'.repeat(5000)}</style><rect/>`),
  'self-referencing <use> by the thousand': () => wrap('<use id="a" href="#a"/>'.repeat(1300)),
  'a <use> chain': () => wrap(Array.from({ length: 900 }, (_, i) => `<use id="u${i}" href="#u${i + 1}"/>`).join('')),
  'thousands of <symbol>': () => wrap(`<defs>${'<symbol id="s"><rect/></symbol>'.repeat(900)}</defs>`),
  'a long run of spaces inside a tag': () => wrap(`<rect${' '.repeat(30000)}x="1"/>`),
  'a long run of <': () => wrap('<'.repeat(30000)),
  'a long run of ;': () => wrap(`<rect style="${';'.repeat(30000)}"/>`),
  'code fences repeated and never closed': () => `${FENCE}svg\n<svg `.repeat(2500),
  'thinking text opened a thousand times': () => `${'<think>'.repeat(2000)}${wrap('<rect/>')}`,
  'control characters and lone surrogates': () => wrap(`<text>${String.fromCharCode(0, 1, 27, 0xd800, 0xdfff, 0xfffe).repeat(3000)}</text>`),
};

for (const [name, build] of Object.entries(DEGENERATE)) {
  test(`degenerate answer: ${name}`, () => {
    const answer = build();
    const { ms } = timed(answer);
    assert.ok(ms < LIMIT_MS, `${answer.length} characters took ${Math.round(ms)} ms`);
  });
}

// ── The backstop ───────────────────────────────────────────────────────────

test('an answer that runs out of time scores as too complicated to check, never throws', () => {
  const drawing = wrap('<circle cx="50" cy="50" r="40" fill="red"/>');
  // A drawing is checked in a few milliseconds; a budget of none is spent
  // before the first step, on any machine.
  const out = checkDrawing(drawing, 0);
  assert.equal(out.ok, false);
  assert.equal(out.problem, 'too-complex');
  assert.equal(out.score, 10);
  assert.equal(out.svg, null);
  assert.equal(out.note, 'No drawing: the SVG was too complicated to check.');
  // Under the real budget the same drawing is fine, and the short one was not remembered.
  assert.equal(checkDrawing(drawing).ok, true);
  assert.equal(checkDrawing(drawing, 0).problem, 'too-complex');
  assert.ok(DRAWING_CLEAN_BUDGET_MS > 0 && DRAWING_CLEAN_BUDGET_MS <= 1000);
});
