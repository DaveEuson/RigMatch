/**
 * The Advanced Lab / skill-test challenge layer: the app-builder and image
 * prompts + presets, the per-challenge scoring rubrics, and the runners that
 * drive Ollama for each challenge (build an app, generate an image, recognize
 * an image). Extracted from App.tsx so both the run flow and the Advanced Lab
 * view share one implementation.
 */

import robotModelTest from '../assets/robot-model-test.webp';
import robotContestantWall from '../assets/robot-contestant-wall.webp';
import robotRigGreenroom from '../assets/robot-rig-greenroom.webp';
import robotScorecardCeremony from '../assets/robot-scorecard-ceremony.webp';
import { agentArcadeApi } from '../api';
import { describeRunError } from './format';
import { getAdvancedLabGrade, type AdvancedLabCheck, type AdvancedLabResult } from './labResults';
import { extractHtmlDocument } from './labPreview';
import { checkAppParses } from './appRunnability';
import { judgeAppBuilder } from './appBuilderJudge';

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

export type ImageGenerationModelOption = {
  model: string;
  label: string;
  sizeGb: number;
  license: string;
  note: string;
};

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

/** Resolve the effective App Builder prompt from a preset id or a custom request. */
// Pulls the judge's diagnosis of the latest attempt out of a result's checks, so
// the next improve pass can be told exactly what a reviewer found wrong. Returns
// '' when there is no failed "Judged working" check to learn from.
export function extractJudgedProblem(checks: AdvancedLabCheck[] | undefined): string {
  const judged = (checks ?? []).find((check) => check.label === 'Judged working');
  if (!judged || judged.passed) return '';
  return (judged.detail ?? '').trim();
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
  if (trimmedReview) priorities.push(`A code review of this exact code found: ${trimmedReview} — fix that problem.`);
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

// ── Image generation config ──────────────────────────────────────────────────

export const ADVANCED_IMAGE_GENERATION_PROMPT = 'A cheerful robot dog sitting beside a retro computer, warm studio lighting, playful but realistic, detailed fur-like metal texture, cozy workshop background';
export const ADVANCED_IMAGE_WIDTH = 512;
export const ADVANCED_IMAGE_HEIGHT = 512;
export const ADVANCED_IMAGE_STEPS = 12;
export const IMAGE_GENERATION_MODEL_OPTIONS: ImageGenerationModelOption[] = [
  {
    model: 'x/flux2-klein:4b',
    label: 'FLUX.2 Klein 4B',
    sizeGb: 5.7,
    license: 'Apache 2.0 weights',
    note: 'Smallest current Ollama image option; still a large pull.',
  },
  {
    model: 'x/z-image-turbo',
    label: 'Z-Image Turbo fp8',
    sizeGb: 13,
    license: 'Apache 2.0 weights',
    note: 'Photorealistic image model; much bigger download.',
  },
];

export const ADVANCED_VISION_PROMPT = 'Look at this image and describe exactly what you see in a few clear sentences. If there is any readable text, transcribe it. Be specific about objects, colors, and layout.';

// ── Image helpers ────────────────────────────────────────────────────────────

export function imageModelMatches(installedModel: string, requestedModel: string) {
  const installed = installedModel.toLowerCase();
  const requested = requestedModel.toLowerCase();
  const requestedBase = requested.replace(/:latest$/, '');
  return installed === requested || installed === `${requested}:latest` || installed === requestedBase || installed.startsWith(`${requestedBase}:`);
}

export function getInstalledImageModelName(installedModels: string[], requestedModel: string) {
  return installedModels.find((model) => imageModelMatches(model, requestedModel)) ?? '';
}

function buildImageDataUrl(image: string) {
  const trimmed = image.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

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

function scoreAdvancedVisionResponse(response: string, doneReason: string): Pick<AdvancedLabResult, 'score' | 'grade' | 'checks'> {
  const text = response.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const checks: AdvancedLabCheck[] = [
    {
      label: 'Described the image',
      passed: wordCount >= 12,
      detail: 'Returned a substantive description, not a one-liner or refusal.',
    },
    {
      label: 'Concrete visual detail',
      passed: /\b(color|colour|robot|text|background|left|right|top|bottom|blue|green|orange|red|yellow|character|shape|screen|button|face|eye|logo)\b/i.test(text),
      detail: 'Names specific objects, colors, or layout instead of staying vague.',
    },
    {
      label: 'Engaged with the picture',
      passed: !/\b(can'?t|cannot|unable to|no image|don'?t see)\b/i.test(text),
      detail: 'Actually read the image rather than declining or claiming no image.',
    },
    {
      label: 'Completed cleanly',
      passed: doneReason !== 'length' && doneReason !== 'error',
      detail: 'Did not truncate or error mid-answer.',
    },
  ];
  const score = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  return { score, grade: getAdvancedLabGrade(score), checks };
}

function scoreAdvancedImageResponse(imageDataUrl: string, doneReason: string): Pick<AdvancedLabResult, 'score' | 'grade' | 'checks'> {
  const checks: AdvancedLabCheck[] = [
    {
      label: 'Image returned',
      passed: imageDataUrl.startsWith('data:image/'),
      detail: 'Ollama returned an image payload instead of a text-only answer.',
    },
    {
      label: 'PNG/base64 payload',
      passed: /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/.test(imageDataUrl),
      detail: 'The image payload looks like a browser-renderable base64 image.',
    },
    {
      label: 'Completed cleanly',
      passed: doneReason !== 'length' && doneReason !== 'error',
      detail: 'The image run did not report an obvious truncation or error stop.',
    },
    {
      label: 'Small beta size',
      passed: ADVANCED_IMAGE_WIDTH <= 512 && ADVANCED_IMAGE_HEIGHT <= 512,
      detail: 'The beta test keeps image size small to reduce VRAM and time pressure.',
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

export async function runAdvancedImageGenerationChallenge(
  model: string,
  baseUrl: string,
  prompt: string = ADVANCED_IMAGE_GENERATION_PROMPT,
): Promise<AdvancedLabResult> {
  const startedAt = performance.now();

  try {
    const data = await agentArcadeApi.runAdvancedGenerate({
      model,
      baseUrl,
      prompt,
      timeoutMs: 240000,
      width: ADVANCED_IMAGE_WIDTH,
      height: ADVANCED_IMAGE_HEIGHT,
      steps: ADVANCED_IMAGE_STEPS,
      keep_alive: '5m',
    });
    if (data.error) throw new Error(data.error);

    const imageDataUrl = buildImageDataUrl(data.image ?? data.images?.[0] ?? '');
    const scored = scoreAdvancedImageResponse(imageDataUrl, data.done_reason ?? '');
    return {
      model,
      challenge: 'image-generation',
      ...scored,
      elapsedMs: Math.round(performance.now() - startedAt),
      response: data.response ?? '',
      imageDataUrl,
      width: ADVANCED_IMAGE_WIDTH,
      height: ADVANCED_IMAGE_HEIGHT,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = describeRunError(error instanceof Error ? error.message : 'Image generation failed.');
    return {
      model,
      challenge: 'image-generation',
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
