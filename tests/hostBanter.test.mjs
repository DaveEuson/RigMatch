// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

// Mirror of getHostBanter (src/lib/hostBanter.ts) — pure string logic, kept under
// test so the "addresses Contestant #N" framing and determinism can't regress.
const POOLS = {
  warming: ['Places! {who}, come on down.', 'Lights up! {who}.', 'Welcome, {who}.'],
  asking: ['{who}, your question: “{q}”', 'Charm us, {who}: “{q}”', 'Over to you, {who} — “{q}”', 'Take your time, {who}. “{q}”'],
  answering: ['{who} is thinking…', 'Go on, {who}.', '{who} has the mic.', 'Tokens flying for {who}.'],
  scored: ['Scoreboard for {who}!', 'Nice, {who}.', 'Applause for {who}!', 'Judges have it, {who}.'],
};
function getHostBanter(ctx) {
  const who = ctx.contestantNumber > 0
    ? `Contestant #${ctx.contestantNumber} (${ctx.model})`
    : (ctx.model || 'our next contestant');
  const pool = POOLS[ctx.phase] ?? POOLS.asking;
  const pick = pool[(Math.abs(ctx.index || 0) + Math.max(0, ctx.contestantNumber)) % pool.length];
  return pick.replace(/\{who\}/g, who).replace(/\{q\}/g, ctx.questionLabel || 'the next one');
}

test('addresses the active contestant by number and name', () => {
  const line = getHostBanter({ contestantNumber: 1, model: 'qwen2.5:7b', questionLabel: 'Coding', phase: 'asking', index: 0 });
  assert.match(line, /Contestant #1 \(qwen2\.5:7b\)/);
  assert.match(line, /Coding/);
});

test('is deterministic for the same context (no flicker across re-renders)', () => {
  const ctx = { contestantNumber: 2, model: 'gemma3:4b', questionLabel: 'JSON', phase: 'answering', index: 3 };
  assert.equal(getHostBanter(ctx), getHostBanter(ctx));
});

test('varies the line across questions / contestants', () => {
  const a = getHostBanter({ contestantNumber: 1, model: 'm', questionLabel: 'q', phase: 'asking', index: 0 });
  const b = getHostBanter({ contestantNumber: 1, model: 'm', questionLabel: 'q', phase: 'asking', index: 1 });
  assert.notEqual(a, b);
});

test('falls back to the model name when the seat is unknown', () => {
  const line = getHostBanter({ contestantNumber: 0, model: 'mistral:7b', questionLabel: 'q', phase: 'warming', index: 0 });
  assert.match(line, /mistral:7b/);
  assert.doesNotMatch(line, /Contestant #/);
});

test('interpolates the question label into asking-phase lines', () => {
  const line = getHostBanter({ contestantNumber: 3, model: 'm', questionLabel: 'Accuracy trap', phase: 'asking', index: 2 });
  assert.match(line, /Accuracy trap/);
});

// Mirror of getDateReaction — the PC being wooed reacts; short "Contestant #N"
// form (no model name) since the date card is narrow.
const DATE_POOLS = {
  warming: ['Impress me.', 'All ports.', 'Win my VRAM, win my heart.'],
  asking: ['I need to know this about {who}.', 'Hope they nail it.', 'Matches vs mismatches.'],
  answering: ['I like where {who} is going…', '{who} is winning me over.', 'GPU blushing, {who}.', '{who} might be my type.'],
  scored: ['The heart wants benchmarks.', 'In my little black scorecard.', 'Charming, {who}.'],
};
function getDateReaction(ctx) {
  const who = ctx.contestantNumber > 0 ? `Contestant #${ctx.contestantNumber}` : (ctx.model || 'this one');
  const pool = DATE_POOLS[ctx.phase] ?? DATE_POOLS.answering;
  const pick = pool[(Math.abs(ctx.index || 0) + Math.max(0, ctx.contestantNumber)) % pool.length];
  return pick.replace(/\{who\}/g, who);
}

test('date reaction addresses the contestant by seat, without the model name', () => {
  const line = getDateReaction({ contestantNumber: 2, model: 'qwen2.5:7b', phase: 'answering', index: 0 });
  assert.match(line, /Contestant #2/);
  assert.doesNotMatch(line, /qwen/);
});

test('date reaction is deterministic for the same context', () => {
  const ctx = { contestantNumber: 1, model: 'm', phase: 'scored', index: 4 };
  assert.equal(getDateReaction(ctx), getDateReaction(ctx));
});
