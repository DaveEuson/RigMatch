// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERATION_MODELS,
  generationCatalogRows,
  downloadPlan,
  formatBytesGb,
  generationModelById,
  isCatalogFile,
  isListed,
} from '../src/lib/generationCatalog.ts';

test('every entry has a Hugging Face URL and a real byte size', () => {
  // Sizes are shown to someone deciding whether to spend an evening on a
  // download, so a placeholder would be a lie about their time.
  for (const m of GENERATION_MODELS) {
    assert.match(m.url, /^https:\/\/huggingface\.co\//, `${m.id} is not a Hugging Face URL`);
    assert.ok(m.bytes > 1e8, `${m.id} has an implausible size`);
    assert.match(m.filename, /\.safetensors$/, `${m.id} is not a safetensors file`);
  }
});

test('a video model always declares the text encoder it cannot run without', () => {
  // An LTX file alone fails inside CLIPLoader, which reads as a broken model
  // rather than a missing file. Lineup models need more besides — a VAE, a
  // LoRA, a second expert — and the graph tests hold those to their graphs.
  // This holds the part every video model shares, and that nothing it requires
  // is a model someone would pick on its own.
  for (const m of GENERATION_MODELS.filter((x) => x.kind === 'video')) {
    assert.ok(m.requires?.length, `${m.id} declares nothing it needs`);
    const deps = m.requires.map(generationModelById);
    deps.forEach((dep, i) => assert.ok(dep, `${m.id} requires unknown model ${m.requires[i]}`));
    assert.ok(deps.some((dep) => dep.kind === 'text-encoder'), `${m.id} declares no text encoder`);
    for (const dep of deps) {
      assert.ok(['text-encoder', 'vae', 'lora', 'expert'].includes(dep.kind),
        `${m.id} requires ${dep.id}, which is a model in its own right`);
    }
  }
});

test('each kind lands in a folder ComfyUI reads that kind from', () => {
  // LTX-2 and LTX-2.3 ship as whole checkpoints; every other video model is a
  // bare diffusion model. The graph tests pin each file to its exact loader.
  const FOLDERS = {
    image: ['checkpoints'],
    video: ['checkpoints', 'diffusion_models'],
    'text-encoder': ['text_encoders'],
    vae: ['vae'],
    lora: ['loras'],
    expert: ['diffusion_models'],
  };
  for (const m of GENERATION_MODELS) {
    assert.ok(FOLDERS[m.kind]?.includes(m.folder), `${m.id} (${m.kind}) would be written to ${m.folder}/`);
  }
});

test('a download plan includes the encoder, and totals the real cost', () => {
  const ltx = generationModelById('ltxv-distilled');
  const plan = downloadPlan(ltx, {});
  assert.equal(plan.needed.length, 2, 'the encoder must be part of the offer');
  assert.ok(plan.needed.some((m) => m.id === 't5xxl-fp8'));
  assert.equal(plan.totalBytes, ltx.bytes + generationModelById('t5xxl-fp8').bytes);
});

test('a plan skips what is already on disk', () => {
  const plan = downloadPlan(generationModelById('ltxv-distilled'), {
    text_encoders: ['t5xxl_fp8_e4m3fn.safetensors'],
  });
  assert.deepEqual(plan.needed.map((m) => m.id), ['ltxv-distilled']);
});

test('an already-complete plan asks for nothing', () => {
  const plan = downloadPlan(generationModelById('ltxv-distilled'), {
    checkpoints: ['ltxv-2b-distilled.safetensors'],
    text_encoders: ['t5xxl_fp8_e4m3fn.safetensors'],
  });
  assert.equal(plan.needed.length, 0);
  assert.equal(plan.totalBytes, 0);
});

test('installed filenames match case-insensitively', () => {
  // ComfyUI lists whatever the filesystem gives it, and Windows does not care
  // about case.
  const plan = downloadPlan(generationModelById('ltxv-distilled'), {
    text_encoders: ['T5XXL_FP8_E4M3FN.SafeTensors'],
  });
  assert.deepEqual(plan.needed.map((m) => m.id), ['ltxv-distilled']);
});

test('a file in the wrong folder is not installed, whatever the disk says', () => {
  // A real machine had the LTX-Video 2B 0.9.8 file in checkpoints/. UNETLoader
  // reads diffusion_models/, so nothing could have loaded it from there.
  const ltxv = generationModelById('ltxv-2b');
  assert.equal(isListed(ltxv, { checkpoints: [ltxv.filename] }), false);
  assert.equal(isListed(ltxv, { diffusion_models: [ltxv.filename] }), true);
});

test('a lineup model plans every file it needs, and then only the missing ones', () => {
  const wan = generationModelById('wan-2.1-1.3b');
  assert.deepEqual(downloadPlan(wan, {}).needed.map((m) => m.id).sort(), ['umt5-fp8', 'vae-wan21', 'wan-2.1-1.3b']);
  const partial = downloadPlan(wan, {
    text_encoders: ['umt5_xxl_fp8_e4m3fn_scaled.safetensors'],
    vae: ['wan_2.1_vae.safetensors'],
  });
  assert.deepEqual(partial.needed.map((m) => m.id), ['wan-2.1-1.3b']);
  assert.equal(partial.totalBytes, wan.bytes);
});

test('files RigMatch did not put there are simply not ours', () => {
  // A user's own download shows as not-installed, which offers a redundant
  // download rather than claiming something false about a file we never wrote.
  assert.ok(isCatalogFile('sd15.safetensors'));
  assert.ok(!isCatalogFile('ltx-video-2b-v0.9.5.safetensors'));
  assert.ok(!isCatalogFile('someones-own-merge.safetensors'));
});

test('sizes read as gigabytes a person can weigh', () => {
  assert.equal(formatBytesGb(2132696762), '2.13 GB');
  assert.equal(formatBytesGb(6338544128), '6.34 GB');
});

test('the proven entries are the ones actually run on this machine', () => {
  // Marked separately from "the URL resolves" — these three were downloaded
  // and rendered with during this work. videobench timing six of the lineup
  // models is not RigMatch running them, so none of those is proven yet.
  const proven = GENERATION_MODELS.filter((m) => m.proven).map((m) => m.id).sort();
  assert.deepEqual(proven, ['ltxv-distilled', 'sd15', 't5xxl-fp8']);
});

test('ids are unique, since downloads are keyed on them', () => {
  const ids = GENERATION_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  const files = GENERATION_MODELS.map((m) => m.filename.toLowerCase());
  assert.equal(new Set(files).size, files.length, 'two entries would overwrite each other');
});

test('a checksum, where one is declared, is a real SHA-256', () => {
  // Every lineup file carries one; the graph tests check each against the export.
  for (const m of GENERATION_MODELS.filter((x) => x.sha256 !== undefined)) {
    assert.match(m.sha256, /^[0-9a-f]{64}$/, `${m.id} has a malformed sha256`);
  }
});

test('only files from a gated repository are marked gated', () => {
  const gated = GENERATION_MODELS.filter((m) => m.gated);
  assert.ok(gated.length > 0, 'LTX-2.5 lives in a gated repository');
  for (const m of gated) assert.match(m.url, /^https:\/\/huggingface\.co\/Lightricks\/LTX-2\.5\//, m.id);
});

test('every entry names its publisher', () => {
  // These labels match no Ollama family, so without this the By column read
  // "Unknown model family" for all of them.
  for (const m of GENERATION_MODELS) {
    assert.ok(m.publisher && m.publisher.length > 1, `${m.id} has no publisher`);
  }
});

test('a row says what it makes rather than leaving it to be inferred', () => {
  const rows = generationCatalogRows({});
  const ltx = rows.find((r) => r.generationId === 'ltxv-distilled');
  assert.equal(ltx.generationKind, 'video');
  assert.equal(ltx.runtime, 'comfyui');
  assert.equal(ltx.publisher, 'Lightricks');
});

test('only models are rows; the parts they need are not', () => {
  // Two encoder rows were tolerable. Twenty-five encoders, VAEs and LoRAs would
  // bury the seventeen models they exist to serve.
  const rows = generationCatalogRows({});
  assert.ok(rows.every((r) => r.generationKind === 'image' || r.generationKind === 'video'));
  assert.ok(rows.some((r) => r.generationId === 'kandinsky-5'));
  assert.ok(!rows.some((r) => r.generationId === 'vae-wan21'));
});

test('a row is installed only when ComfyUI lists every file it needs, where it needs it', () => {
  // A file on disk the running server cannot see may as well not exist, and a
  // video model missing its VAE cannot render.
  const absent = generationCatalogRows({}).find((r) => r.generationId === 'sd15');
  assert.equal(absent.installedFile, false);
  const present = generationCatalogRows({ checkpoints: ['sd15.safetensors'] }).find((r) => r.generationId === 'sd15');
  assert.equal(present.installedFile, true);
  const noVae = generationCatalogRows({
    diffusion_models: ['wan2.1_t2v_1.3B_fp16.safetensors'],
    text_encoders: ['umt5_xxl_fp8_e4m3fn_scaled.safetensors'],
  }).find((r) => r.generationId === 'wan-2.1-1.3b');
  assert.equal(noVae.installedFile, false);
});
