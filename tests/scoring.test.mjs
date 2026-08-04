import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCORE_WEIGHTS,
  MATCH_GRADE_BANDS,
  gradeForMatchScore,
  CURRENT_SCORE_SCHEMA_VERSION,
  calculatePreciseTotal,
  getScoreSortTotal,
  formatMatchScore,
  isLegacyScore,
  toTestedModelScore,
  upsertModelScores,
  compareTestedModelScores,
  compareBenchmarkResults,
} from '../src/lib/scoring.ts';

// ── helpers ───────────────────────────────────────────────────────────────────

function score(overrides = {}) {
  return {
    model: 'model',
    total: 80,
    grade: 'B',
    speed: 80,
    sobriety: 80,
    stability: 80,
    fit: 80,
    completedAt: '2026-01-01T00:00:00.000Z',
    scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
    ...overrides,
  };
}

function benchmarkResult(overrides = {}) {
  const { scores: scoreOverrides, ...rest } = overrides;
  return {
    model: 'model',
    baseUrl: 'http://127.0.0.1:11434',
    questionCount: 10,
    completedAt: '2026-01-01T00:00:00.000Z',
    elapsedMs: 1000,
    prompts: [],
    scores: {
      speed: 80,
      sobriety: 80,
      stability: 80,
      fit: 80,
      total: 80,
      grade: 'B',
      ...scoreOverrides,
    },
    ...rest,
  };
}

// Sort a copy with the production comparator (best model first) and return models.
function rankedModels(scores) {
  return [...scores].sort(compareTestedModelScores).map((s) => s.model);
}

// ── SCORE_WEIGHTS ───────────────────────────────────────────────────────────────

