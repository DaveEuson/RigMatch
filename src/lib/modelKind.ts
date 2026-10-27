// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Models that cannot hold a conversation at all, and what they do instead.
 *
 * Two kinds turned up on Ollama in October 2026, and both were graded, listed
 * and seated in shows as if they were chat models:
 *
 *   decision  scores text or a picture and answers with a verdict (d3, kev,
 *             nimble, clef...). Ollama labels them with a `decision` badge.
 *   audio     turns text into speech or sound (phonon, kokoro, orpheus). Ollama
 *             reports `speech`; no provider here runs one for RigMatch yet.
 *
 * The app (canGenerateText, so every list, show and judge that asks "can it
 * answer?") and the command line (rigmatch-fit) both ask this one function,
 * which is how they stopped being able to disagree.
 *
 * What the provider reports comes first: Ollama's capability list has a
 * `decision` and a `speech` entry (types/model/capability.go in ollama/ollama),
 * and an installed model says so through /api/show. The family's page
 * description is next, since not every page carries the badge (d1 and d1-omni
 * show only `vision`, and phonon shows no badge at all). A name list is the
 * last resort, for a model the PC has installed and nothing has described.
 */

export type NonChatKind = 'decision' | 'audio';

type KindBearing = {
  capabilities?: string[];
  installedModel?: { capabilities?: string[] };
  /** The family's one-line description from its Ollama page. */
  description?: string;
  displayName?: string;
  name?: string;
};

/** Short, for a tag on a row. */
export const NON_CHAT_TAG: Record<NonChatKind, string> = {
  decision: 'Decision model',
  audio: 'Audio model',
};

/** One sentence the person can read, for a tooltip or a detail line. */
export const NON_CHAT_NOTE: Record<NonChatKind, string> = {
  decision: "Decision model: scores text, doesn't chat.",
  audio: "Audio model: makes speech or sound, doesn't chat.",
};

/**
 * What the decision families' pages say. "decision model" is the usual wording
 * (nimble, tev1, d1, pplx-decider); d3, kev and clef word it differently.
 */
const DECISION_DESCRIPTION = /\bdecision models?\b|\bscored choices\b|\bscores answers to structured questions\b|\binto decisions\b/i;

/**
 * Decision families by name, for an installed model with no description. The
 * list is the ones seen on Ollama so far; the badge and the description above
 * are what catch the next one.
 */
const DECISION_FAMILY = /^(?:d1|d1-omni|d3|kev|nimble|nimble-v3|tev1|strands-decider|clef|clef-flash|pplx-decider|laya)$|-decider$/;

/**
 * A page that says it is a text-to-speech model ("Phonon is Gradium's
 * text-to-speech family"), and not one that merely lists speech among many
 * things it can do.
 */
const SPEECH_DESCRIPTION = /\b(?:is|are)\s+(?:[\w-]+['’]s\s+|an?\s+|the\s+)?(?:[\w-]+\s+){0,3}(?:text-?to-?speech|speech synthesis)\s+(?:family|models?|system|engine)\b/i;

/**
 * Models that produce audio — TTS and music.
 *
 * Name-only, because no local provider runs one for RigMatch yet. Same
 * contract as the video chips: recognizable the day they exist, hidden until
 * then. phonon is listed by name because its page has no badge and says
 * "text-to-speech family" rather than "model", which SPEECH_DESCRIPTION also
 * reads; the name keeps an installed copy from passing as a chat model.
 */
export function isLikelyAudioGenerationModel(name: string): boolean {
  const lower = (name || '').toLowerCase();
  if (/whisper|transcribe/.test(lower)) return false; // hears, does not speak
  return /\btts\b|text-?to-?speech|kokoro|orpheus|\bbark\b|musicgen|stable-?audio|ace-?step|parler|\bphonon\b/.test(lower);
}

/** "d3" from "d3:4b", "kev" from "library/kev:latest". */
function familyOf(name: string): string {
  return (name || '').toLowerCase().split(':')[0].split('/').pop() ?? '';
}

/** Whether, and why, this model cannot be asked questions and graded on its answers. */
export function nonChatKind(row: KindBearing): NonChatKind | null {
  // Both lists, not just the one the app prefers: the installed model's own
  // report wins elsewhere, but a page badge is just as good a reason to
  // keep a model out of a chat.
  const reported = [...(row.installedModel?.capabilities ?? []), ...(row.capabilities ?? [])];
  if (reported.includes('decision')) return 'decision';
  if (reported.includes('speech')) return 'audio';
  const name = row.displayName ?? row.name ?? '';
  const description = row.description ?? '';
  if (DECISION_DESCRIPTION.test(description) || DECISION_FAMILY.test(familyOf(name))) return 'decision';
  if (SPEECH_DESCRIPTION.test(description) || isLikelyAudioGenerationModel(name)) return 'audio';
  return null;
}
