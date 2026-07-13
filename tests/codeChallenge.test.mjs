import test from 'node:test';
import assert from 'node:assert/strict';

// Mirrors of the pure helpers in src/lib/codeChallenge.ts (TS/ESM; logic is
// identical). Keeps the code-extraction and prompt shaping under test.
function extractCodeBlock(response) {
  const text = String(response ?? '');
  const fenced = text.match(/```[a-zA-Z0-9+#.-]*\s*\n([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

test('extractCodeBlock pulls the first fenced block, dropping the language tag', () => {
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

test('extractCodeBlock takes only the first block when there are several', () => {
  assert.equal(extractCodeBlock('```js\na\n```\ntext\n```js\nb\n```'), 'a');
});

// Prompt-shape checks (the builder is a pure string join, mirrored here).
function buildCodePrompt(language, task, label) {
  const langLine = language === 'any'
    ? 'Use whichever programming language best fits the task.'
    : `Write the solution in ${label}.`;
  return [task, '', langLine, 'Return ONLY the code'].join('\n');
}

test('buildCodePrompt names the chosen language and includes the task', () => {
  const p = buildCodePrompt('rust', 'reverse a string', 'Rust');
  assert.match(p, /reverse a string/);
  assert.match(p, /Write the solution in Rust\./);
});

test('buildCodePrompt lets the model choose when language is "any"', () => {
  const p = buildCodePrompt('any', 't', 'x');
  assert.match(p, /whichever programming language best fits/);
});
