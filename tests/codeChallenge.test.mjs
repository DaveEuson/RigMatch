// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

// The real helpers, not copies of them. These were mirrored here — "logic is
// identical" — and then the mirror kept passing while the extractor it stood in
// for changed underneath it, so the tests asserted the old behavior and the new
// behavior went untested. Node 24 strips the types and imports the module.
import { buildCodePrompt, extractCodeBlock } from '../src/lib/codeChallenge.ts';

test('extractCodeBlock pulls the fenced block, dropping the language tag', () => {
  const r = 'Sure!\n```python\ndef f():\n    return 1\n```\nHope that helps';
  assert.equal(extractCodeBlock(r), 'def f():\n    return 1');
});

test('extractCodeBlock handles a plain ``` fence with no language', () => {
  assert.equal(extractCodeBlock('```\nSELECT 1;\n```'), 'SELECT 1;');
});

test('extractCodeBlock falls back to the whole response when unfenced', () => {
  assert.equal(extractCodeBlock('def g(): return 2'), 'def g(): return 2');
});

test('extractCodeBlock returns empty for empty/nullish input', () => {
  assert.equal(extractCodeBlock(''), '');
  assert.equal(extractCodeBlock(null), '');
  assert.equal(extractCodeBlock(undefined), '');
});

/**
 * A chatty model answers in pieces: the imports in one block, the program in
 * another. Grading the first block graded `import pygame` and scored a working
 * answer near zero — and the models that answer this way are exactly the ones
 * the coding round exists to measure.
 */
test('extractCodeBlock takes the longest block, not the first', () => {
  const reply = [
    'First the imports:',
    '```python',
    'import pygame',
    '```',
    'And here is the game:',
    '```python',
    'def main():',
    '    screen = pygame.display.set_mode((300, 600))',
    '    while True:',
    '        pygame.display.flip()',
    '```',
  ].join('\n');
  const code = extractCodeBlock(reply);
  assert.match(code, /def main\(\)/);
  assert.doesNotMatch(code, /^import pygame$/);
});

test('extractCodeBlock ignores an empty block on the way to the real one', () => {
  assert.equal(extractCodeBlock('```\n\n```\nthen:\n```js\nconst a = 1;\n```'), 'const a = 1;');
});

test('extractCodeBlock keeps the prose out when the model wraps it around the code', () => {
  // What a non-coding model actually returned: a markdown heading, an emoji,
  // and the code fenced below it. The heading is not Python.
  const reply = 'Sure! Here is a Tetris game.\n\n## 🧱 The Code\n\n```python\nimport pygame\nprint(1)\n```\n\nLet me know!';
  assert.equal(extractCodeBlock(reply), 'import pygame\nprint(1)');
});

test('buildCodePrompt names the chosen language and includes the task', () => {
  const p = buildCodePrompt('rust', 'reverse a string');
  assert.match(p, /reverse a string/);
  assert.match(p, /Write the solution in Rust\./);
});

test('buildCodePrompt lets the model choose when language is "any"', () => {
  const p = buildCodePrompt('any', 'reverse a string');
  assert.match(p, /whichever programming language best fits/);
});

test('buildCodePrompt asks for one fenced block and no prose', () => {
  // The extractor tolerates several blocks; the prompt still asks for one.
  assert.match(buildCodePrompt('python', 't'), /single fenced code block/);
});
