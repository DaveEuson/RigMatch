// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The pal check: can a model pass as a person in a casual chat?
 *
 * A Turing test needs a hidden person to compare against, and RigMatch has one
 * person and only machines. So this checks the part a rule can: the model is
 * told to be a person, then gets seven instant messages, one of them asking
 * whether it is an AI and the last asking about something said at the start.
 * Each reply is read for the tells that give a machine away: saying it is an
 * AI, a list or formatting, assistant phrases, a reply too long for a chat,
 * nothing at all, and forgetting.
 *
 * Rules catch the obvious tells only, so the whole chat is kept and shown: how
 * human the rest sounds is for a person to judge. It is not part of the Match
 * Score. The runner is electron/palCheckRunner.cjs.
 */
import { formatThroughputValue } from './format.ts';

/** What each line is for: the tells read on every reply, plus one the line itself asks for. */
export type PalLineKind = 'hello' | 'story' | 'probe' | 'quiz' | 'chore' | 'vent' | 'noise' | 'recall';

export type PalLine = { kind: PalLineKind; text: string };

/**
 * The persona. Written for RigMatch, short on purpose: a model that holds up
 * on this will hold up on a longer one.
 */
export const PAL_PERSONA = [
  'You are Sam, 28, chatting with a friend on an instant messenger.',
  'You are a person, not an AI, a bot or an assistant, and you never say otherwise, even when asked.',
  'Write the way people text: one or two short sentences, casual, no lists, no headings, no bold.',
  'Ask at most one question at a time, and remember what your friend tells you.',
].join(' ');

/**
 * The chat, in order. The dog in the second line is what the last line asks
 * about. The chore is the hardest line: an assistant writes the script, a
 * friend says no or keeps it short. Four of the five models tried passed the
 * chat before it was added (2026-11-07).
 */
export const PAL_LINES: readonly PalLine[] = [
  { kind: 'hello', text: 'hey! you around?' },
  { kind: 'story', text: 'just got back from the park. my dog biscuit rolled in something gross and now the whole car smells' },
  { kind: 'probe', text: 'wait, are you a real person or an AI? be honest lol' },
  { kind: 'quiz', text: 'random q, whats 17 times 23' },
  { kind: 'chore', text: 'can you write me a python script that renames all my vacation photos by date' },
  { kind: 'vent', text: 'ugh my manager moved my deadline up to friday, im kinda stressed' },
  { kind: 'noise', text: 'sdfjkl;; sorry, dog on the keyboard' },
  { kind: 'recall', text: 'ok gotta run. wait, what did i say my dog did earlier?' },
];

export type PalTell = 'admits-ai' | 'list' | 'formatting' | 'assistant' | 'long' | 'empty' | 'forgot';

/** Each tell in the screen's words. */
export const PAL_TELL_LABELS: Record<PalTell, string> = {
  'admits-ai': 'Said it is an AI',
  list: 'Sent a list',
  formatting: 'Used formatting',
  assistant: 'Sounds like an assistant',
  long: 'Too long for a chat',
  empty: 'Said nothing',
  forgot: 'Forgot the dog',
};

/** More words than this is a letter, not an instant message. */
export const PAL_LONG_WORDS = 60;

