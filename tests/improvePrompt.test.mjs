import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of extractJudgedProblem from src/lib/labChallenges.ts. That module
// imports .webp assets so node can't load it directly; the logic here is pure
// and identical. Keep the two in sync when changing the precedence rule.
function extractJudgedProblem(checks) {
  const judged = (checks ?? []).find((check) => check.label === 'Judged working');
  if (judged && !judged.passed) return (judged.detail ?? '').trim();

  const parses = (checks ?? []).find((check) => check.label === 'Free of syntax errors');
  if (parses && !parses.passed) {
    return (parses.detail ?? '').replace(/^Will not run\s*[—-]\s*/, '').trim();
  }

  return '';
}

const syntaxFail = {
  label: 'Free of syntax errors',
  passed: false,
  detail: "Will not run — Unexpected token '}' at line 47",
};
const syntaxOk = {
  label: 'Free of syntax errors',
  passed: true,
  detail: 'The code parses, so the script will actually execute.',
};

test('falls back to the syntax error when no judge ran', () => {
  // The whole point: without a judge the model used to be told only "something
  // is broken, find it", even though the exact token and line were known.
  assert.equal(extractJudgedProblem([syntaxFail]), "Unexpected token '}' at line 47");
});

test('strips the "Will not run —" prefix so the model gets just the error', () => {
  const out = extractJudgedProblem([syntaxFail]);
  assert.ok(!out.startsWith('Will not run'), 'prefix should be removed');
  assert.ok(out.startsWith('Unexpected token'));
});

test('prefers the judge verdict over the syntax check', () => {
  const judged = {
    label: 'Judged working',
    passed: false,
    detail: 'Treats a flat array as a 2D grid; crashes on the first tick.',
  };
  // Judge catches runtime/logic bugs a parse check cannot, so it wins.
  assert.match(extractJudgedProblem([judged, syntaxFail]), /flat array/);
});

test('returns nothing when the code is clean', () => {
  assert.equal(extractJudgedProblem([syntaxOk]), '');
  assert.equal(extractJudgedProblem([{ label: 'Judged working', passed: true, detail: 'Works.' }, syntaxOk]), '');
});

test('handles missing or empty checks without throwing', () => {
  assert.equal(extractJudgedProblem(undefined), '');
  assert.equal(extractJudgedProblem([]), '');
  assert.equal(extractJudgedProblem([{ label: 'Free of syntax errors', passed: false }]), '');
});
