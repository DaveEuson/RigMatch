// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The Image Lab's decisions: which model may judge, which prompt was asked,
 * and what gets credited with having drawn the picture.
 *
 * That old path asked Ollama's `/api/generate` for an image with width, height
 * and steps. Ollama has never been able to answer it: it hosts no image models
 * and its runtime refuses the ones that exist. Every run this Lab has ever made
 * was an error dressed up as a score of zero.
 */

import { getModelCapabilities, isVisionModel, type CapabilityBearing } from './modelCatalog.ts';
import type { ImageRunResult } from './imageGenRun.ts';
import {
  CUSTOM_IMAGE_PROMPT_ID,
  IMAGE_BENCHMARK_PROMPTS,
  customImagePrompt,
  type ImagePrompt,
} from './imageGenScoring.ts';
import type { AdvancedLabResult } from './labResults.ts';

/**
 * Small enough to be quick, large enough for a judge to read the scene.
 *
 * No seed here on purpose. A fixed one made every rerun of the same
 * checkpoint identical to ComfyUI, which returns the cached image in about a
 * second and a half — and the run then reported that as the render time.
 * The seed comes from batchSeed() at call time instead: constant within one
 * batch so checkpoints compare fairly, different between batches so the work
 * actually happens.
 */
/**
 * Size is fixed; step count is not, and deliberately so.
 *
 * Twenty steps used to be pinned here for every checkpoint. That is the right
 * number for ordinary Stable Diffusion and the wrong one for a distilled model
 * — SDXL-Turbo renders in one to four steps with guidance off, and asking it
 * for twenty at CFG 7 returns a posterised mess. Scoring that mess for how well
 * it matched the prompt measured RigMatch's request, not the model.
 *
 * So steps and cfg are left to samplingProfileFor(), which reads the family
 * from the checkpoint name. Width and height stay fixed because those genuinely
 * must match for two models to be compared at all.
 */
export const IMAGE_RUN_SETTINGS = { width: 512, height: 512 } as const;

/**
 * Vision models that answer a yes/no question with something other than yes or
 * no, and so cannot be read.
 *
 * Two kinds, both measured on this machine against a generated lighthouse:
 *
 *   gemma3:4b        -> "Yes"
 *   bakllava:latest  -> "1"
 *
 * The llava family predates instruction-tuned VLMs and does not hold the
 * output format; deepseek-ocr and its relatives are built to transcribe
 * documents rather than to say whether a lighthouse is red. Neither is
 * excluded — on a machine that has nothing else, a judge that occasionally
 * answers beats going unjudged — but neither is ever the default, because the
 * default decides what most scores actually mean. Defaulting to bakllava would
 * report every run unjudged on a machine that also had gemma3:4b sitting there
 * answering perfectly.
 */
const WEAK_JUDGE = /\bocr\b|deepseek-ocr|got-ocr|olmocr|bakllava|^llava|\/llava/i;

/**
 * Vision models installed on this machine, most readable judge first.
 *
 * A judge that cannot see does not fail loudly — it answers every question
 * about an image it never looked at, and those answers score a real picture.
 * So what Ollama reports is preferred over the name, and the name rule is only
 * the fallback for a model it will not describe.
 */
export function judgeCandidates(installed: CapabilityBearing[]): string[] {
  const names = installed
    .filter((row) => {
      const capabilities = getModelCapabilities(row);
      if (capabilities) return capabilities.includes('vision');
      return isVisionModel(row.displayName ?? row.name ?? '');
    })
    .map((row) => row.name ?? row.displayName ?? '')
    .filter(Boolean);

  return [
    ...names.filter((name) => !WEAK_JUDGE.test(name)),
    ...names.filter((name) => WEAK_JUDGE.test(name)),
  ];
}

/**
 * The prompt for a run.
 *
 * `customText` wins when the id says custom: the user typed a scene, and it
 * arrives with no propositions, so adherence cannot be judged and the caller
 * says so. Empty custom text falls back to the first benchmark prompt rather
 * than asking ComfyUI to render nothing.
 */
export function imagePromptById(promptId?: string, customText?: string): ImagePrompt {
  if (promptId === CUSTOM_IMAGE_PROMPT_ID && customText && customText.trim()) {
    return customImagePrompt(customText);
  }
  return IMAGE_BENCHMARK_PROMPTS.find((p) => p.id === promptId) ?? IMAGE_BENCHMARK_PROMPTS[0];
}

/**
 * Fold a ComfyUI run into the shape the Lab already stores.
 *
 * Everything downstream — the Activity feed, the saved scorecards, the result
 * viewer — reads AdvancedLabResult. Converting here rather than widening that
 * type keeps a second runtime from leaking into five other files.
 *
 * The model recorded is the checkpoint, not an Ollama model, because that is
 * what actually generated the picture. Recording the judge here instead would
 * credit the wrong thing entirely.
 */
export function toLabResult(run: ImageRunResult, promptId?: string, customText?: string): AdvancedLabResult {
  const prompt = imagePromptById(promptId, customText);
  return {
    model: run.checkpoint,
    challenge: 'image-generation',
    score: run.score,
    grade: run.grade,
    elapsedMs: run.elapsedMs,
    response: prompt.prompt,
    checks: run.checks,
    completedAt: new Date().toISOString(),
    imageDataUrl: run.imageDataUrl,
    width: IMAGE_RUN_SETTINGS.width,
    height: IMAGE_RUN_SETTINGS.height,
    error: run.error,
  };
}
