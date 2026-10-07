// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import type { BenchmarkQuestion, BenchmarkQuestionCount, BenchmarkQuestionType } from '../benchmarkSuite.ts';
import { BENCHMARK_PRESETS, DEFAULT_BENCHMARK_QUESTIONS } from '../benchmarkSuite.ts';

/**
 * What the "Before the show / Before the test" sheet works out, kept apart from
 * the component so it can be checked without rendering it.
 */

export const QUESTION_TYPE_LABELS: Record<BenchmarkQuestionType, string> = {
  assistant: 'Assistant response',
  writing: 'Writing task',
  json: 'JSON output',
  truth: 'Truthfulness',
  format: 'Format following',
  coding: 'Coding task',
  candour: 'Difficult subject',
  tools: 'Tool call',
  edgy: 'Harmless but edgy request',
};

/**
 * Types a written question can be. 'tools' is left out: a tool question is
 * checked against the call it should produce, which electron/agentTools.cjs
 * knows only for its own prompts.
 */
export const EDITABLE_QUESTION_TYPES: BenchmarkQuestionType[] = ['assistant', 'writing', 'json', 'truth', 'format', 'coding', 'edgy'];

/** The one coding question the rules can mark; mirrors ASKS_FOR_CLAMP in electron/benchmarkScoring.cjs. */
const ASKS_FOR_CLAMP = /clampScore/i;

/**
 * Whether the rules mark this question or it needs something that reads.
 *
 * Follows heuristicCanGrade in electron/benchmarkScoring.cjs, asked before
 * there is an answer: chat and writing have nothing to match, a coding
 * question is checkable only when it asks for clampScore, and a difficult or
 * edgy question needs a reader for any answer that is not a refusal.
 */
export function questionMarker(question: Pick<BenchmarkQuestion, 'type' | 'prompt'>): 'rules' | 'judge' {
  switch (question.type) {
    case 'assistant':
    case 'writing':
    case 'candour':
    case 'edgy':
      return 'judge';
    case 'coding':
      return ASKS_FOR_CLAMP.test(question.prompt) ? 'rules' : 'judge';
    default:
      return 'rules';
  }
}

export type QuestionSetId = 'general' | 'custom' | (typeof BENCHMARK_PRESETS)[number]['id'];

const sameQuestions = (a: BenchmarkQuestion[], b: BenchmarkQuestion[]) =>
  a.length === b.length && a.every((q, i) => {
    const other = b[i];
    return other && q.id === other.id && q.label === other.label && q.type === other.type && q.prompt === other.prompt;
  });

/**
 * Which set the questions are. An edited set is 'custom' even with its ids
 * intact: it asks something different, and naming it after the set it came
 * from would say otherwise.
 */
export function activeQuestionSet(questions: BenchmarkQuestion[]): QuestionSetId {
  if (sameQuestions(questions, DEFAULT_BENCHMARK_QUESTIONS)) return 'general';
  return BENCHMARK_PRESETS.find((preset) => sameQuestions(questions, preset.questions))?.id ?? 'custom';
}

export function questionsForSet(id: Exclude<QuestionSetId, 'custom'>): BenchmarkQuestion[] {
  if (id === 'general') return [...DEFAULT_BENCHMARK_QUESTIONS];
  return [...(BENCHMARK_PRESETS.find((preset) => preset.id === id)?.questions ?? DEFAULT_BENCHMARK_QUESTIONS)];
}

/** The set's name as the sheet's chips show it, or "your questions" once edited. */
export function questionSetLabel(questions: BenchmarkQuestion[]): string {
  const id = activeQuestionSet(questions);
  if (id === 'custom') return 'your questions';
  if (id === 'general') return 'General';
  return BENCHMARK_PRESETS.find((preset) => preset.id === id)?.label ?? 'General';
}

export const GENERAL_SET_DESCRIPTION = 'Mixed questions covering JSON output, instruction following and everyday tasks.';

// No names: "10 · Quick" sat beside a "Quick check" of 3 questions, and its
// "about 3 min a model" beside a Start button saying "about 15 min".
export const COUNT_OPTIONS: Array<{ count: BenchmarkQuestionCount; perModel: string; minutes: number }> = [
  { count: 10, perModel: 'about 3 min a model', minutes: 3 },
  { count: 20, perModel: 'about 5 min a model', minutes: 5 },
  { count: 50, perModel: 'about 15 min a model', minutes: 15 },
  { count: 100, perModel: '30 min or more a model', minutes: 30 },
];

/** A quick check is three short questions: about a minute a model. */
export const QUICK_MINUTES_PER_MODEL = 1;

export type JudgeChoice = 'built-in' | 'local' | 'cloud';

export function judgeChoiceOf(qualityMode: 'heuristic' | 'judge', judgeSource: 'local' | 'openrouter'): JudgeChoice {
  if (qualityMode !== 'judge') return 'built-in';
  return judgeSource === 'openrouter' ? 'cloud' : 'local';
}

/** The gold button: what starts, about how long, and whether that time was measured here. */
export function sheetButtonLabel({ quick, mode, skillsOnly, duration, measured }: {
  quick: boolean;
  mode: 'single' | 'speed-date';
  skillsOnly: boolean;
  duration: string | null;
  measured: boolean;
}): string {
  if (skillsOnly) return 'Run the skill tests';
  const action = quick ? 'Run the quick check' : mode === 'single' ? 'Run the test' : 'Start the show';
  if (!duration) return action;
  return `${action} · ${duration}${quick ? '' : measured ? ' · measured here' : ' · estimate'}`;
}
