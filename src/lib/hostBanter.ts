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

export function getHostBanter(ctx: HostBanterContext): string {
  const who = ctx.contestantNumber > 0
    ? `Contestant #${ctx.contestantNumber} (${ctx.model})`
    : (ctx.model || 'our next contestant');
  const pool = POOLS[ctx.phase] ?? POOLS.asking;
  const pick = pool[(Math.abs(ctx.index || 0) + Math.max(0, ctx.contestantNumber)) % pool.length];
  return pick
    .replace(/\{who\}/g, who)
    .replace(/\{q\}/g, ctx.questionLabel || 'the next one');
}
