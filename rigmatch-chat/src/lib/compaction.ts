/**
 * What to do when a conversation outgrows the model's memory.
 *
 * Left alone, Ollama drops the oldest turns and says nothing — the transcript
 * keeps showing them while the model can no longer see any of them. Raising the
 * window buys room but not an unlimited amount.
 *
 * So: fold the older turns into a summary and send that instead. Two shapes,
 * because they answer different needs — compact in place to keep going, or
 * branch to a fresh thread and leave this one as it stands.
 *
 * The messages are never deleted. The transcript still shows every word that
 * was said; only what gets *sent* is shortened, and the boundary is marked so
 * the difference is visible rather than silent.
 */

import { estimateTokens } from "./contextWindow.ts";
import type { StoredMessage } from "./conversationStore";
import type { ChatMessage } from "./ollamaApi";

/**
 * Turns kept verbatim after a compaction. The most recent exchanges carry the
 * thread of what is being discussed right now, and a summary is a poor
 * substitute for them — six messages is roughly three exchanges.
 */
export const KEEP_RECENT_MESSAGES = 6;

/** Below this there is nothing worth folding up. */
export const MIN_MESSAGES_TO_COMPACT = 4;

/**
 * Recent conversation kept verbatim, in tokens. Roughly 1,500 words — enough to
 * hold the current thread of discussion without letting a couple of very long
 * replies defeat the whole point of compacting.
 */
export const KEEP_RECENT_TOKENS = 2000;

/** Always keep at least one exchange, however long it ran. */
export const MIN_KEEP_RECENT = 2;

export const SUMMARY_INSTRUCTION =
  "Summarise the conversation so far so it can stand in for the original messages. "
  + "Keep every concrete fact: names, numbers, dates, versions, file paths, decisions, and constraints. "
  + "Keep any instruction the user gave about how to answer. "
  + "Write it as compact notes, not prose. Do not add anything that was not said.";

/**
 * How many leading messages a compaction would fold away, or null when there is
 * nothing new to gain.
 *
 * `alreadySummarized` is what a previous compaction covered — a second pass has
 * to fold in more than the first, or it would burn a generation to replace a
 * summary with a summary of the same thing.
 */
export function compactionSplit(
  messages: StoredMessage[],
  alreadySummarized: number,
  options: { keepRecent?: number; keepTokenBudget?: number } = {},
): number | null {
  const { keepRecent = KEEP_RECENT_MESSAGES, keepTokenBudget = KEEP_RECENT_TOKENS } = options;
  if (messages.length < MIN_MESSAGES_TO_COMPACT) return null;

  // Count alone is not enough. Six recent messages can be longer than
  // everything before them — measured on one conversation, keeping a fixed six
  // left the prompt only 20% smaller, which is not worth a generation. Keep as
  // many recent messages as fit a token budget, up to the count cap.
  let kept = 0;
  let tokens = 0;
  for (let i = messages.length - 1; i >= 0 && kept < keepRecent; i--) {
    tokens += estimateTokens(messages[i].content);
    if (tokens > keepTokenBudget && kept >= MIN_KEEP_RECENT) break;
    kept += 1;
  }

  const target = messages.length - kept;
  if (target < 1 || target <= alreadySummarized) return null;
  return target;
}

/**
 * The request that produces a summary.
 *
 * A previous summary is included so a second compaction builds on it instead of
 * silently losing whatever the first one covered.
 */
export function buildSummaryRequest(
  messages: StoredMessage[],
  upToIndex: number,
  previousSummary?: string,
): ChatMessage[] {
  const transcript = messages.slice(0, upToIndex)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  const body = previousSummary
    ? `Notes from earlier in this conversation:\n${previousSummary}\n\nThe conversation continued:\n${transcript}`
    : transcript;
  return [
    { role: "system", content: SUMMARY_INSTRUCTION },
    { role: "user", content: body },
  ];
}

/**
 * The messages actually sent to the model: the summary, then everything it does
 * not cover.
 *
 * The summary goes in as a system message so it reads as background rather than
 * as something the user said, and survives Ollama's own truncation, which keeps
 * the system prompt and discards from the front of the conversation.
 */
export function buildContextMessages(
  messages: StoredMessage[],
  summary: string | undefined,
  summarizedCount: number,
): ChatMessage[] {
  const dropped = Math.max(0, Math.min(summarizedCount, messages.length));
  const body = messages.slice(dropped).map((m) => ({ role: m.role, content: m.content }));
  // Whether the summary is sent depends on the summary existing, not on the
  // count: a thread branched off another one carries a summary of the *other*
  // conversation and none of its own messages yet, so a count of zero there
  // means "everything you know came from the summary", not "ignore it".
  if (!summary) return body;
  return [
    { role: "system", content: `Summary of earlier in this conversation:\n${summary}` },
    ...body,
  ];
}

export type SummarizerChoice = {
  model: string;
  /** True when a stronger model than the one being chatted with was picked. */
  borrowed: boolean;
};

/**
 * Which model writes the summary.
 *
 * Ranked on `sobriety` — RigMatch's answer-quality measure — and deliberately
 * NOT on `total`. The total is a composite in which speed carries a large
 * share, so the highest-scoring model on a rig is typically the smallest and
 * fastest one. Ranking by it picked qwen2.5:0.5b (total 95) over llama3.2:3b
 * (total 86) and produced a summary that echoed the transcript back and lost a
 * fact, which is the opposite of what compaction needs. On the same models
 * sobriety puts them the right way round.
 *
 * Sobriety is itself a heuristic proxy rather than ground truth — the scoring
 * module says so — but it is the only quality signal available, and a directional
 * one beats a misleading one.
 *
 * The current model is kept when it is the best available, when nothing is
 * scored, or when the gain is small, since swapping costs a model load.
 */
export function pickSummarizer(
  currentModel: string,
  installed: string[],
  scores: Record<string, { sobriety?: number }>,
  minimumGain = 8,
): SummarizerChoice {
  const qualityOf = (model: string) => scores[model]?.sobriety ?? -1;
  const best = installed
    .filter((m) => qualityOf(m) >= 0)
    .sort((a, b) => qualityOf(b) - qualityOf(a))[0];
  if (!best || best === currentModel) return { model: currentModel, borrowed: false };
  if (qualityOf(best) - qualityOf(currentModel) < minimumGain) {
    return { model: currentModel, borrowed: false };
  }
  return { model: best, borrowed: true };
}

/** Title for a thread branched off another one. */
export function continuationTitle(title: string): string {
  const match = title.match(/^(.*) \((\d+)\)$/);
  if (match) return `${match[1]} (${Number(match[2]) + 1})`;
  return `${title} (2)`;
}
