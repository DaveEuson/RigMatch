/**
 * Things the user has asked to be remembered across conversations.
 *
 * Every thread starts clean, which is right for a conversation and wrong for an
 * assistant — a local model met you for the first time every session. Settings
 * has always had a system-prompt box that could hold this, and nobody uses it,
 * because maintaining a paragraph by hand is work.
 *
 * Two rules shape everything here. Nothing is remembered unless the user says
 * so, because silent memory is how this feature becomes both creepy and wrong.
 * And it is budgeted, because memory that grows without limit quietly recreates
 * the context problem it is sitting next to.
 */

import { estimateTokens } from "./contextWindow.ts";

export type Memory = {
  id: string;
  text: string;
  createdAt: number;
  /** Kept but not sent. Lets someone silence one without deleting it. */
  enabled: boolean;
};

export const MEMORY_STORE_VERSION = 1;

/**
 * Ceiling on what memory may add to every request. About 400 words — far more
 * than anyone will write by hand, and small beside even a 16K window.
 */
export const MEMORY_TOKEN_BUDGET = 500;

/** A stop on the list itself, so the file cannot grow without bound. */
export const MAX_MEMORIES = 100;

/** Longer than this is a document, not a fact worth carrying everywhere. */
export const MAX_MEMORY_LENGTH = 400;

export function serializeMemories(memories: Memory[]): string {
  return JSON.stringify({ version: MEMORY_STORE_VERSION, memories });
}

/** Anything unreadable yields null, and the caller keeps what it has. */
export function parseMemories(raw: string | null): Memory[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const file = parsed as { version?: unknown; memories?: unknown };
  if (file.version !== MEMORY_STORE_VERSION) return null;
  if (!Array.isArray(file.memories)) return null;

  return file.memories
    .filter((m): m is Memory => !!m && typeof m === "object" && typeof (m as Memory).text === "string")
    .map((m, index) => ({
      id: typeof m.id === "string" && m.id ? m.id : `memory-${index}`,
      text: m.text.trim().slice(0, MAX_MEMORY_LENGTH),
      createdAt: typeof m.createdAt === "number" ? m.createdAt : 0,
      enabled: m.enabled !== false,
    }))
    .filter((m) => m.text.length > 0);
}

/**
 * Add a fact, unless it is already there.
 *
 * "Remember this" on the same message twice is an easy accident, and a
 * duplicated fact wastes budget and reads as though it were said twice.
 */
export function addMemory(
  memories: Memory[],
  text: string,
  options: { id: string; now: number },
): Memory[] {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, MAX_MEMORY_LENGTH);
  if (!clean) return memories;
  if (memories.some((m) => m.text.toLowerCase() === clean.toLowerCase())) return memories;

  const next = [...memories, { id: options.id, text: clean, createdAt: options.now, enabled: true }];
  // Oldest go first when the cap is reached: the newest are the most current,
  // and a contradiction should resolve to what was said most recently.
  return next.length > MAX_MEMORIES ? next.slice(next.length - MAX_MEMORIES) : next;
}

export function updateMemory(memories: Memory[], id: string, text: string): Memory[] {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, MAX_MEMORY_LENGTH);
  // Emptying the box is how you delete one, rather than leaving a blank row.
  if (!clean) return memories.filter((m) => m.id !== id);
  return memories.map((m) => (m.id === id ? { ...m, text: clean } : m));
}

export function removeMemory(memories: Memory[], id: string): Memory[] {
  return memories.filter((m) => m.id !== id);
}

export function setMemoryEnabled(memories: Memory[], id: string, enabled: boolean): Memory[] {
  return memories.map((m) => (m.id === id ? { ...m, enabled } : m));
}

export type MemoryNote = {
  text: string;
  /** How many made it in — the rest did not fit the budget. */
  used: number;
  omitted: number;
  tokens: number;
};

/**
 * The block prepended to every conversation, or null when there is nothing to
 * say.
 *
 * When the list outgrows the budget the newest survive, for the same reason as
 * the cap: the most recent statement is the most likely to still be true. They
 * are rendered oldest first so the block reads as a history rather than a
 * reverse-chronological feed.
 */
export function buildMemoryNote(
  memories: Memory[],
  budgetTokens: number = MEMORY_TOKEN_BUDGET,
): MemoryNote | null {
  const active = memories.filter((m) => m.enabled && m.text.trim());
  if (active.length === 0) return null;

  const header = "The user has asked you to remember these things about them:";
  const headerTokens = estimateTokens(header);

  const kept: Memory[] = [];
  let tokens = headerTokens;
  // Walk newest to oldest so the newest are the ones that fit.
  for (let i = active.length - 1; i >= 0; i--) {
    const line = `- ${active[i].text}`;
    const cost = estimateTokens(line);
    if (kept.length > 0 && tokens + cost > budgetTokens) break;
    tokens += cost;
    kept.unshift(active[i]);
  }

  return {
    text: `${header}\n${kept.map((m) => `- ${m.text}`).join("\n")}`,
    used: kept.length,
    omitted: active.length - kept.length,
    tokens,
  };
}
