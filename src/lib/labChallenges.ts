/**
 * The Advanced Lab / skill-test challenge layer: the app-builder prompts and
 * presets, the per-challenge scoring rubrics, and the runners that drive Ollama
 * for each challenge (build an app, read an image, transcribe audio, write
 * code). Extracted from App.tsx so both the run flow and the Advanced Lab view
 * share one implementation.
 *
 * Generating an image is the one skill that is not here, because it is the one
 * skill Ollama cannot do. It runs on ComfyUI instead — see imageGenChallenge.ts.
 */

import robotModelTest from '../assets/robot-model-test.webp';
import robotContestantWall from '../assets/robot-contestant-wall.webp';
import robotRigGreenroom from '../assets/robot-rig-greenroom.webp';
import robotScorecardCeremony from '../assets/robot-scorecard-ceremony.webp';
import listeningTestAudio from '../assets/listening-test.wav';
import { agentArcadeApi } from '../api';
import { describeRunError } from './format.ts';
import { type AdvancedLabCheck, type AdvancedLabResult } from './labResults.ts';
import { getAdvancedLabGrade, scoreAdvancedListeningResponse, scoreAdvancedVisionResponse } from './labScoring.ts';
import { extractHtmlDocument } from './labPreview.ts';
import { checkAppParses } from './appRunnability.ts';
import { judgeAppBuilder } from './appBuilderJudge.ts';
import { buildCodePrompt, extractCodeBlock, judgeCode } from './codeChallenge.ts';

// Code that doesn't even parse can't run — a blank screen must never outscore a
// working app. Cap it here regardless of how good the structure looks. 25 is F.
const BROKEN_APP_SCORE_CAP = 25;

export type VisionTestImage = { id: string; label: string; src: string };

/** Bundled pictures the user can pick from for the image-recognition test. */
export const VISION_TEST_IMAGES: VisionTestImage[] = [
  { id: 'robot', label: 'Robot host', src: robotModelTest },
  { id: 'lineup', label: 'Contestant wall', src: robotContestantWall },
  { id: 'greenroom', label: 'Green room', src: robotRigGreenroom },
  { id: 'ceremony', label: 'Scorecards', src: robotScorecardCeremony },
];
export const DEFAULT_VISION_TEST_IMAGE = VISION_TEST_IMAGES[0].src;

export type AppBuilderPreset = { id: string; label: string; prompt: string };

// ── App Builder prompts ──────────────────────────────────────────────────────

const APP_BUILDER_BASE_RULES = `
- Return only the code for one HTML file.
- Include HTML, CSS, and JavaScript in the same file.
- Do not use external libraries, CDNs, or network calls.`;

export const APP_BUILDER_PRESETS: AppBuilderPreset[] = [
  {
    id: 'tetris',
    label: 'Tetris-style game',
    prompt: `Create a complete single-file HTML Tetris-style falling block game.

Requirements:
- Keyboard controls for left, right, rotate, soft drop, and restart.
- A visible score display.
- Collision detection, line clearing, and game-over handling.${APP_BUILDER_BASE_RULES}`,
  },
  {
    id: 'snake',
    label: 'Snake game',
    prompt: `Create a complete single-file HTML Snake game.

Requirements:
- Arrow-key controls, a growing snake, food, and collision/game-over handling.
- A visible score display and a restart option.${APP_BUILDER_BASE_RULES}`,
  },
  {
    id: 'calculator',
    label: 'Calculator',
    prompt: `Create a complete single-file HTML calculator.

Requirements:
- Clickable number and operator buttons plus keyboard input.
- A display that updates as you type, with clear and equals.
- Handle addition, subtraction, multiplication, and division.${APP_BUILDER_BASE_RULES}`,
  },
  {
    id: 'clock',
    label: 'Digital clock',
    prompt: `Create a complete single-file HTML digital clock.

Requirements:
- Show the current time, updating every second.
- Include a 12/24-hour toggle and today's date.${APP_BUILDER_BASE_RULES}`,
  },
  {
    id: 'paint',
    label: 'Paint canvas',
    prompt: `Create a complete single-file HTML paint / drawing app on a canvas.

Requirements:
- Draw with the mouse, pick a color and brush size, and a clear button.${APP_BUILDER_BASE_RULES}`,
  },
];

