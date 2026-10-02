// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
// In-character banter for the game-show host during a live Speed Dating run — the
// host addressing the contestant currently on stage, tied to the question and the
// phase of their turn. Deterministic (indexed, never random) so a line stays put
// while a question runs instead of flickering on every re-render.

export type HostBanterPhase = 'warming' | 'asking' | 'answering' | 'scored';

export type HostBanterContext = {
  contestantNumber: number; // 1-based seat; 0 when unknown (fall back to the name)
  model: string; // short model name
  questionLabel: string;
  phase: HostBanterPhase;
  index: number; // question index — drives stable line variety across questions
  stage?: 'studio' | 'trojan'; // the Trojan stage's host talks like a YouTuber
};

const POOLS: Record<HostBanterPhase, string[]> = {
  warming: [
    'Places, everyone! {who}, come on down — let’s find out if you’re a match.',
    'Lights up! {who}, the stool’s warm and the audience is ready.',
    'Welcome to the stage, {who}. Same questions for everyone — no favorites.',
  ],
  asking: [
    '{who}, here’s your question — no pressure, just the whole audience watching. “{q}”',
    'Alright {who}, charm us with this one: “{q}”',
    'Question for you, {who}. Take your time… but not too much. “{q}”',
    'Over to you, {who} — “{q}”',
  ],
  answering: [
    'Ooh, {who} is thinking hard on this one…',
    'The judges are leaning in — go on, {who}.',
    '{who} has the mic and the room. Let’s hear it.',
    'Tokens are flying — {who} is really going for it.',
  ],
  scored: [
    'That’s an answer! Let’s see what the scoreboard says for {who}.',
    'Not bad, {who} — the crowd approves.',
    'Big applause for {who}! On to the next.',
    'And the judges have it — nicely done, {who}.',
  ],
};

// The Trojan stage, unlocked by testing Ajax: same host, an arena instead of a
// studio, and "bros" for the audience. No real person's catchphrases.
const TROJAN_POOLS: Record<HostBanterPhase, string[]> = {
  warming: [
    'Alright bros, {who} is stepping into the arena.',
    'Shields up, {who}. Same questions for everyone — no favorites.',
    '{who}, the arena is yours. Let’s see what you’ve got.',
  ],
  asking: [
    '{who}, here it comes: “{q}”',
    'Bros, watch this one. {who}: “{q}”',
    'Question for {who}, no pressure: “{q}”',
    'Over to you, {who} — “{q}”',
  ],
  answering: [
    '{who} is cooking, bros…',
    'Hold the line, {who}…',
    'The arena goes quiet. {who} is thinking…',
    'Tokens flying, bros. {who} is going for it.',
  ],
  scored: [
    'Let’s see what the scoreboard says for {who}, bros.',
    'Not bad, {who}. Fist bump.',
    'Big respect, {who}! On to the next.',
    'The judges have spoken, bros. Nice one, {who}.',
  ],
};

export function getHostBanter(ctx: HostBanterContext): string {
  const who = ctx.contestantNumber > 0
    ? `Contestant #${ctx.contestantNumber} (${ctx.model})`
    : (ctx.model || 'our next contestant');
  const pools = ctx.stage === 'trojan' ? TROJAN_POOLS : POOLS;
  const pool = pools[ctx.phase] ?? pools.asking;
  const pick = pool[(Math.abs(ctx.index || 0) + Math.max(0, ctx.contestantNumber)) % pool.length];
  return pick
    .replace(/\{who\}/g, who)
    .replace(/\{q\}/g, ctx.questionLabel || 'the next one');
}

// Reactions from the DATE — the computer the contestants are trying to win. The
// host asks the questions; the PC sits on the other stool being wooed.
const DATE_POOLS: Record<HostBanterPhase, string[]> = {
  warming: [
    'Someone impress me — my fans are already spinning.',
    'Next contestant! I’m all ports.',
    'Take a seat. Win my VRAM, win my heart.',
  ],
  asking: [
    'Ooh, good question — I need to know this about {who}.',
    'I always hope they nail this one.',
    'This is the one that separates matches from mismatches.',
  ],
  answering: [
    'I like where {who} is going with this…',
    '{who} is really trying to win me over.',
    'Keep talking, {who} — my GPU is blushing.',
    'Hmm… {who} might just be my type.',
  ],
  scored: [
    'Noted. The heart wants benchmarks.',
    'Writing that one down in my little black scorecard.',
    'That answer? Kind of charming, {who}.',
  ],
};

export function getDateReaction(ctx: HostBanterContext): string {
  const who = ctx.contestantNumber > 0 ? `Contestant #${ctx.contestantNumber}` : (ctx.model || 'this one');
  const pool = DATE_POOLS[ctx.phase] ?? DATE_POOLS.answering;
  const pick = pool[(Math.abs(ctx.index || 0) + Math.max(0, ctx.contestantNumber)) % pool.length];
  return pick.replace(/\{who\}/g, who);
}