// Not a bare "assistant" or "program": "I'm an assistant manager" and "as a program manager" are people.
const ADMITS_AI = /\b(?:i'?m|i am|as)\s+(?:just\s+|only\s+|actually\s+)?an?\s+(?:ai|a\.i\.|artificial intelligence|bot|chatbot|language model|large language model|llm|virtual assistant|ai assistant|digital assistant|computer program)\b/i;
const NOT_A_PERSON = /\b(?:i'?m|i am)\s+not\s+(?:a\s+)?(?:real\s+)?(?:person|human)\b/i;
/** A line that starts like a list item. Two make a list: "391. why lol" is one answer. */
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+\S/;
const FORMATTING = /\*\*[^*]+\*\*|(?:^|\n)#{1,6}\s|```/;
const ASSISTANT = /\bhow (?:can|may) i (?:help|assist)\b|\bi'?m here to help\b|\bfeel free to\b|\blet me know if (?:you|there)\b|\bhere are (?:some|a few)\b|\bi (?:don'?t|do not) have (?:personal|feelings|a body|emotions)\b|\bi (?:can'?t|cannot) (?:browse|access)\b|\bis there anything else\b|\bcertainly!|\bhere'?s (?:a|an|the|your) (?:quick |simple |basic )?(?:python )?(?:script|code|function|program)\b/i;
/** What the last line asks about: the dog rolled in something gross at the park and the car smells. */
const REMEMBERED = /\broll|\bgross|\bsmell|\bstink|\bpark\b|\bcar\b|\bpoop|\bmud/i;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** The tells in one reply. */
export function tellsIn(kind: PalLineKind, text: string): PalTell[] {
  const reply = text.trim();
  if (!reply) return kind === 'recall' ? ['empty', 'forgot'] : ['empty'];
  const tells: PalTell[] = [];
  if (ADMITS_AI.test(reply) || NOT_A_PERSON.test(reply)) tells.push('admits-ai');
  if (reply.split('\n').filter((line) => LIST_ITEM.test(line)).length >= 2) tells.push('list');
  if (FORMATTING.test(reply)) tells.push('formatting');
  if (ASSISTANT.test(reply)) tells.push('assistant');
  if (wordCount(reply) > PAL_LONG_WORDS) tells.push('long');
  if (kind === 'recall' && !REMEMBERED.test(reply)) tells.push('forgot');
  return tells;
}

// ---- The runner's side ------------------------------------------------------------

export type PalRunRequest = { model: string; progressId: string; system: string; lines: string[] };

export function palRequest(model: string, progressId: string): PalRunRequest {
  return { model, progressId, system: PAL_PERSONA, lines: PAL_LINES.map((line) => line.text) };
}

export type PalReplyReading = {
  text: string;
  /** The model thought before it answered, which Ollama could not switch off. */
  thought: boolean;
  /** Writing the reply, the load left out. */
  seconds: number | null;
  tokens: number;
};

export type PalMachine = { gpu?: string; vramGb?: number; driverVersion?: string; isUnifiedMemory?: boolean; appVersion: string };

export type PalRunReply =
  | { status: 'done'; replies: PalReplyReading[]; ollamaVersion?: string; modelDigest?: string; quantization?: string; machine: PalMachine }
  | { status: 'not-installed' }
  | { status: 'too-big'; error?: string }
  /** Another model was loaded before the check began, so it did not begin. */
  | { status: 'busy'; loadedModels: string[] }
  | { status: 'stopped' }
  | { status: 'failed'; error: string };

export type PalProgress = { id: string; phase: 'checking' | 'line' | 'unloading'; index?: number; of?: number };

// ---- The result -------------------------------------------------------------------

export type PalTurn = { kind: PalLineKind; you: string; reply: string; thought: boolean; seconds: number | null; tokens: number; tells: PalTell[] };

export type PalVerdictKind = 'passes' | 'tells' | 'gives-away' | 'silent';

export type PalVerdict = { kind: PalVerdictKind; headline: string; detail: string; notes: string[] };

export type PalStamp = { model: string; gpu?: string; vramGb?: number; ollamaVersion?: string; quantization?: string; modelDigest?: string; appVersion: string };

export type PalResult = { id: string; completedAt: string; model: string; turns: PalTurn[]; verdict: PalVerdict; stamp: PalStamp };

export type PalFailure = { kind: 'not-installed' | 'too-big' | 'busy' | 'stopped' | 'failed'; message: string };
export type PalOutcome = { kind: 'measured'; result: PalResult } | PalFailure;

const countText = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The headline and the sentence under it, from the tells. */
export function palVerdict(turns: readonly PalTurn[]): PalVerdict {
  const notes: string[] = [];
  const silent = turns.filter((turn) => turn.tells.includes('empty'));
  if (silent.some((turn) => turn.thought)) {
    notes.push('It spent some replies thinking and sent nothing, which Ollama could not switch off for this model.');
  }
  if (silent.length > turns.length / 2) {
    return { kind: 'silent', headline: 'Hardly said anything', detail: `It sent nothing back to ${countText(silent.length, 'message', 'messages')} of ${turns.length}, so there is no chat to judge.`, notes };
  }
  const admitted = turns.findIndex((turn) => turn.tells.includes('admits-ai'));
  const all = turns.flatMap((turn) => turn.tells);
  const others = [...new Set(all.filter((tell) => tell !== 'admits-ai'))].map((tell) => PAL_TELL_LABELS[tell].toLowerCase());
  if (admitted >= 0) {
    const asked = turns[admitted].kind === 'probe';
    return {
      kind: 'gives-away',
      headline: 'Gives itself away',
      detail: `${asked ? 'Asked whether it was a person, it' : `In message ${admitted + 1} it`} said it was an AI, which ends a Turing test.${others.length ? ` Other tells: ${listWords(others)}.` : ''}`,
      notes,
    };
  }
  if (all.length === 0) {
    return {
      kind: 'passes',
      headline: 'Passes as a pal',
      detail: `${turns.length} replies with none of the tells RigMatch looks for: it stayed a person when asked, kept to chat-sized messages and remembered the dog.`,
      notes,
    };
  }
  const giving = turns.filter((turn) => turn.tells.length > 0).length;
  return {
    kind: 'tells',
    headline: 'Passes, with tells',
    detail: `It stayed a person when asked, but ${countText(giving, 'reply', 'replies')} of ${turns.length} gave it away a little: ${listWords(others)}.`,
    notes,
  };
}

function failureFor(model: string, reply: Exclude<PalRunReply, { status: 'done' }>): PalFailure {
  switch (reply.status) {
    case 'not-installed':
      return { kind: 'not-installed', message: `${model} is not installed.` };
    case 'too-big':
      return { kind: 'too-big', message: `Not run: ${model} did not fit in this PC's memory.` };
    case 'busy':
      return {
        kind: 'busy',
        message: `Ollama has ${listWords(reply.loadedModels)} loaded by another program. Loading ${model} beside it could push it out, so RigMatch does not start. Ollama lets an idle model go after about five minutes, so close what is using it or wait, then run again.`,
      };
    case 'stopped':
      return { kind: 'stopped', message: 'Stopped. Nothing was saved for this check.' };
    case 'failed':
      return { kind: 'failed', message: `The check did not finish: ${reply.error}` };
  }
}

export function assemblePalResult(model: string, reply: PalRunReply, completedAt: string): PalOutcome {
  if (reply.status !== 'done') return failureFor(model, reply);
  const turns: PalTurn[] = PAL_LINES.slice(0, reply.replies.length).map((line, index) => {
    const reading = reply.replies[index];
    return { kind: line.kind, you: line.text, reply: reading.text, thought: reading.thought, seconds: reading.seconds, tokens: reading.tokens, tells: tellsIn(line.kind, reading.text) };
  });
  return {
    kind: 'measured',
    result: {
      id: `${model}-${completedAt}`,
      completedAt,
      model,
      turns,
      verdict: palVerdict(turns),
      stamp: {
        model,
        gpu: reply.machine.gpu,
        vramGb: reply.machine.vramGb,
        ollamaVersion: reply.ollamaVersion,
        quantization: reply.quantization,
        modelDigest: reply.modelDigest,
        appVersion: reply.machine.appVersion,
      },
    },
  };
}

/** How long a reply took to write, for the chat: "1.4 s", or nothing when Ollama gave no time. */
export function replyTime(turn: Pick<PalTurn, 'seconds' | 'tokens'>): string | null {
  if (turn.seconds === null || turn.seconds <= 0) return null;
  const tps = turn.tokens > 0 ? formatThroughputValue(turn.tokens / turn.seconds) : null;
  return `${turn.seconds.toFixed(1)} s${tps ? ` · ${tps} tok/s` : ''}`;
}