test('SCORE_WEIGHTS sum to exactly 1.0', () => {
  const sum = SCORE_WEIGHTS.sobriety + SCORE_WEIGHTS.speed + SCORE_WEIGHTS.stability + SCORE_WEIGHTS.fit;
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights summed to ${sum}`);
});

test('answer quality (sobriety) is the single largest weight', () => {
  const others = [SCORE_WEIGHTS.speed, SCORE_WEIGHTS.stability, SCORE_WEIGHTS.fit];
  assert.ok(others.every((w) => SCORE_WEIGHTS.sobriety >= w));
});

// ── calculatePreciseTotal ───────────────────────────────────────────────────────

test('calculatePreciseTotal applies the documented weighting', () => {
  // 90*0.34 + 80*0.32 + 70*0.18 + 60*0.16 = 30.6 + 25.6 + 12.6 + 9.6 = 78.4
  const result = calculatePreciseTotal({ sobriety: 90, speed: 80, stability: 70, fit: 60, total: 0 });
  assert.equal(result, 78.4);
});

test('calculatePreciseTotal rounds to one decimal place', () => {
  const result = calculatePreciseTotal({ sobriety: 81, speed: 82, stability: 83, fit: 84, total: 0 });
  // 81*0.34 + 82*0.32 + 83*0.18 + 84*0.16 = 27.54 + 26.24 + 14.94 + 13.44 = 82.16 -> 82.2
  assert.equal(result, 82.2);
});

test('calculatePreciseTotal falls back to total when stability is missing', () => {
  const withStability = calculatePreciseTotal({ sobriety: 90, speed: 80, stability: 75, fit: 60, total: 999 });
  const withoutStability = calculatePreciseTotal({ sobriety: 90, speed: 80, fit: 60, total: 75 });
  assert.equal(withStability, withoutStability);
});

test('a perfect score across all signals is 100', () => {
  assert.equal(calculatePreciseTotal({ sobriety: 100, speed: 100, stability: 100, fit: 100, total: 100 }), 100);
});

// ── getScoreSortTotal ───────────────────────────────────────────────────────────

test('getScoreSortTotal prefers a cached preciseTotal', () => {
  assert.equal(getScoreSortTotal(score({ preciseTotal: 88.8, total: 80 })), 88.8);
});

test('getScoreSortTotal computes when preciseTotal is absent', () => {
  const s = score({ sobriety: 90, speed: 80, stability: 70, fit: 60, total: 0 });
  delete s.preciseTotal;
  assert.equal(getScoreSortTotal(s), 78.4);
});

// ── formatMatchScore ────────────────────────────────────────────────────────────

test('formatMatchScore always renders exactly one decimal', () => {
  assert.equal(formatMatchScore(score({ preciseTotal: 78.4, total: 78 })), '78.4');
  // Previously returned the bare integer here, so the same surface showed both
  // "80" and "78.4" and the score looked like it changed format at random.
  assert.equal(formatMatchScore(score({ preciseTotal: 80, total: 80 })), '80.0');
  assert.equal(formatMatchScore(score({ preciseTotal: 80.02, total: 80 })), '80.0');
  assert.equal(formatMatchScore(score({ preciseTotal: 92.75, total: 93 })), '92.8');
  // Legacy scores with no cached precise value still get one decimal.
  assert.equal(formatMatchScore(score({ preciseTotal: undefined, total: 88 })).split('.').length, 2);
});

test('every formatted Match score has one decimal place', () => {
  for (const preciseTotal of [0, 12, 63.049, 78.4, 80, 92.75, 99.999, 100]) {
    const rendered = formatMatchScore(score({ preciseTotal, total: Math.round(preciseTotal) }));
    assert.match(rendered, /^\d+\.\d$/, `${preciseTotal} rendered as ${rendered}`);
  }
});

// ── isLegacyScore ───────────────────────────────────────────────────────────────

test('isLegacyScore flags scores from an older schema', () => {
  assert.equal(isLegacyScore(score({ scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION })), false);
  assert.equal(isLegacyScore(score({ scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION - 1 })), true);
  assert.equal(isLegacyScore(score({ scoreSchemaVersion: undefined })), true);
});

// ── compareTestedModelScores (ranking + tie-breaks) ─────────────────────────────

test('higher precise total ranks first', () => {
  const high = score({ model: 'high', sobriety: 95, speed: 95, stability: 95, fit: 95 });
  const low = score({ model: 'low', sobriety: 60, speed: 60, stability: 60, fit: 60 });
  assert.deepEqual(rankedModels([low, high]), ['high', 'low']);
});

test('legacy scores always rank behind current-schema scores, even with a higher value', () => {
  const legacyButStrong = score({ model: 'legacy', sobriety: 100, speed: 100, stability: 100, fit: 100, scoreSchemaVersion: 1 });
  const currentButWeak = score({ model: 'current', sobriety: 50, speed: 50, stability: 50, fit: 50 });
  assert.deepEqual(rankedModels([legacyButStrong, currentButWeak]), ['current', 'legacy']);
});

test('tie on precise total breaks to the higher integer total', () => {
  const a = score({ model: 'a', preciseTotal: 80, total: 90 });
  const b = score({ model: 'b', preciseTotal: 80, total: 85 });
  assert.deepEqual(rankedModels([b, a]), ['a', 'b']);
});

test('tie breaks fall through to answer quality before speed', () => {
  // identical precise + total; a has higher sobriety, b has higher speed -> sobriety wins
  const a = score({ model: 'a', preciseTotal: 80, total: 80, sobriety: 90, speed: 10 });
  const b = score({ model: 'b', preciseTotal: 80, total: 80, sobriety: 70, speed: 99 });
  assert.deepEqual(rankedModels([b, a]), ['a', 'b']);
});

test('ranking is transitive across precise totals within 0.05 of each other', () => {
  // Regression: a ">= 0.05 band" comparator treated 80.00/80.03/80.06 as ties in
  // pairs but not end-to-end, so sort order depended on input arrangement.
  const a = score({ model: 'a', preciseTotal: 80.0, total: 80 });
  const b = score({ model: 'b', preciseTotal: 80.03, total: 80 });
  const c = score({ model: 'c', preciseTotal: 80.06, total: 80 });
  const expected = ['c', 'b', 'a']; // strictly by precise total, highest first
  assert.deepEqual(rankedModels([a, b, c]), expected);
  assert.deepEqual(rankedModels([b, a, c]), expected);
  assert.deepEqual(rankedModels([c, b, a]), expected);
  assert.deepEqual(rankedModels([a, c, b]), expected);
});

test('fully tied scores break alphabetically by model name and are deterministic', () => {
  const beta = score({ model: 'beta', preciseTotal: 80, total: 80 });
  const alpha = score({ model: 'alpha', preciseTotal: 80, total: 80 });
  assert.deepEqual(rankedModels([beta, alpha]), ['alpha', 'beta']);
  // comparator is symmetric / sign-stable
  assert.ok(compareTestedModelScores(alpha, beta) < 0);
  assert.ok(compareTestedModelScores(beta, alpha) > 0);
  assert.equal(compareTestedModelScores(alpha, alpha), 0);
});

// ── toTestedModelScore ──────────────────────────────────────────────────────────

test('toTestedModelScore maps a benchmark result and stamps the current schema', () => {
  const result = benchmarkResult({
    model: 'qwen3:1.7b',
    completedAt: '2026-02-02T12:00:00.000Z',
    scores: { speed: 90, sobriety: 80, stability: 70, fit: 60, total: 78, grade: 'A' },
  });
  const mapped = toTestedModelScore(result, 'Default Suite');
  assert.equal(mapped.model, 'qwen3:1.7b');
  assert.equal(mapped.grade, 'A');
  assert.equal(mapped.suiteName, 'Default Suite');
  assert.equal(mapped.scoreSchemaVersion, CURRENT_SCORE_SCHEMA_VERSION);
  assert.equal(mapped.completedAt, '2026-02-02T12:00:00.000Z');
  assert.equal(mapped.preciseTotal, 78.2); // 80*.34 + 90*.32 + 70*.18 + 60*.16 = 27.2 + 28.8 + 12.6 + 9.6
  assert.equal(isLegacyScore(mapped), false);
});

// ── upsertModelScores ───────────────────────────────────────────────────────────

test('upsertModelScores keyed by model with last-write-wins, preserving others', () => {
  const seed = upsertModelScores({}, [benchmarkResult({ model: 'a', scores: { total: 70 } })]);
  assert.equal(Object.keys(seed).length, 1);

  const merged = upsertModelScores(seed, [
    benchmarkResult({ model: 'a', scores: { total: 95, grade: 'A' } }), // overwrites a
    benchmarkResult({ model: 'b', scores: { total: 60 } }), // adds b
  ]);
  assert.deepEqual(Object.keys(merged).sort(), ['a', 'b']);
  assert.equal(merged.a.total, 95);
  assert.equal(merged.a.grade, 'A');
  assert.equal(merged.b.total, 60);
  // does not mutate the input map
  assert.equal(seed.a.total, 70);
});

// ── compareBenchmarkResults ─────────────────────────────────────────────────────

test('compareBenchmarkResults ranks raw results consistently with scores', () => {
  const strong = benchmarkResult({ model: 'strong', scores: { speed: 95, sobriety: 95, stability: 95, fit: 95, total: 95 } });
  const weak = benchmarkResult({ model: 'weak', scores: { speed: 50, sobriety: 50, stability: 50, fit: 50, total: 50 } });
  assert.ok(compareBenchmarkResults(strong, weak) < 0);
  assert.ok(compareBenchmarkResults(weak, strong) > 0);
});

// ── Match grade bands ──────────────────────────────────────────────────────────

test('grade bands match electron/main.cjs gradeFor exactly', () => {
  // main.cjs grades real runs in a separate process and can't import this module,
  // so these boundaries are the contract between them. If you change one, change
  // both — a mismatch means the app grades a run differently than it explains.
  const mainCjsGradeFor = (score) => {
    if (score >= 95) return 'S';
    if (score >= 88) return 'A';
    if (score >= 80) return 'B+';
    if (score >= 72) return 'B';
    if (score >= 64) return 'C';
    return 'D';
  };
  for (let score = 0; score <= 100; score += 1) {
    assert.equal(gradeForMatchScore(score), mainCjsGradeFor(score), `disagreement at ${score}`);
  }
});

test('grade band boundaries are exactly where the published table says', () => {
  assert.equal(gradeForMatchScore(95), 'S');
  assert.equal(gradeForMatchScore(94), 'A');
  assert.equal(gradeForMatchScore(88), 'A');
  assert.equal(gradeForMatchScore(87), 'B+');
  assert.equal(gradeForMatchScore(80), 'B+');
  assert.equal(gradeForMatchScore(79), 'B');
  assert.equal(gradeForMatchScore(72), 'B');
  assert.equal(gradeForMatchScore(71), 'C');
  assert.equal(gradeForMatchScore(64), 'C');
  assert.equal(gradeForMatchScore(63), 'D');
  assert.equal(gradeForMatchScore(0), 'D');
});

test('every band in the published table is reachable and none are invented', () => {
  const produced = new Set();
  for (let score = 0; score <= 100; score += 1) produced.add(gradeForMatchScore(score));
  const published = new Set(MATCH_GRADE_BANDS.map((b) => b.grade));
  assert.deepEqual([...produced].sort(), [...published].sort());
  // "A-" was displayed by the demo but exists in no grade table.
  assert.ok(!produced.has('A-'), 'A- is not a real grade');
});
