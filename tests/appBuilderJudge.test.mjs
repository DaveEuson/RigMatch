import test from 'node:test';
import assert from 'node:assert/strict';

// Mirror of parseAppJudgeVerdict for node testing (the source is TS/ESM; the parse
// logic is pure and identical). Keeps the fiddly verdict parsing under test.
function parseAppJudgeVerdict(text) {
  if (text == null) return null;
  let raw = String(text).trim();
  if (!raw) return null;
  raw = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const inRange = (n) => (Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null);
  let score = null, reason = '';
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed && parsed.score != null) score = inRange(Number(parsed.score));
      if (parsed && typeof parsed.reason === 'string') reason = parsed.reason.slice(0, 200);
    } catch { /* fall through */ }
  }
  if (score == null) { const m = raw.match(/score\s*["']?\s*[:=]\s*["']?\s*(\d{1,3})/i); if (m) score = inRange(Number(m[1])); }
  if (score == null) { const m = raw.match(/\b(\d{1,3})\s*(?:\/\s*100|%)/); if (m) score = inRange(Number(m[1])); }
  if (score == null) { const m = raw.match(/\b(\d{1,3})\b/); if (m) score = inRange(Number(m[1])); }
  return score == null ? null : { score, reason };
}

test('parses a clean verdict with score and reason', () => {
  const v = parseAppJudgeVerdict('{"score": 18, "reason": "treats a flat array as a 2D grid; crashes on first tick"}');
  assert.equal(v.score, 18);
  assert.match(v.reason, /flat array/);
});

test('tolerates code fences and prose around the JSON', () => {
  const v = parseAppJudgeVerdict('My verdict:\n```json\n{"score": 92, "reason": "works"}\n```');
  assert.equal(v.score, 92);
});

test('recovers a score from broken JSON / bare forms', () => {
  assert.equal(parseAppJudgeVerdict('score: 40').score, 40);
  assert.equal(parseAppJudgeVerdict('I would give it 25/100.').score, 25);
  assert.equal(parseAppJudgeVerdict('30').score, 30);
});

test('rejects out-of-range and garbage as null (caller falls back to structural)', () => {
  assert.equal(parseAppJudgeVerdict('{"score": 900}'), null);
  assert.equal(parseAppJudgeVerdict('the app looks nice'), null);
  assert.equal(parseAppJudgeVerdict(''), null);
  assert.equal(parseAppJudgeVerdict(null), null);
});

test('accepts the boundaries and defaults reason to empty', () => {
  assert.deepEqual(parseAppJudgeVerdict('{"score": 0}'), { score: 0, reason: '' });
  assert.deepEqual(parseAppJudgeVerdict('{"score": 100}'), { score: 100, reason: '' });
});
