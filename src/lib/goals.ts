/**
 * What someone wants the AI to DO — the one taxonomy the whole app organises by.
 *
 * Three vocabularies had grown for this single idea. The Simple Mode wizard
 * asked about "dreams" (talk, write, code, image, video), the Models screen
 * filtered by "tasks" (coding, assistant, writing, imagegen, videogen, vision,
 * hears...), and scoring grouped questions into yet another set (coding, chat,
 * facts, instructions). "Talk", "assistant" and "chat" were the same goal
 * wearing three names, so a filter, a wizard chip and a scorecard could not
 * refer to each other even when they meant exactly the same thing.
 *
 * A goal is what the user is trying to produce. That is deliberately narrower
 * than the old chip list, which mixed goals with attributes: "Tiny" and
 * "Uncensored" are properties a model has, not things a person sets out to do,
 * and they stay filters rather than becoming goals. "Sticking to facts" and
 * "Following instructions" are likewise not goals — they are dimensions of how
 * well a model chats, and they belong under that goal as scored qualities.
 *
 * Everything else keys off this list: the wizard's question, the Models
 * filters, and the per-goal Matches ("best for talking", "best for video").
 */

import type { BenchmarkQuestionType } from '../benchmarkSuite.ts';

export type GoalId =
  | 'talk' | 'write' | 'code'
  | 'make-images' | 'make-video' | 'make-audio'
  | 'read-images' | 'hear-audio' | 'watch-video';

export type Goal = {
  id: GoalId;
  /** Plain label, for filters and Matches: "Make videos". */
  label: string;
  /** How the wizard asks for it, in the show's voice: "A video maker". */
  wizardLabel: string;
  /** What a Match for this goal is called: "Best for making videos". */
  matchLabel: string;
  /**
   * Which runtime does the work. Generation goals need ComfyUI, which the
   * user installs separately, and the UI has to say so before they pick one.
   */
  runtime: 'ollama' | 'comfyui';
  /**
   * Question types whose scores measure this goal, when it is measurable at
   * all. Empty means the goal has no question-based score — a video model is
   * graded in the Lab, not by answering questions.
   */
  questionTypes: readonly BenchmarkQuestionType[];
  /** True when a benchmark run can produce a score for this goal. */
  scoreable: boolean;
};

export const GOALS: Goal[] = [
  {
    id: 'talk',
    label: 'Everyday chat',
    wizardLabel: 'Someone to talk with',
    matchLabel: 'Best for talking',
    runtime: 'ollama',
    questionTypes: ['assistant'],
    scoreable: true,
  },
  {
    id: 'write',
    label: 'Writing',
    wizardLabel: 'A writing partner',
    matchLabel: 'Best for writing',
    runtime: 'ollama',
    // No writing question exists yet. The suite asks json, truth, format,
    // assistant and coding — `format` measures whether a model follows a
    // formatting instruction, which is not the same as writing well, and
    // scoring writing on it would be a fabricated measurement. Until a
    // writing question is added this goal filters but does not rank.
    questionTypes: [],
    scoreable: false,
  },
  {
    id: 'code',
    label: 'Coding',
    wizardLabel: 'A coding buddy',
    matchLabel: 'Best for coding',
    runtime: 'ollama',
    questionTypes: ['coding'],
    scoreable: true,
  },
  {
    id: 'make-images',
    label: 'Making images',
    wizardLabel: 'An image maker',
    matchLabel: 'Best for making images',
    runtime: 'comfyui',
    questionTypes: [],
    scoreable: false,
  },
  {
    id: 'make-video',
    label: 'Making video',
    wizardLabel: 'A video maker',
    matchLabel: 'Best for making video',
    runtime: 'comfyui',
    questionTypes: [],
    scoreable: false,
  },
  {
    id: 'make-audio',
    label: 'Making audio',
    wizardLabel: 'A voice or music maker',
    matchLabel: 'Best for making audio',
    runtime: 'comfyui',
    questionTypes: [],
    scoreable: false,
  },
  {
    id: 'read-images',
    label: 'Reading images',
    wizardLabel: 'Something that can see',
    matchLabel: 'Best for reading images',
    runtime: 'ollama',
    questionTypes: [],
    scoreable: false,
  },
  {
    id: 'hear-audio',
    label: 'Hearing audio',
    wizardLabel: 'Something that can listen',
    matchLabel: 'Best for listening',
    runtime: 'ollama',
    questionTypes: [],
    scoreable: false,
  },
  {
    id: 'watch-video',
    label: 'Watching video',
    wizardLabel: 'Something that can watch video',
    matchLabel: 'Best for watching video',
    runtime: 'ollama',
    questionTypes: [],
    scoreable: false,
  },
];

export function goalById(id: string | undefined): Goal | undefined {
  return GOALS.find((goal) => goal.id === id);
}

/** Goals a benchmark run can score, which is what Matches can rank. */
export function scoreableGoals(): Goal[] {
  return GOALS.filter((goal) => goal.scoreable);
}

/**
 * Qualities the benchmark measures that are not goals in themselves.
 *
 * Nobody sits down meaning to "do a sticking-to-facts". These describe how
 * well a model holds up while pursuing a goal, and they stay as scored
 * dimensions rather than becoming things the wizard offers. They are listed
 * here so the question types they own are not mistaken for unclaimed.
 */
export const SCORED_QUALITIES = [
  { id: 'facts', label: 'Sticking to facts', questionTypes: ['truth'] },
  { id: 'instructions', label: 'Following instructions', questionTypes: ['json', 'format'] },
] as const;

/**
 * Attributes are not goals.
 *
 * These stay as filters because they describe a model rather than an ambition:
 * nobody sets out to "do a tiny". Keeping them out of the goal list is what
 * stops the wizard asking "what do you want to make?" and offering "Tiny".
 */
export const MODEL_ATTRIBUTES = [
  { id: 'tiny', label: 'Tiny' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'search', label: 'Search' },
  { id: 'uncensored', label: 'Uncensored' },
] as const;

export type ModelAttributeId = (typeof MODEL_ATTRIBUTES)[number]['id'];

/**
 * How much of a goal a benchmark actually measured.
 *
 * A ten-question run spread over the scoreable goals leaves two or three
 * questions each, and findTaskWinners already refuses to name a winner on
 * fewer than three. So the honest answer for a short run is "not enough
 * questions to say", not a ranking built on one answer.
 */
export const MIN_QUESTIONS_PER_GOAL = 3;

export function goalCoverage(questionCount: number): {
  perGoal: number;
  enough: boolean;
  suggestion: number;
} {
  // Every scored bucket, not just the goals. The qualities draw from the same
  // pool of questions, so counting only goals made ten questions look like
  // five each when the run really splits them four ways.
  const buckets = scoreableGoals().length + SCORED_QUALITIES.length;
  const perGoal = Math.floor(questionCount / Math.max(1, buckets));
  return {
    perGoal,
    enough: perGoal >= MIN_QUESTIONS_PER_GOAL,
    // What to run instead, rounded to the question counts the UI offers.
    suggestion: buckets * MIN_QUESTIONS_PER_GOAL <= 20 ? 20 : 50,
  };
}
