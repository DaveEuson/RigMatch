// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
// Code Challenge: ask a model to solve a coding task in a chosen language and grade
// it with the LLM judge. Unlike App Builder there's nothing to run/preview, so this
// is judge-only (see docs/code-challenge-spec.md). Pure data + prompt builders live
// here; the runner that drives Ollama/OpenRouter lives in labChallenges.ts.
import { parseAppJudgeVerdict, type AppJudgeVerdict } from './appBuilderJudge.ts';

export const CODE_LANGUAGES: Array<{ id: string; label: string }> = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'sql', label: 'SQL' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'bash', label: 'Bash' },
  { id: 'any', label: 'Let the model choose' },
];

export const DEFAULT_CODE_LANGUAGE = 'python';

export type CodeTaskPreset = { id: string; label: string; task: string; reference?: string };

// Tasks are language-agnostic where possible. `reference` is a short correct-approach
// hint handed to the judge (never to the solver) — it sharply improves grading over
// judging in a vacuum. The SQL task is language-specific and pairs with SQL.
export const CODE_TASK_PRESETS: CodeTaskPreset[] = [
  {
    id: 'two-sum',
    label: 'Two-sum (O(n))',
    task: 'Write a function that, given an array of integers and a target, returns the indices of the two numbers that add up to the target. Aim for O(n) time.',
    reference: 'Use a hash map from value -> index; for each x, check if (target - x) has been seen.',
  },
  {
    id: 'fix-bug',
    label: 'Fix the bug',
    task: 'This function is meant to sum an array but is wrong. Return a corrected version:\n  sum(arr): total = 0; for i from 1 to length(arr): total += arr[i]; return total',
    reference: 'The loop must start at index 0 and stop before length; the original skips the first element and reads one past the end.',
  },
  {
    id: 'lru',
    label: 'LRU cache',
    task: 'Implement an LRU (least-recently-used) cache with get(key) and put(key, value), both O(1) on average, evicting the least-recently-used entry when over capacity.',
    reference: 'Hash map + doubly linked list (or an ordered map); on access/insert, move the key to most-recently-used and evict from the LRU end when full.',
  },
  {
    id: 'parse-csv',
    label: 'Parse CSV',
    task: 'Write a function that parses a CSV string with a header row into a list of records keyed by column name. Handle quoted fields that contain commas.',
    reference: 'Scan character by character tracking in-quote state; do not naively split on commas, which breaks quoted fields.',
  },
  {
    id: 'debounce',
    label: 'Debounce utility',
    task: 'Write a debounce utility: given a function and a delay in milliseconds, return a debounced version that only invokes the original after calls have stopped for the delay.',
    reference: 'Keep a single timer handle; each call clears and resets it, invoking the function only once the delay elapses without another call.',
  },
  {
    id: 'topn-sql',
    label: 'SQL: top-N per group',
    task: 'Given a table employees(id, name, department, salary), write a query that returns the top 3 highest-paid employees in each department.',
    reference: 'Window function: ROW_NUMBER() (or RANK) OVER (PARTITION BY department ORDER BY salary DESC), then keep rows where the rank <= 3.',
  },
];

const LANG_LABELS: Record<string, string> = Object.fromEntries(CODE_LANGUAGES.map((l) => [l.id, l.label]));
export function codeLanguageLabel(id: string): string {
  return LANG_LABELS[id] ?? id;
}

export function resolveCodeTask(taskId: string, customTask: string): { task: string; reference?: string } {
  if (taskId === 'custom') {
    const custom = customTask.trim();
    return { task: custom || CODE_TASK_PRESETS[0].task, reference: custom ? undefined : CODE_TASK_PRESETS[0].reference };
  }
  const preset = CODE_TASK_PRESETS.find((p) => p.id === taskId) ?? CODE_TASK_PRESETS[0];
  return { task: preset.task, reference: preset.reference };
}

// The generation prompt handed to the model being tested.
export function buildCodePrompt(language: string, task: string): string {
  const langLine = language === 'any'
    ? 'Use whichever programming language best fits the task.'
    : `Write the solution in ${codeLanguageLabel(language)}.`;
  return [
    task,
    '',
    langLine,
    'Return ONLY the code — no explanation or prose — in a single fenced code block. Write complete, working, idiomatic code with no placeholder comments, no TODOs, and no stubs.',
  ].join('\n');
}

// Pulls the first fenced code block out of a response; falls back to the whole
// response (models sometimes omit the fence).
export function extractCodeBlock(response: string): string {
  const text = String(response ?? '');
  const fenced = text.match(/```[a-zA-Z0-9+#.-]*\s*\n([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

// The grading prompt handed to the judge model.
export function buildCodeJudgePrompt(language: string, task: string, reference: string | undefined, code: string): string {
  const lang = codeLanguageLabel(language);
  return [
    `You are a strict ${lang} code reviewer. Grade ONLY whether the solution is correct and complete for the task — do not rewrite it.`,
    '',
    `TASK: ${task}`,
    reference ? `\nA correct approach, for your reference only: ${reference}` : '',
    '',
    'SOLUTION TO GRADE:',
    '```',
    code.trim(),
    '```',
    '',
    `Check carefully: does it correctly solve the task? Does it handle edge cases? Would it compile/parse and run without errors? Is it complete (no stubs, TODOs, or placeholders) and idiomatic ${lang}?`,
    '',
    'Scoring guide:',
    '- 0-25: wrong, incomplete, or would not compile/run.',
    '- 30-55: partially works but has real bugs or misses core requirements.',
    '- 60-80: works with minor bugs or non-idiomatic style.',
    '- 85-100: correct, complete, and clean.',
    '',
    'Respond with ONLY a compact JSON object: {"score": <integer 0-100>, "reason": "<one sentence naming the biggest problem, or confirming it is correct>"}',
  ].join('\n');
}

// Runs the judge over a code solution. `generate` is injected so this is pure and
// testable. Returns a verdict, or null on failure (caller decides the fallback).
export async function judgeCode(options: {
  language: string;
  task: string;
  reference?: string;
  code: string;
  generate: (judgePrompt: string) => Promise<string>;
}): Promise<AppJudgeVerdict | null> {
  const { language, task, reference, code, generate } = options;
  if (!code || typeof generate !== 'function') return null;
  let output: string;
  try {
    output = await generate(buildCodeJudgePrompt(language, task, reference, code));
  } catch {
    return null;
  }
  return parseAppJudgeVerdict(output);
}
