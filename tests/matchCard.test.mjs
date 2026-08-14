import test from 'node:test';
import assert from 'node:assert/strict';

import { matchCardLines, MATCH_CARD_WIDTH, MATCH_CARD_HEIGHT } from '../src/lib/matchCard.ts';
import { CURRENT_SCORE_SCHEMA_VERSION } from '../src/lib/scoring.ts';

const score = (extra = {}) => ({
  model: 'qwen2.5:7b', total: 92, grade: 'A', speed: 94, sobriety: 91,
  stability: 98, fit: 88, preciseTotal: 92.7, completedAt: '2026-08-13T12:00:00Z',
  scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION, ...extra,
});

test('the card says what was measured and where', () => {
  const lines = matchCardLines({
    score: score({ rig: { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, appVersion: '0.6.0' } }),
    appVersion: '0.6.0',
  });
  assert.equal(lines.kicker, "IT'S A MATCH");
  assert.equal(lines.model, 'qwen2.5:7b');
  assert.equal(lines.scoreLine, '92.7', 'the one-decimal match score, same as everywhere else');
  assert.match(lines.rigLine, /RTX 4070 · 12 GB VRAM/, 'the rig is part of the number');
  assert.match(lines.footer, /nothing leaves the computer/i);
  assert.deepEqual(lines.subScores.map((s) => s.label), ['Accuracy', 'Speed', 'Stability', 'Fit']);
});

test('an unstamped score still refuses to invite cross-rig comparison', () => {
  const lines = matchCardLines({ score: score(), appVersion: '0.6.0' });
  assert.match(lines.rigLine, /relative to the rig/i);
});

test('a goal crown renames the kicker', () => {
  const lines = matchCardLines({ score: score(), matchLabel: 'Best for coding', appVersion: '0.6.0' });
  assert.equal(lines.kicker, 'BEST FOR CODING');
});

test('the canvas is the social-image shape', () => {
  assert.equal(MATCH_CARD_WIDTH, 1200);
  assert.equal(MATCH_CARD_HEIGHT, 630);
});
