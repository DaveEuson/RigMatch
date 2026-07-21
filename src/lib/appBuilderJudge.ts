// LLM-as-judge for App Builder results.
//
// Structure checks ("has a canvas, has key handlers") and the syntax check can't
// tell a working app from one that parses fine but crashes on the first tick —
// qwen2.5 built a valid-but-wrong Tetris (a flat array treated as a 2D grid,
// `.map()` on a number) that scored 100/S for a blank screen. Catching that is a
// reasoning task: read the code, trace it, decide if it actually works. This module
// asks a judge model to do exactly that.
//
// The network call is injected as `generate`, so the prompt builder and the (fiddly)
// verdict parser are pure and unit-testable. On any failure the caller falls back to
// the structural score, so judging is strictly additive.

export type AppJudgeVerdict = { score: number; reason: string };

// Builds the grading prompt. Names the specific failure modes to look for so a
// modest local judge has the best chance of catching real runtime/logic bugs.
export function buildAppJudgePrompt(code: string, taskDescription?: string): string {
  const task = (taskDescription ?? '').trim();
  return [
    'You are a strict code reviewer grading a single-file HTML app an AI was asked to build. Grade ONLY whether the app actually works — do not rewrite it.',
    '',
    task ? `THE APP WAS SUPPOSED TO BE: ${task}` : 'Judge whether it is a complete, working app of the kind its own title/markup implies.',
    '',
    'THE CODE:',
    '```html',
    code.trim(),
    '```',
    '',
    'Trace the code and decide if it RUNS and DOES what was asked. Watch specifically for:',
    '- Runtime crashes: undefined variables, calling a method on the wrong type (e.g. `.map()` on a number), wrong data shapes (a flat array used as a 2D grid), off-by-one or logic bugs that break it.',
    '- A blank/non-functional result: structurally plausible code that draws nothing or does nothing when run.',
    '- Stubs or placeholders (`/* ... */`, TODO) left in place of real logic.',
    '',
    'Scoring guide:',
    '- 0-25: does not run, crashes, or shows a blank/broken screen.',
    '- 30-55: runs but is largely non-functional or missing core features.',
    '- 60-80: mostly works, with noticeable bugs or missing pieces.',
    '- 85-100: complete and genuinely working.',
    '',
    'Respond with ONLY a compact JSON object and nothing else:',
    '{"score": <integer 0-100>, "reason": "<one sentence naming the biggest problem, or confirming it works>"}',
  ].join('\n');
}

// Extracts a 0-100 score (and optional reason) from the judge's raw output.
// Tolerant of code fences, prose around the JSON, "score: 85", "85/100", "85%",
// and a bare number; returns null when nothing usable is found.
export function parseAppJudgeVerdict(text: string | null | undefined): AppJudgeVerdict | null {
  if (text == null) return null;
  let raw = String(text).trim();
  if (!raw) return null;
  raw = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  const inRange = (n: number) => (Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null);
  let score: number | null = null;
  let reason = '';

  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]) as { score?: unknown; reason?: unknown };
      if (parsed && parsed.score != null) score = inRange(Number(parsed.score));
      if (parsed && typeof parsed.reason === 'string') reason = parsed.reason.slice(0, 200);
    } catch {
      /* fall through to regex strategies */
    }
  }
  if (score == null) {
    // \d+ (not \d{1,3}) so an out-of-range "1000" is captured whole and rejected
    // by inRange rather than truncated to a valid-looking "100".
    const scoreKey = raw.match(/score\s*["']?\s*[:=]\s*["']?\s*(\d+)/i);
    if (scoreKey) score = inRange(Number(scoreKey[1]));
  }
  if (score == null) {
    const ratio = raw.match(/\b(\d+)\s*(?:\/\s*100|%)/);
    if (ratio) score = inRange(Number(ratio[1]));
  }
  // No bare-integer fallback: grabbing the first number in prose (e.g. "has 2
  // bugs") would grade a stray count as the score. If nothing score-shaped is
  // found, return null so the caller falls back rather than trusting a guess.

  return score == null ? null : { score, reason };
}

// Runs the judge over one app. `generate(judgePrompt)` must resolve to the judge
// model's raw text. Returns a verdict, or null on any failure (caller falls back).
export async function judgeAppBuilder(options: {
  code: string;
  taskDescription?: string;
  generate: (judgePrompt: string) => Promise<string>;
}): Promise<AppJudgeVerdict | null> {
  const { code, taskDescription, generate } = options;
  if (!code || typeof generate !== 'function') return null;
  let output: string;
  try {
    output = await generate(buildAppJudgePrompt(code, taskDescription));
  } catch {
    return null;
  }
  return parseAppJudgeVerdict(output);
}
