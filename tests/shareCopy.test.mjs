import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShareTexts, strongestSkill, SHARE_URL } from '../src/lib/shareCopy.ts';
import { CURRENT_SCORE_SCHEMA_VERSION } from '../src/lib/scoring.ts';

/**
 * The share text is read by people who have never heard of RigMatch. Dave's
 * real LinkedIn test produced a post with no link, no explanation of what the
 * app was, no statement of what the match was for, and a question mark that
 * LinkedIn's composer used as a place to truncate. Every rule here is one of
 * those failures pinned down.
 */

const score = (overrides = {}) => ({
  model: 'granite4:3b',
  total: 95,
  preciseTotal: 95,
  grade: 'S',
  speed: 90,
  sobriety: 91,
  stability: 95,
  fit: 96,
  completedAt: '2026-08-16T00:00:00Z',
  scoreSchemaVersion: CURRENT_SCORE_SCHEMA_VERSION,
  taskScores: {
    coding: { score: 97, questions: 6 },
    chat: { score: 88, questions: 6 },
    facts: { score: 90, questions: 4 },
  },
  ...overrides,
});

test('no question marks anywhere — LinkedIn truncates at them', () => {
  for (const style of ['datingshow', 'scorecard']) {
    const texts = buildShareTexts(style, 'granite4:3b', score());
    assert.ok(!texts.full.includes('?'), `full ${style} text contains a "?"`);
    assert.ok(!texts.short.includes('?'), `short ${style} text contains a "?"`);
  }
});

test('the long form carries the link, phrased as a destination', () => {
  const texts = buildShareTexts('datingshow', 'granite4:3b', score());
  assert.ok(texts.full.includes(SHARE_URL));
  assert.match(texts.full, /Get it: https:\/\//);
});

test('a stranger learns what RigMatch is', () => {
  const texts = buildShareTexts('datingshow', 'granite4:3b', score());
  assert.match(texts.full, /free app/i);
  assert.match(texts.full, /your own hardware/i);
});

test('the match states its purpose', () => {
  const texts = buildShareTexts('datingshow', 'granite4:3b', score());
  assert.match(texts.full, /best local AI for coding/);
});

test('the purpose is the strongest graded skill, not a guess', () => {
  assert.deepEqual(strongestSkill(score()), { id: 'coding', purpose: 'coding' });
  const chatty = score({ taskScores: { chat: { score: 93, questions: 6 }, coding: { score: 70, questions: 6 } } });
  assert.deepEqual(strongestSkill(chatty), { id: 'chat', purpose: 'everyday chat' });
});

test('a score with nothing gradable claims less, never more', () => {
  const bare = score({ taskScores: {} });
  assert.equal(strongestSkill(bare), null);
  const texts = buildShareTexts('datingshow', 'granite4:3b', bare);
  assert.match(texts.full, /best local AI —/);
  assert.doesNotMatch(texts.full, /for undefined|for null/);
});

test('the X variant plus its URL fits in a post', () => {
  // X counts every URL as 23 characters; the text itself must leave room.
  const texts = buildShareTexts('datingshow', 'a-quite-long-model-name:70b-instruct-q4_K_M', score());
  assert.ok(texts.short.length + 23 + 1 <= 280, `${texts.short.length} chars leaves no room for the URL`);
  assert.ok(!texts.short.includes(SHARE_URL), 'X gets the URL via its url= parameter, not twice');
});

test('no emoji butted against a dash — it renders as a smeared gap', () => {
  for (const style of ['datingshow', 'scorecard']) {
    const { full } = buildShareTexts(style, 'granite4:3b', score());
    assert.doesNotMatch(full, /\p{Extended_Pictographic}\s*[—–-]|[—–-]\s*\p{Extended_Pictographic}/u);
  }
});
