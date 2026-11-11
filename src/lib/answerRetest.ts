// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkPromptResult, BenchmarkResult } from '../types';
import { formatLocale } from './formatLocale.ts';

/**
 * What to say under an answer that went wrong, and whether asking again helps.
 *
 * RigMatch asks with a fixed seed, at temperature 0 or at the model's own
 * settings (electron/modelSettings.cjs), so an answer the model cut off at the
 * token limit comes back the same every time. Only an answer the PC
 * broke is worth asking again, and the main process decides for certain
 * (canRetest in electron/benchmarkRetest.cjs); this is what the panel shows,
 * by the same rule.
 */
export type AnswerNote = {
  text: string;
  /** "Test this question again" belongs under this answer. */
  retestable: boolean;
};

/** Two judges this far apart is said beside the answer; JUDGE_SPREAD_FLAG in electron/judgePanel.cjs. */
export const JUDGE_SPREAD_FLAG = 20;

const ranOutOfTime = (prompt: Pick<BenchmarkPromptResult, 'timedOut' | 'doneReason'>) =>
  prompt.timedOut === true || /^timeout$/i.test(prompt.doneReason || '');

/**
 * The question's text was saved. A history saved when storage was nearly full
 * keeps the scores and drops it (dropTranscripts in safeStorage.ts), and the
 * main process will not ask an empty question.
 */
const questionKept = (prompt: Pick<BenchmarkPromptResult, 'prompt'>) =>
  typeof prompt.prompt === 'string' && prompt.prompt.trim() !== '';

export function answerNote(prompt: BenchmarkPromptResult): AnswerNote | null {
  if (prompt.retest) {
    const when = new Date(prompt.retest.at).toLocaleString(formatLocale(), { dateStyle: 'medium', timeStyle: 'short' });
    // Asked again and out of time again: still left out, and it can be asked once more.
    if (ranOutOfTime(prompt)) {
      return {
        text: `Asked again on ${when}, and it ran out of time again, so it is still left out of the score. Something may still be using the graphics card.`,
        retestable: typeof prompt.countedRuns === 'number' && questionKept(prompt),
      };
    }
    const first = ranOutOfTime(prompt.retest.firstTry) ? 'ran out of time' : 'went wrong';
    return { text: `Asked again on ${when}. The first try ${first}.`, retestable: false };
  }
  if (ranOutOfTime(prompt)) {
    if (typeof prompt.countedRuns !== 'number') {
      return { text: 'Ran out of time, so it is left out of the score. This test was saved before RigMatch could ask one question again; test the model again instead.', retestable: false };
    }
    return questionKept(prompt)
      ? { text: 'Ran out of time, so it is left out of the score. That is the PC\'s speed, not the answer: another program using the graphics card can cause it.', retestable: true }
      : { text: 'Ran out of time, so it is left out of the score. Its question was not kept when storage ran low, so it cannot be asked again on its own; test the model again instead.', retestable: false };
  }
  if (/length/i.test(prompt.doneReason || '') && prompt.status !== 'ok') {
    return {
      text: 'Cut off at the token limit. RigMatch asks with a fixed seed, so the model writes the same answer every time, and asking again would not change it.',
      retestable: false,
    };
  }
  if (prompt.retriedAfter) {
    return { text: `Asked twice: the first try ${prompt.retriedAfter === 'timed out' ? 'timed out' : 'lost the connection to Ollama'}, so RigMatch asked again.`, retestable: false };
  }
  return null;
}

/**
 * Who marked an answer when two judges did, and whether they agreed: their
 * marks are averaged into its score (electron/judgePanel.cjs), and a wide gap
 * is said, because then neither mark means much on its own.
 */
export function judgeNote(prompt: BenchmarkPromptResult): string | null {
  const marks = prompt.judgeMarks;
  if (!marks || marks.length < 2) return null;
  const [a, b] = marks;
  const spread = Math.abs(a.score - b.score);
  const marked = `Marked by ${a.judge} (${a.score}) and ${b.judge} (${b.score}), averaged.`;
  return spread >= JUDGE_SPREAD_FLAG
    ? `${marked} They are ${spread} points apart, so read this mark as rough.`
    : marked;
}

/**
 * How a run was asked, when it was not RigMatch's fixed settings: each model's
 * own (electron/modelSettings.cjs), with the values it set.
 */
export function samplingLine(result: Pick<BenchmarkResult, 'sampling' | 'modelSettings'>): string | null {
  if (result.sampling !== 'model') return null;
  const values = Object.entries(result.modelSettings ?? {}).map(([name, value]) => `${name} ${value}`);
  return values.length > 0
    ? `Asked with its own settings: ${values.join(', ')}.`
    : "Asked with its own settings. It sets none, so Ollama's defaults applied.";
}
