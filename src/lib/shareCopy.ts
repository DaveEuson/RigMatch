// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { TestedModelScore } from '../types';
import { isVerdictWorthy } from './taskScores.ts';

/**
 * The words that go out into the world with a share card.
 *
 * This copy is read by people who have never heard of RigMatch, so it has one
 * job the in-app copy does not: say what the app is and where to get it.
 * Dave's test post landed on LinkedIn as a score for a mystery product with no
 * link — a brag with no way for anyone to follow it.
 *
 * Hard rules, each earned:
 *
 *  - No question marks. LinkedIn's pre-filled composer truncated the post at
 *    the "?" of "top match?", eating the question mark AND the link after it.
 *  - The link is part of the message, phrased as "Get it:", so wherever the
 *    text survives, the pointer to the app survives with it.
 *  - No emoji butted against dashes — "💛 —" rendered as a smeared gap.
 *  - Say what the match is FOR. "granite4:3b won my PC's heart" tells a
 *    stranger nothing; "my PC's best local AI for coding" is a claim they can
 *    understand and compare with their own machine.
 */

export const SHARE_URL = 'https://daveeuson.github.io/RigMatch/';

/** Plain-purpose phrasing per task group, for "best local AI for <this>". */
const PURPOSE: Record<string, string> = {
  coding: 'coding',
  chat: 'everyday chat',
  writing: 'writing',
  facts: 'straight answers',
  tools: 'tools & automations',
  instructions: 'following instructions',
  // The only group that was measured and then had nowhere to land. It is
  // already gated harder than the rest: without a judge every answer reports
  // unjudged, so isVerdictWorthy rejects it and it cannot reach a card. With a
  // judge it separates further than any other group — a flat refusal and a
  // confidently invented answer both score 0 where the heuristic gave both 72.
  candour: 'difficult subjects',
};

/**
 * The skill this score is strongest at, from the groups the run actually
 * graded. Returns null for legacy scores with nothing verdict-worthy, and the
 * card then simply claims less — never more.
 */
export function strongestSkill(score: TestedModelScore): { id: string; purpose: string } | null {
  const tasks = score.taskScores ?? {};
  let best: { id: string; purpose: string; value: number } | null = null;
  for (const [id, task] of Object.entries(tasks)) {
    if (!isVerdictWorthy(task)) continue;
    const purpose = PURPOSE[id];
    if (!purpose) continue;
    if (!best || task.score > best.value) best = { id, purpose, value: task.score };
  }
  return best ? { id: best.id, purpose: best.purpose } : null;
}

export type ShareTexts = {
  /** The long form: LinkedIn, Reddit title, Bluesky. */
  full: string;
  /** X, where the URL is a separate parameter and space is tight. */
  short: string;
};

export function buildShareTexts(
  style: 'datingshow' | 'scorecard',
  modelName: string,
  score: TestedModelScore,
): ShareTexts {
  const strongest = strongestSkill(score);
  const claim = strongest
    ? `my PC's best local AI for ${strongest.purpose}`
    : `my PC's best local AI`;
  const result = `grade ${score.grade}, ${score.total}/100`;

  const opener = style === 'datingshow'
    ? `It's a match! ${modelName} is ${claim} — ${result}.`
    : `${modelName} is ${claim} — ${result}.`;

  // What RigMatch is, for the stranger reading this. One sentence, then the
  // pointer. "Free" and "on your own hardware" are the two facts that decide
  // whether anyone clicks.
  const what = `Found with RigMatch, a free app that speed-dates AI models on your own hardware.`;

  return {
    full: `${opener} ${what} Get it: ${SHARE_URL}`,
    // X appends the URL itself via the url= parameter.
    short: `${opener} ${what}`,
  };
}