export const DEFAULT_APP_BUILDER_PRESET_ID = 'tetris';
export const ADVANCED_APP_BUILDER_PROMPT = APP_BUILDER_PRESETS[0].prompt;

// Pulls a concrete diagnosis of the latest attempt out of a result's checks, so
// the next improve pass can be told exactly what is wrong instead of a vague
// "something is broken, find it".
//
// Prefers the judge's review (it catches runtime and logic bugs), but falls back
// to the syntax-check failure, which every run computes for free — no judge, no
// API key, no cost. Without that fallback a model whose app has a parse error
// was told only "the app does not fully work yet", when the exact token and line
// were already known.
export function extractJudgedProblem(checks: AdvancedLabCheck[] | undefined): string {
  const judged = (checks ?? []).find((check) => check.label === 'Judged working');
  if (judged && !judged.passed) return (judged.detail ?? '').trim();

  const parses = (checks ?? []).find((check) => check.label === 'Free of syntax errors');
  if (parses && !parses.passed) {
    // Detail reads "Will not run — <error>"; hand the model just the error.
    return (parses.detail ?? '').replace(/^Will not run\s*[—-]\s*/, '').trim();
  }

  return '';
}

// Builds an improve-pass prompt: refine the existing code in place — keep what
// works, fix what's broken — so progress accumulates across passes instead of
// each pass re-rolling the app from scratch. Weak models tend to "refine" by
// adding "fixed typo" comments and leaving `/* ... */` stubs where real logic
// belongs, so those are explicitly banned and completeness is demanded. The
// user's hint and the judge's diagnosis of the previous attempt lead the prompt,
// where they carry the most weight.
export function buildAppBuilderRetryPrompt(previousCode: string, hint?: string, reviewNote?: string): string {
  const trimmedHint = (hint ?? '').trim();
  const trimmedReview = (reviewNote ?? '').trim();
  const priorities: string[] = [];
  if (trimmedHint) priorities.push(`The user reports: ${trimmedHint} — fixing this is the top priority.`);
  // Wording stays neutral because the diagnosis may come from the LLM judge's
  // review or from the free syntax check.
  if (trimmedReview) priorities.push(`A check of this exact code found: ${trimmedReview} — fix that problem first.`);
  if (!priorities.length) priorities.push('The app below does not fully work yet. Find what is broken or missing and fix it.');
  return [
    'Improve the HTML app below. Keep its overall structure and everything that already works — change what is broken, finish what is incomplete. Do not start over from scratch.',
    '',
    ...priorities,
    '',
    '```html',
    previousCode.trim(),
    '```',
    '',
    'Return the complete improved file. Strict requirements:',
    '- Every function must be fully implemented. NO placeholder comments, NO "TODO", NO stubs like `/* check ... */` standing in for real logic.',
    '- Do NOT add comments explaining what you changed — just clean, working code.',
    '- The app MUST run with no JavaScript errors and actually do what it claims.',
    `- Return only the code for one HTML file.${APP_BUILDER_BASE_RULES}`,
  ].join('\n');
}

export function resolveAppBuilderPrompt(promptId: string, customPrompt: string): string {
  if (promptId === 'custom') {
    const custom = customPrompt.trim();
    return custom
      ? `Create a complete single-file HTML app for this request: ${custom}${APP_BUILDER_BASE_RULES}`
      : ADVANCED_APP_BUILDER_PROMPT;
  }
  return APP_BUILDER_PRESETS.find((preset) => preset.id === promptId)?.prompt ?? ADVANCED_APP_BUILDER_PROMPT;
}

// Image generation moved to ComfyUI — see imageGenChallenge.ts. Ollama hosts no
// image models and its runtime refuses the ones that exist, so the config that
// used to live here described pulls that could never run.

