// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Scoring a generated clip of audio, and the prompts it is scored against.
 *
 * The same shape as the picture and video tests. Every benchmark prompt comes
 * with yes/no questions whose answers are known, the clip is played to a model
 * that can hear, and how many it answers the way the prompt says is the clip's
 * accuracy. A prompt someone types has no questions, so it is rendered and
 * timed but not scored for accuracy, rather than judged against a guess.
 *
 * Speed is cost per second of audio, so thirty seconds is not penalised against
 * ten for being three times the work.
 */

import { customImagePrompt, CUSTOM_IMAGE_PROMPT_ID, type ImagePrompt } from './imageGenScoring.ts';
import { getAdvancedLabGrade } from './labScoring.ts';

/**
 * A prompt and the questions a listening model answers about the clip.
 *
 * `bpm` is the tempo the prompt asks for, given to the one model with a tempo
 * input (ACE-Step 1.5, whose template sets one). The others read the tempo
 * from the words, which is how they were built to be asked.
 */
export type AudioPrompt = ImagePrompt & { bpm?: number };

/**
 * The benchmark prompts: a sound effect, and two kinds of music.
 *
 * Each has something it must contain and something it must not, because a
 * listener that says yes to everything should not score well: the question
 * whose answer is no is what catches it. The sound effect is also where a
 * music model shows it makes music whatever it is asked for.
 */
export const AUDIO_BENCHMARK_PROMPTS: AudioPrompt[] = [
  {
    id: 'rain',
    prompt: 'Heavy rain on a tin roof with distant rolling thunder',
    propositions: [
      { id: 'rain', question: 'Can you hear rain in this recording?', expected: true },
      { id: 'thunder', question: 'Can you hear thunder in this recording?', expected: true },
      { id: 'music', question: 'Is there music in this recording?', expected: false },
    ],
  },
  {
    id: 'dance',
    prompt: 'Upbeat electronic dance music with a punchy drum beat and a deep synth bass, no vocals',
    bpm: 124,
    propositions: [
      { id: 'music', question: 'Is this recording music?', expected: true },
      { id: 'drums', question: 'Is there a steady drum beat in this recording?', expected: true },
      { id: 'singing', question: 'Is anyone singing in this recording?', expected: false },
    ],
  },
  {
    id: 'guitar',
    prompt: 'A calm solo acoustic guitar melody, slow and gentle, no drums',
    bpm: 72,
    propositions: [
      { id: 'guitar', question: 'Can you hear a guitar in this recording?', expected: true },
      { id: 'drums', question: 'Are there drums in this recording?', expected: false },
      { id: 'calm', question: 'Is the music in this recording calm and slow?', expected: true },
    ],
  },
];

/** The prompt for a run: a benchmark prompt, or your own words with nothing to check. */
export function audioPromptById(promptId?: string, customText?: string): AudioPrompt {
  if (promptId === CUSTOM_IMAGE_PROMPT_ID && customText && customText.trim()) {
    return customImagePrompt(customText);
  }
  return AUDIO_BENCHMARK_PROMPTS.find((prompt) => prompt.id === promptId) ?? AUDIO_BENCHMARK_PROMPTS[0];
}

/**
 * Whether a listener's answers say anything about this clip.
 *
 * Every benchmark prompt mixes questions whose answer is yes with ones whose
 * answer is no, so a listener that gives them all the same answer has not told
 * this clip from any other. Both Gemma 4 models Ollama offers did exactly that
 * with real music and rain, answering No throughout: each clip scored one in
 * three, for the questions to which No happens to be right. That is a listener
 * that cannot tell, and the clip is unjudged rather than scored.
 */
export function listenerTellsApart(verdicts: (boolean | null)[]): boolean {
  const answers = verdicts.filter((verdict): verdict is boolean => verdict !== null);
  return answers.length < 2 || answers.some((answer) => answer !== answers[0]);
}

/**
 * Seconds of compute per second of audio.
 *
 * At one or less the model renders as fast as the clip plays, which is a tool
 * someone can iterate with; at ten they start a render and do something else.
 */
export const COMFORTABLE_AUDIO_COST = 1;
export const PAINFUL_AUDIO_COST = 10;

export function audioRealtimeCost(elapsedMs: number, seconds: number): number {
  return seconds > 0 ? elapsedMs / 1000 / seconds : 0;
}

export function scoreAudioSpeed(elapsedMs: number, seconds: number): number {
  if (seconds <= 0 || elapsedMs <= 0) return 0;
  const cost = audioRealtimeCost(elapsedMs, seconds);
  if (cost <= COMFORTABLE_AUDIO_COST) return 1;
  if (cost >= PAINFUL_AUDIO_COST) return 0;
  return 1 - (cost - COMFORTABLE_AUDIO_COST) / (PAINFUL_AUDIO_COST - COMFORTABLE_AUDIO_COST);
}

export type AudioRunFacts = {
  produced: boolean;
  elapsedMs: number;
  /** Seconds of audio the clip holds. */
  seconds: number;
  /** How much of the prompt the listener confirmed, or null when nothing could judge it. */
  adherence: number | null;
  /** Why a clip that was listened to is still unjudged, when it is. */
  unjudgedReason?: string;
  /** The accuracy is your verdict on hearing it, not a listener's. */
  byEar?: boolean;
};

/**
 * Half speed, half what the listener heard.
 *
 * The listener hears the whole clip, not one frame of it as the video judge
 * sees, so what it confirms carries as much weight as the time. Accuracy is
 * withheld rather than redistributed when nothing judged, as for pictures: a
 * fast machine must not score full marks on a clip nobody listened to.
 */
const WEIGHT_SPEED = 0.5;
const WEIGHT_ADHERENCE = 0.5;

export function scoreAudioGeneration(facts: AudioRunFacts): {
  score: number;
  grade: string;
  judged: boolean;
  realtimeCost: number;
  checks: { label: string; passed: boolean; detail: string }[];
} {
  const speed = scoreAudioSpeed(facts.elapsedMs, facts.seconds);
  const cost = audioRealtimeCost(facts.elapsedMs, facts.seconds);
  const judged = facts.adherence !== null;

  const checks = [
    {
      label: 'Audio produced',
      passed: facts.produced,
      detail: facts.produced
        ? `${Math.round(facts.seconds)} seconds of audio.`
        : 'The graph ran but produced no audio.',
    },
    {
      label: 'Matches the prompt',
      passed: judged && (facts.adherence ?? 0) >= 0.8,
      detail: !judged
        ? facts.unjudgedReason ?? 'Nothing that can hear checked the clip, so this run is unjudged.'
        : facts.byEar
          ? (facts.adherence ?? 0) >= 0.8
            ? 'You listened, and it sounds like the prompt.'
            : 'You listened, and it does not sound like the prompt.'
          : `A listening model confirmed ${Math.round((facts.adherence ?? 0) * 100)}% of the prompt in the clip.`,
    },
    {
      label: 'Usable speed',
      passed: speed >= 0.5,
      detail: `${cost.toFixed(1)}x realtime: ${(facts.elapsedMs / 1000).toFixed(1)} s of compute for ${Math.round(facts.seconds)} s of audio.`,
    },
  ];

  if (!facts.produced) {
    return { score: 0, grade: getAdvancedLabGrade(0), judged: false, realtimeCost: cost, checks };
  }

  const earned = speed * WEIGHT_SPEED + (judged ? (facts.adherence ?? 0) * WEIGHT_ADHERENCE : 0);
  const score = Math.round(earned * 100);
  return { score, grade: getAdvancedLabGrade(score), judged, realtimeCost: cost, checks };
}
