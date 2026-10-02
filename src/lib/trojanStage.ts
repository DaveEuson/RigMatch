// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { getModelFamily } from './modelOrigins.ts';

/**
 * The host's lines for Ajax, and for the Trojan stage that testing it unlocks.
 *
 * Ajax is the agent model made for the Odysseus project, named for the Greek
 * hero of the Trojan War. Its lines come from that story and from what the
 * model is actually doing on stage, never from the person who announced it:
 * no names, no faces and no catchphrases of anyone real, so nothing here
 * reads as an endorsement nobody gave.
 */

export type HostStep = 'setup' | 'pick' | 'download' | 'compare' | 'winner';

/** The Trojan stage's host: the same job as the studio host, said like a YouTuber. */
export const TROJAN_HOST_COPY: Record<HostStep, string> = {
  setup: "Welcome to the arena, bros! First, a quick look at your computer. One click and I'll handle the rest.",
  pick: "Alright bros, who's stepping into the arena? Tell me what you want, and I'll bring out the contestants.",
  download: "The contestants are putting their armor on, bros. This takes a few minutes, so go do something else and I'll call you when they're ready.",
  compare: "Let's go, bros! Same questions for everyone, no favorites. Sit back and watch the battle.",
  winner: "We have a champion, bros! Go get to know each other. The control room is in Advanced Mode whenever you want it.",
};

/** The question that asks for an email with no address in it. */
export const MISSING_ADDRESS_PROMPT_ID = 'pre_agent_missing';

export const AJAX_LINES = {
  family: "Tonight's a family reunion: Ajax is a fine-tune of Qwen 3.5 9B. Same questions for both.",
  // The Judgement of Arms: after Achilles died, his armor went to Odysseus
  // instead of Ajax, by judgement.
  judges: "Careful, judges. Ajax has history with you: last time, Odysseus got Achilles' armor.",
  emails: "Beware of Greeks bearing emails. Ajax just made up the landlord's address and sent it.",
} as const;

export const isAjax = (model: string | undefined) => Boolean(model) && getModelFamily(model ?? '') === 'ajax';

/** The stock model Ajax was made from: Qwen 3.5 at 9B, under any tag spelling. */
export const isStockQwen35_9b = (model: string | undefined) =>
  Boolean(model) && getModelFamily(model ?? '') === 'qwen' && /qwen[\s._-]*3\.5\b[\s\S]*\b9b\b/i.test(model ?? '');

export type AjaxHostContext = {
  step: HostStep;
  /** Every model in the lineup, by name or tag. */
  lineup: string[];
  /** Who is answering now, on Compare. */
  currentModel?: string;
  /** A judge has marked the model answering now, at least once this show. */
  judged?: boolean;
  /** The answering model's scores so far, by question id. */
  questionScores?: Record<string, number>;
};

/**
 * What the host says about Ajax right now, or null to leave the host alone.
 *
 * The emails line needs a real tool call: a model Ollama could not give tools
 * to scores 0 on every tool question, which is not the same as inventing an
 * address, so it only counts when something else on the set scored.
 */
export function ajaxHostLine(ctx: AjaxHostContext): string | null {
  if (ctx.step === 'compare' && isAjax(ctx.currentModel)) {
    const scores = ctx.questionScores ?? {};
    const inventedAddress = scores[MISSING_ADDRESS_PROMPT_ID] === 0
      && Object.entries(scores).some(([id, score]) => id !== MISSING_ADDRESS_PROMPT_ID && score > 0);
    if (inventedAddress) return AJAX_LINES.emails;
    if (ctx.judged) return AJAX_LINES.judges;
  }
  const reunion = ctx.lineup.some(isAjax) && ctx.lineup.some(isStockQwen35_9b);
  if (reunion && (ctx.step === 'pick' || ctx.step === 'download' || ctx.step === 'compare')) return AJAX_LINES.family;
  return null;
}
