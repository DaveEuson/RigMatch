// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Picture models that come as three files rather than one checkpoint.
 *
 * SD 1.5 and SDXL Turbo are checkpoints: one file carries the model, its text
 * encoder and its decoder, and one graph runs them all. Z-Image Turbo and
 * FLUX.2 [klein] ship the three parts separately, each in its own ComfyUI
 * folder, and each family wants its own text-encoder type, sampler and step
 * count. Handed to the checkpoint graph they fail in the loader; asked for 20
 * steps at CFG 7 they ruin a distilled model.
 *
 * The settings follow ComfyUI's own templates (Comfy-Org/workflow_templates,
 * templates/image_z_image_turbo_int8.json and
 * templates/image_flux2_klein_text_to_image.json); the graphs are in
 * comfyui.ts.
 */

import { isPictureCheckpoint } from './checkpointKinds.ts';
import { GENERATION_MODELS, type ComfyFolderListing, type GenerationModel } from './generationCatalog.ts';

export type PictureRecipe = {
  /** The generation catalog id of the model file; its `requires` name the encoder and decoder. */
  id: string;
  /** Which graph: Z-Image's AuraFlow sampling, or FLUX.2's own scheduler. */
  graph: 'aura-flow' | 'flux2';
  /** CLIPLoader's type for the encoder. */
  clipType: 'lumina2' | 'flux2';
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  /** ModelSamplingAuraFlow's shift, for the aura-flow graph. */
  shift?: number;
  /** Why these numbers, in words a person can check against the model's own docs. */
  reason: string;
};

export const PICTURE_RECIPES: PictureRecipe[] = [
  {
    id: 'z-image-turbo',
    graph: 'aura-flow',
    clipType: 'lumina2',
    steps: 8,
    cfg: 1,
    sampler: 'res_multistep',
    scheduler: 'simple',
    shift: 3,
    reason: "Z-Image Turbo is distilled for 8 steps with guidance off, as in ComfyUI's own template.",
  },
  {
    id: 'flux2-klein-4b',
    graph: 'flux2',
    clipType: 'flux2',
    steps: 4,
    cfg: 1,
    sampler: 'euler',
    scheduler: 'flux2',
    reason: "FLUX.2 [klein] 4B is distilled for 4 steps with guidance off, as in ComfyUI's own template.",
  },
];

export type RecipeFiles = {
  recipe: PictureRecipe;
  label: string;
  /** The model file, as ComfyUI lists it in diffusion_models. */
  unet: string;
  clip: string;
  vae: string;
};

const bareName = (file: string) => (file.split(/[\\/]/).pop() ?? file).toLowerCase();

function parts(model: GenerationModel) {
  const part = (kind: GenerationModel['kind']) => GENERATION_MODELS.find((m) => m.kind === kind && model.requires?.includes(m.id));
  return { clip: part('text-encoder'), vae: part('vae') };
}

/** The recipe and its three files, for a model file by the name ComfyUI lists it under. */
export function recipeForFile(file: string): RecipeFiles | null {
  const model = GENERATION_MODELS.find((m) => m.folder === 'diffusion_models' && m.filename.toLowerCase() === bareName(file ?? ''));
  const recipe = model && PICTURE_RECIPES.find((r) => r.id === model.id);
  if (!model || !recipe) return null;
  const { clip, vae } = parts(model);
  if (!clip || !vae) return null;
  return { recipe, label: model.label, unet: file, clip: clip.filename, vae: vae.filename };
}

/**
 * Every picture model ComfyUI can draw with here: picture checkpoints, then
 * the three-file models whose model, encoder and decoder are all listed.
 * A model file without its encoder would fail in the loader, so it is left out.
 */
export function drawableModels(folders: ComfyFolderListing): string[] {
  const listed = (folder: keyof ComfyFolderListing, filename: string) =>
    (folders[folder] ?? []).some((name) => name.toLowerCase() === filename.toLowerCase());
  const split = (folders.diffusion_models ?? []).filter((file) => {
    const files = recipeForFile(file);
    return Boolean(files && listed('text_encoders', files.clip) && listed('vae', files.vae));
  });
  return [...(folders.checkpoints ?? []).filter(isPictureCheckpoint), ...split];
}

/**
 * The most a three-file model holds in graphics memory at once, in GB.
 *
 * ComfyUI loads the encoder to read the prompt, then swaps it out for the
 * model and its decoder, so the peak is whichever is larger, not their sum.
 * Sized by the sum, both models read "Too big" on a 12 GB card that draws
 * with either at about 8 GB. Null for anything that is not one of these.
 */
export function recipeFootprintGb(modelId: string): number | null {
  const model = GENERATION_MODELS.find((m) => m.id === modelId);
  if (!model || !PICTURE_RECIPES.some((r) => r.id === modelId)) return null;
  const { clip, vae } = parts(model);
  if (!clip || !vae) return null;
  return Number((Math.max(model.bytes + vae.bytes, clip.bytes) / 1e9).toFixed(2));
}
