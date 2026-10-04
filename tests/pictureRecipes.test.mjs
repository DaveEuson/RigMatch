// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recipeForFile, drawableModels, recipeFootprintGb, PICTURE_RECIPES } from '../src/lib/pictureRecipes.ts';
import { buildRecipeWorkflow } from '../src/lib/comfyui.ts';
import { samplingProfileFor } from '../src/lib/samplingProfile.ts';
import { runImageGeneration } from '../src/lib/imageGenRun.ts';
import { IMAGE_BENCHMARK_PROMPTS } from '../src/lib/imageGenScoring.ts';
import { GENERATION_MODELS, downloadPlan, generationFileLabel } from '../src/lib/generationCatalog.ts';
import { getHardwareFit } from '../src/lib/modelCatalog.ts';
import { validateGraph } from './lib/comfyGraphValidator.mjs';

const objectInfo = JSON.parse(readFileSync(new URL('./fixtures/object_info-comfyui-e5a38e3.json', import.meta.url), 'utf8'));
const Z = 'z_image_turbo_int8_convrot.safetensors';
const KLEIN = 'flux-2-klein-4b.safetensors';
const allParts = {
  checkpoints: ['sd15.safetensors', 'ltxv-2b-distilled.safetensors'],
  diffusion_models: [Z, KLEIN],
  text_encoders: ['qwen_3_4b.safetensors'],
  vae: ['ae.safetensors', 'flux2-vae.safetensors'],
};

test('each recipe names its model, encoder and decoder from the catalog', () => {
  assert.deepEqual(
    (({ unet, clip, vae, label }) => ({ unet, clip, vae, label }))(recipeForFile(Z)),
    { unet: Z, clip: 'qwen_3_4b.safetensors', vae: 'ae.safetensors', label: 'Z-Image Turbo' },
  );
  assert.equal(recipeForFile(KLEIN).vae, 'flux2-vae.safetensors');
  assert.equal(recipeForFile(`sub/${Z}`).unet, `sub/${Z}`, 'the loader is asked for the name ComfyUI lists');
  assert.equal(recipeForFile('sd15.safetensors'), null, 'a checkpoint has no recipe');
  for (const recipe of PICTURE_RECIPES) assert.ok(GENERATION_MODELS.some((m) => m.id === recipe.id), recipe.id);
});

test('a three-file model is drawable only with all three parts', () => {
  assert.deepEqual(drawableModels(allParts), ['sd15.safetensors', Z, KLEIN], 'the video checkpoint is left out');
  assert.deepEqual(drawableModels({ ...allParts, vae: ['ae.safetensors'] }), ['sd15.safetensors', Z], 'FLUX.2 without its VAE');
  assert.deepEqual(drawableModels({ ...allParts, text_encoders: [] }), ['sd15.safetensors'], 'neither without the shared encoder');
});

test('the two share one encoder download', () => {
  const z = GENERATION_MODELS.find((m) => m.id === 'z-image-turbo');
  const klein = GENERATION_MODELS.find((m) => m.id === 'flux2-klein-4b');
  const afterZ = { diffusion_models: [Z], text_encoders: ['qwen_3_4b.safetensors'], vae: ['ae.safetensors'] };
  assert.equal(downloadPlan(z, {}).needed.length, 3);
  assert.deepEqual(downloadPlan(klein, afterZ).needed.map((m) => m.filename), [KLEIN, 'flux2-vae.safetensors']);
});

test('steps and guidance come from the recipe, not the word "turbo"', () => {
  assert.equal(samplingProfileFor(Z).steps, 8, 'Z-Image Turbo is made for 8; the turbo rule would give 4');
  assert.equal(samplingProfileFor(Z).cfg, 1);
  assert.equal(samplingProfileFor(KLEIN).steps, 4);
  assert.equal(samplingProfileFor('sdxl-turbo.safetensors').steps, 4, 'SDXL Turbo is unchanged');
});

test('sized by what is held at once, both fit a 12 GB card', () => {
  assert.equal(recipeFootprintGb('z-image-turbo'), 8.04, 'the encoder, the larger of the two phases');
  assert.equal(recipeFootprintGb('flux2-klein-4b'), 8.09, 'model plus VAE');
  assert.equal(recipeFootprintGb('sdxl-turbo'), null);
  for (const id of ['z-image-turbo', 'flux2-klein-4b']) {
    assert.equal(getHardwareFit({ params: 'Image model', sizeGb: recipeFootprintGb(id) }, 12).recommend, true, id);
  }
});

test('both graphs are ones this ComfyUI accepts', () => {
  for (const file of [Z, KLEIN]) {
    const { recipe, unet, clip, vae } = recipeForFile(file);
    const graph = buildRecipeWorkflow({
      graph: recipe.graph, unet, clip, clipType: recipe.clipType, vae,
      prompt: 'a red lighthouse', width: 512, height: 512, steps: recipe.steps, cfg: recipe.cfg,
      seed: 7, sampler: recipe.sampler, scheduler: recipe.scheduler, shift: recipe.shift,
    });
    assert.deepEqual(validateGraph(graph, objectInfo), [], `${file} would be refused`);
  }
});

test('a picture run submits the model\'s own graph', async () => {
  const graphs = [];
  const transport = {
    submit: async (graph) => { graphs.push(graph); return { promptId: 'p1' }; },
    history: async () => ({ p1: { outputs: { 21: { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } }, status: { completed: true, status_str: 'success' } } }),
    image: async () => 'data:image/png;base64,AAAA',
    interrupt: async () => {},
  };
  let t = 0;
  const result = await runImageGeneration({
    transport, checkpoint: KLEIN, imagePrompt: IMAGE_BENCHMARK_PROMPTS[0], settings: { width: 512, height: 512, seed: 3 },
    now: () => t, sleep: async (ms) => { t += ms; },
  });
  const classes = Object.values(graphs[0]).map((node) => node.class_type);
  assert.ok(classes.includes('Flux2Scheduler') && classes.includes('UNETLoader'));
  assert.ok(!classes.includes('CheckpointLoaderSimple'));
  assert.equal(result.steps, 4);
  assert.equal(result.imageDataUrl, 'data:image/png;base64,AAAA');
});

test('a model file is shown by its name', () => {
  assert.equal(generationFileLabel(Z), 'Z-Image Turbo');
  assert.equal(generationFileLabel(`sub\\${KLEIN}`), 'FLUX.2 [klein] 4B');
  assert.equal(generationFileLabel('my-own.safetensors'), 'my-own.safetensors');
});