export const ADVANCED_VISION_PROMPT = 'Look at this image and describe exactly what you see in a few clear sentences. If there is any readable text, transcribe it. Be specific about objects, colors, and layout.';

// Resolve a chosen picture (a bundled asset URL or an uploaded data URL) to a
// PNG data URL the vision model can read. Uploaded data URLs pass through;
// bundled assets are drawn to a canvas and cached per source.
const visionImageCache = new Map<string, string>();
export async function getVisionTestImageDataUrl(src: string = DEFAULT_VISION_TEST_IMAGE): Promise<string> {
  const source = src || DEFAULT_VISION_TEST_IMAGE;
  if (source.startsWith('data:')) return source;
  const cached = visionImageCache.get(source);
  if (cached) return cached;
  try {
    const img = new Image();
    img.src = source;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 512;
    canvas.height = img.naturalHeight || 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/png');
    visionImageCache.set(source, url);
    return url;
  } catch {
    return '';
  }
}

// ── Scoring rubrics ──────────────────────────────────────────────────────────

function scoreAdvancedAppBuilderResponse(response: string, doneReason: string): Pick<AdvancedLabResult, 'score' | 'grade' | 'checks'> {
  const text = response.trim();
  const lower = text.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);
  // Generic checks that apply to any single-file interactive app (game,
  // calculator, clock, paint, or a custom request) — not just Tetris.
  const checks: AdvancedLabCheck[] = [
    {
      label: 'Single-file HTML',
      passed: has(/<!doctype|<html|<body|<script/i) && has(/<style|style=/i),
      detail: 'Includes document structure, script, and styling in one answer.',
    },
    {
      label: 'Interactive',
      passed: has(/addeventlistener|onclick|onkeydown|oninput|onmousedown|keydown|\bclick\b/i),
      detail: 'Responds to keyboard, mouse, or input events.',
    },
    {
      label: 'Has real logic',
      passed: has(/function\b|=>|const\s+\w+\s*=|let\s+\w+\s*=/i),
      detail: 'Contains actual JavaScript logic, not just static markup.',
    },
    {
      label: 'Updates the page',
      passed: has(/getelementbyid|queryselector|innerhtml|textcontent|createelement|getcontext|<canvas/i),
      detail: 'Renders or updates something visible while it runs.',
    },
    {
      label: 'Self-contained',
      passed: !has(/https?:\/\/|<script[^>]+src=|<link[^>]+href=|cdn/i),
      detail: 'Avoids external libraries, CDNs, and network calls.',
    },
    {
      label: 'Substantial',
      passed: text.length >= 800,
      detail: 'Long enough to be a plausible working app.',
    },
    {
      label: 'Not truncated',
      passed: doneReason !== 'length' && !lower.includes('truncated'),
      detail: 'Did not report a length cutoff mid-answer.',
    },
  ];
  const score = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  return { score, grade: getAdvancedLabGrade(score), checks };
}



// ── Challenge runners ────────────────────────────────────────────────────────

// The judge configuration for grading a generated app: a local Ollama model, or an
// OpenRouter model (strictly opt-in — sends the app code to the cloud) with a key.
export type AppBuilderJudgeConfig = {
  model: string;
  provider?: 'local' | 'openrouter';
  apiKey?: string;
  taskDescription?: string;
};

// Runs the judge model deterministically to grade a generated app. Short output
// (a JSON verdict), low temperature. Errors bubble up so judgeAppBuilder returns
// null and the caller falls back to the structural score.
async function runAppJudgeGenerate(baseUrl: string, judge: AppBuilderJudgeConfig, judgePrompt: string): Promise<string> {
  if (judge.provider === 'openrouter') {
    if (!agentArcadeApi.openRouterGenerate) throw new Error('Cloud judging is not available in this build.');
    const data = await agentArcadeApi.openRouterGenerate({
      apiKey: judge.apiKey ?? '',
      model: judge.model,
      prompt: judgePrompt,
      maxTokens: 400,
    });
    if (data.error) throw new Error(data.error);
    return data.response ?? '';
  }
  const data = await agentArcadeApi.runAdvancedGenerate({
    model: judge.model,
    baseUrl,
    prompt: judgePrompt,
    keep_alive: '10m',
    timeoutMs: 120000,
    options: { temperature: 0, top_p: 1, num_ctx: 8192, num_predict: 400 },
  });
  if (data.error) throw new Error(data.error);
  return data.response ?? '';
}

