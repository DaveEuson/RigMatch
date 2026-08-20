// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Sixteen of the app's twenty-four animations once ran regardless of the OS
// "reduce motion" setting — including twenty-two marquee bulbs looping forever
// and both confetti systems. This guards the fix: every rule that starts an
// animation must have a matching `animation: none` inside a
// prefers-reduced-motion block.

const STYLESHEETS = ['src/App.css', 'src/components/SimpleWizard.css'];

const ANIMATION_KEYWORDS = new Set([
  'none', 'infinite', 'alternate', 'alternate-reverse', 'linear', 'ease', 'ease-in',
  'ease-out', 'ease-in-out', 'forwards', 'backwards', 'both', 'reverse', 'running',
  'paused', 'normal', 'step-start', 'step-end',
]);

/**
 * Walks a stylesheet tracking brace depth, ignoring braces inside parentheses so
 * gradients do not corrupt the parse. Comments are stripped first: they legally
 * sit inside selector lists, where their commas would split selectors wrongly.
 */
function parseStylesheet(file) {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const animated = [];
  const suppressed = new Set();
  const stack = [];
  let buf = '';
  let paren = 0;
  let reducedMotionDepth = -1;

  for (const ch of css) {
    if (ch === '(') paren++;
    else if (ch === ')') paren--;

    if (paren === 0 && ch === '{') {
      const head = buf.trim().replace(/\s+/g, ' ');
      buf = '';
      stack.push(head);
      if (/^@media\b/.test(head) && head.includes('prefers-reduced-motion') && reducedMotionDepth === -1) {
        reducedMotionDepth = stack.length;
      }
      continue;
    }

    if (paren === 0 && ch === '}') {
      const body = buf;
      const head = stack[stack.length - 1] ?? '';
      buf = '';
      const insideReducedMotion = reducedMotionDepth !== -1;

      if (head && !head.startsWith('@')) {
        const match = body.match(/(?:^|[;{\s])animation(?:-name)?:\s*([^;]+)/);
        if (match) {
          const value = match[1].trim();
          const declaresNone = /^none\b/.test(value);
          const keyframe = value
            .split(/\s+/)
            .find((token) => /^[a-zA-Z][\w-]*$/.test(token) && !ANIMATION_KEYWORDS.has(token));

          for (const raw of head.split(',')) {
            const selector = raw.trim();
            if (!selector) continue;
            if (insideReducedMotion && declaresNone) suppressed.add(selector);
            else if (!insideReducedMotion && !declaresNone && keyframe) {
              animated.push({ selector, keyframe, file });
            }
          }
        }
      }

      stack.pop();
      if (reducedMotionDepth !== -1 && stack.length < reducedMotionDepth) reducedMotionDepth = -1;
      continue;
    }

    buf += ch;
  }

  return { animated, suppressed };
}

test('every animated selector is suppressed under prefers-reduced-motion', () => {
  const animated = [];
  const suppressed = new Set();

  for (const relative of STYLESHEETS) {
    const result = parseStylesheet(path.join(process.cwd(), relative));
    animated.push(...result.animated);
    for (const selector of result.suppressed) suppressed.add(selector);
  }

  assert.ok(animated.length > 0, 'parser found no animations — it has probably broken');

  const uncovered = animated.filter((rule) => !suppressed.has(rule.selector));
  assert.deepEqual(
    uncovered.map((rule) => `${rule.keyframe} on "${rule.selector}" (${rule.file})`),
    [],
    'these rules animate with no `animation: none` under prefers-reduced-motion',
  );
});

test('both stylesheets carry a prefers-reduced-motion block', () => {
  for (const relative of STYLESHEETS) {
    const css = fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
    assert.match(css, /prefers-reduced-motion/, `${relative} has no reduced-motion handling at all`);
  }
});
