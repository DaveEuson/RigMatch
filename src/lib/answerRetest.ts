// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkPromptResult } from '../types';
import { formatLocale } from './formatLocale.ts';

/**
 * What to say under an answer that went wrong, and whether asking again helps.
 *
 * RigMatch asks at temperature 0 with a fixed seed, so an answer the model cut
 * off at the token limit comes back the same every time. Only an answer the PC
 * broke is worth asking again, and the main process decides for certain
 * (canRetest in electron/benchmarkRetest.cjs); this is what the panel shows.
 */
export type AnswerNote = {
  text: string;
  /** "Test this question again" belongs under this answer. */
  retestable: boolean;
};

const ranOutOfTime = (prompt: Pick<BenchmarkPromptResult, 'timedOut' | 'doneReason'>) =>
  prompt.timedOut === true || /^timeout$/i.test(prompt.doneReason || '');

export function answerNote(prompt: BenchmarkPromptResult): AnswerNote | null {
  if (prompt.retest) {
    const when = new Date(prompt.retest.at).toLocaleString(formatLocale(), { dateStyle: 'medium', timeStyle: 'short' });
    const first = ranOutOfTime(prompt.retest.firstTry) ? 'ran out of time' : 'went wrong';
    return { text: `Asked again on ${when}. The first try ${first}.`, retestable: false };
  }
  if (ranOutOfTime(prompt)) {
    return typeof prompt.countedRuns === 'number'
      ? { text: 'Ran out of time, so it is left out of the score. That is the PC\'s speed, not the answer: another program using the graphics card can cause it.', retestable: true }
      : { text: 'Ran out of time, so it is left out of the score. This test was saved before RigMatch could ask one question again; test the model again instead.', retestable: false };
  }
  if (/length/i.test(prompt.doneReason || '') && prompt.status !== 'ok') {
    return {
      text: 'Cut off at the token limit. RigMatch asks at temperature 0, so the model writes the same answer every time, and asking again would not change it.',
      retestable: false,
    };
  }
  if (prompt.retriedAfter) {
    return { text: `Asked twice: the first try ${prompt.retriedAfter === 'timed out' ? 'timed out' : 'lost the connection to Ollama'}, so RigMatch asked again.`, retestable: false };
  }
  return null;
}