export async function runAdvancedAppBuilderChallenge(
  model: string,
  baseUrl: string,
  prompt: string = ADVANCED_APP_BUILDER_PROMPT,
  streamId?: string,
  // Retries pass an override to escape the fixed benchmark seed: reproducibility
  // is right for the scored first attempt, but a "second chance" needs a *different*
  // seed and a bit more temperature or it just regenerates the same broken output.
  optionsOverride?: Record<string, unknown>,
  // When set, an LLM judge grades whether the app actually works (opt-in, via the
  // run dialog's judge toggle). taskDescription gives the judge the intended app.
  judge?: AppBuilderJudgeConfig,
): Promise<AdvancedLabResult> {
  const startedAt = performance.now();

  try {
    const data = await agentArcadeApi.runAdvancedGenerate({
      model,
      baseUrl,
      prompt,
      keep_alive: '10m',
      // Full single-file apps (Tetris especially) often run 2k–4k tokens of
      // code; the old 1600 cap truncated capable models mid-game. Raise the
      // output budget and the context window to fit it (num_ctx must hold the
      // prompt + all generated tokens), and give slow rigs the max timeout.
      timeoutMs: 240000,
      options: {
        temperature: 0.2,
        seed: 7,
        num_ctx: 8192,
        num_predict: 4500,
        ...optionsOverride,
      },
      ...(streamId ? { stream: true, streamId } : {}),
    });
    if (data.error) throw new Error(data.error);

    const raw = data.response ?? '';
    const scored = scoreAdvancedAppBuilderResponse(raw, data.done_reason ?? '');

    // Does the code even parse? Structure checks can't tell a working app from a
    // blank screen; a syntax error means the script never runs at all. If it
    // doesn't parse, cap the score to an F and record why. (Runtime/logic
    // correctness — code that parses but crashes when run — is the judge's job.)
    const html = extractHtmlDocument(raw);
    const parsed = html
      ? checkAppParses(html)
      : { parses: false, error: 'No usable HTML document was returned.' };
    const parsesCheck: AdvancedLabCheck = {
      label: 'Free of syntax errors',
      passed: parsed.parses,
      detail: parsed.parses
        ? 'The code parses, so the script will actually execute (not a parse-time blank screen).'
        : `Will not run — ${parsed.error}`,
    };
    let finalScore = parsed.parses ? scored.score : Math.min(scored.score, BROKEN_APP_SCORE_CAP);
    let checks: AdvancedLabCheck[] = [parsesCheck, ...scored.checks];

    // Optional LLM judge: reads the code and grades whether it actually works,
    // catching runtime/logic bugs that structure + syntax can't see (a valid-syntax
    // Tetris that crashes on the first tick). Only when the code parses — a syntax
    // error is already an F — and a judge model is set. The judge score becomes the
    // grade; if the judge errors or returns nothing, we keep the structural score.
    if (parsed.parses && html && judge?.model) {
      const verdict = await judgeAppBuilder({
        code: html,
        taskDescription: judge.taskDescription,
        generate: (judgePrompt) => runAppJudgeGenerate(baseUrl, judge, judgePrompt),
      });
      if (verdict) {
        finalScore = verdict.score;
        checks = [
          {
            label: 'Judged working',
            passed: verdict.score >= 60,
            detail: verdict.reason || `The ${judge.model} judge scored this ${verdict.score}/100.`,
          },
          ...checks,
        ];
      }
    }

    return {
      model,
      challenge: 'app-builder',
      score: finalScore,
      grade: getAdvancedLabGrade(finalScore),
      checks,
      elapsedMs: Math.round(performance.now() - startedAt),
      response: raw,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = describeRunError(error instanceof Error ? error.message : 'Advanced test failed.');
    return {
      model,
      challenge: 'app-builder',
      score: 0,
      grade: 'F',
      elapsedMs: Math.round(performance.now() - startedAt),
      response: '',
      checks: [],
      completedAt: new Date().toISOString(),
      error: message,
    };
  }
}

// Code Challenge: generate a solution in the chosen language, then grade it with
// the judge. Judge-only by design (nothing to execute) — without a judge it returns
// an error result so the run flow can surface "turn on Judge grading".
export async function runCodeChallenge(
  model: string,
  baseUrl: string,
  language: string,
  task: string,
  reference: string | undefined,
  streamId?: string,
  judge?: AppBuilderJudgeConfig,
  optionsOverride?: Record<string, unknown>,
): Promise<AdvancedLabResult> {
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  try {
    if (!judge?.model) {
      return {
        model, challenge: 'code', language, score: 0, grade: 'F', elapsedMs: elapsed(), response: '',
        checks: [{ label: 'Judge required', passed: false, detail: 'Code Challenge can only be graded with Judge grading turned on.' }],
        completedAt: new Date().toISOString(), error: 'Code Challenge requires Judge grading.',
      };
    }
    const data = await agentArcadeApi.runAdvancedGenerate({
      model,
      baseUrl,
      prompt: buildCodePrompt(language, task),
      keep_alive: '10m',
      timeoutMs: 240000,
      options: { temperature: 0.2, seed: 7, num_ctx: 8192, num_predict: 3000, ...optionsOverride },
      ...(streamId ? { stream: true, streamId } : {}),
    });
    if (data.error) throw new Error(data.error);
    const raw = data.response ?? '';
    const code = extractCodeBlock(raw);
    const verdict = code
      ? await judgeCode({ language, task, reference, code, generate: (jp) => runAppJudgeGenerate(baseUrl, judge, jp) })
      : null;
    // Code has no structural fallback — it's judge-only. If the model returned
    // code but the JUDGE failed (outage/timeout/unparseable), that's a judge
    // problem, not a failing contestant: surface it as an error so the run flow
    // doesn't record a permanent F for the model.
    if (code && !verdict) {
      return {
        model, challenge: 'code', language, score: 0, grade: 'F', elapsedMs: elapsed(), response: raw,
        checks: [{ label: 'Judge unavailable', passed: false, detail: 'The judge could not grade this answer — try again.' }],
        completedAt: new Date().toISOString(), error: 'The judge could not grade the code (judge unavailable).',
      };
    }
    const score = verdict ? verdict.score : 0;
    const detail = verdict
      ? (verdict.reason || `The judge scored this ${score}/100.`)
      : 'The model did not return any code.';
    return {
      model,
      challenge: 'code',
      language,
      score,
      grade: getAdvancedLabGrade(score),
      checks: [{ label: 'Judged correct', passed: score >= 60, detail }],
      elapsedMs: elapsed(),
      response: raw,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      model, challenge: 'code', language, score: 0, grade: 'F', elapsedMs: elapsed(), response: '',
      checks: [], completedAt: new Date().toISOString(),
      error: describeRunError(error instanceof Error ? error.message : 'Code Challenge failed.'),
    };
  }
}

export async function runAdvancedVisionChallenge(
  model: string,
  baseUrl: string,
  imageDataUrl: string,
  streamId?: string,
): Promise<AdvancedLabResult> {
  const startedAt = performance.now();
  try {
    if (!imageDataUrl) throw new Error('No test image was available to show the model.');
    const data = await agentArcadeApi.runAdvancedGenerate({
      model,
      baseUrl,
      prompt: ADVANCED_VISION_PROMPT,
      images: [imageDataUrl],
      keep_alive: '10m',
      timeoutMs: 180000,
      options: {
        temperature: 0.2,
        num_ctx: 4096,
        num_predict: 600,
      },
      ...(streamId ? { stream: true, streamId } : {}),
    });
    if (data.error) throw new Error(data.error);
    const raw = data.response ?? '';
    const scored = scoreAdvancedVisionResponse(raw, data.done_reason ?? '');
    return {
      model,
      challenge: 'image-recognition',
      ...scored,
      elapsedMs: Math.round(performance.now() - startedAt),
      response: raw,
      imageDataUrl,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = describeRunError(error instanceof Error ? error.message : 'Vision test failed.');
    return {
      model,
      challenge: 'image-recognition',
      score: 0,
      grade: 'F',
      elapsedMs: Math.round(performance.now() - startedAt),
      response: '',
      checks: [],
      completedAt: new Date().toISOString(),
      error: message,
    };
  }
}

/**
 * The reference passage, word for word as it is spoken in listening-test.wav.
 *
 * Forty-two words, deliberately: a shorter script makes the metric too
 * granular. Measured on gemma4:e2b, a model that heard an eight-word sentence
 * perfectly but wrote "pass code" for "passcode" scored 75 — the same slip
 * against this passage scores 95. It reads digits out individually, because the
 * scorer treats "77" as "seven seven" and does not understand quantities.
 */
export const LISTENING_REFERENCE =
  'The passcode is zebra seven seven. Please deliver the package to warehouse four on Tuesday morning. '
  + 'The order reference is alpha nine three. Contact Priya on extension two one five if the loading bay '
  + 'is closed. Do not use the side entrance.';

export const ADVANCED_LISTENING_PROMPT =
  'Listen to the audio and write down exactly what is said, word for word. Output only the words spoken.';

let listeningAudioCache = '';

/** The reference recording as bare base64, fetched from the bundled asset once. */
export async function getListeningTestAudio(): Promise<string> {
  if (listeningAudioCache) return listeningAudioCache;
  try {
    const response = await fetch(listeningTestAudio);
    const buffer = await response.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    // Chunked: spreading a 630 KB array into String.fromCharCode at once
    // overflows the argument limit.
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    listeningAudioCache = btoa(binary);
    return listeningAudioCache;
  } catch {
    return '';
  }
}

/**
 * Play a known passage and score what the model wrote down.
 *
 * Audio rides the same `images` array that carries pictures — verified against
 * Ollama 0.32.9, where gemma4:e2b transcribed this passage at 90/100 in eleven
 * seconds. Only models reporting the `audio` capability should be given this:
 * gemma3:4b reports `vision` but not `audio` and fails the identical request
 * with "Failed to load image or audio file".
 */
export async function runAdvancedListeningChallenge(
  model: string,
  baseUrl: string,
  audioBase64: string,
  streamId?: string,
): Promise<AdvancedLabResult> {
  const startedAt = performance.now();
  try {
    if (!audioBase64) throw new Error('The listening test recording could not be loaded.');
    const data = await agentArcadeApi.runAdvancedGenerate({
      model,
      baseUrl,
      prompt: ADVANCED_LISTENING_PROMPT,
      images: [audioBase64],
      keep_alive: '10m',
      timeoutMs: 240000,
      options: {
        temperature: 0,
        // The transcript is the whole answer, and it must not be cut off —
        // a truncated transcript scores as words the model failed to hear.
        num_ctx: 8192,
        num_predict: 800,
      },
      ...(streamId ? { stream: true, streamId } : {}),
    });
    if (data.error) throw new Error(data.error);
    const raw = data.response ?? '';
    const scored = scoreAdvancedListeningResponse(raw, LISTENING_REFERENCE, data.done_reason ?? '');
    return {
      model,
      challenge: 'listening',
      ...scored,
      elapsedMs: Math.round(performance.now() - startedAt),
      response: raw,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = describeRunError(error instanceof Error ? error.message : 'Listening test failed.');
    return {
      model,
      challenge: 'listening',
      score: 0,
      grade: 'F',
      elapsedMs: Math.round(performance.now() - startedAt),
      response: '',
      checks: [],
      completedAt: new Date().toISOString(),
      error: message,
    };
  }
}
