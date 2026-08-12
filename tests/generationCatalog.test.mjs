import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GENERATION_MODELS,
  generationCatalogRows,
  downloadPlan,
  formatBytesGb,
  generationModelById,
  isCatalogFile,
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

test('a video checkpoint always declares the encoder it cannot run without', () => {
  // An LTX file alone fails inside CLIPLoader, which reads as a broken model
  // rather than a missing file.
  for (const m of GENERATION_MODELS.filter((x) => x.kind === 'video')) {
    assert.ok(m.requires?.length, `${m.id} declares no text encoder`);
    for (const id of m.requires) {
      const dep = generationModelById(id);
      assert.ok(dep, `${m.id} requires unknown model ${id}`);
      assert.equal(dep.kind, 'text-encoder', `${m.id} requires a non-encoder`);
    }
  }
});

test('each kind lands in the folder ComfyUI reads it from', () => {
  for (const m of GENERATION_MODELS) {
    const expected = m.kind === 'text-encoder' ? 'text_encoders' : 'checkpoints';
    assert.equal(m.folder, expected, `${m.id} would be written to the wrong folder`);
  }
});

test('a download plan includes the encoder, and totals the real cost', () => {
  const ltx = generationModelById('ltxv-distilled');
  const plan = downloadPlan(ltx, []);
  assert.equal(plan.needed.length, 2, 'the encoder must be part of the offer');
  assert.ok(plan.needed.some((m) => m.id === 't5xxl-fp8'));
  assert.equal(plan.totalBytes, ltx.bytes + generationModelById('t5xxl-fp8').bytes);
});

test('a plan skips what is already on disk', () => {
  const plan = downloadPlan(generationModelById('ltxv-distilled'), ['t5xxl_fp8_e4m3fn.safetensors']);
  assert.deepEqual(plan.needed.map((m) => m.id), ['ltxv-distilled']);
});

test('an already-complete plan asks for nothing', () => {
  const plan = downloadPlan(generationModelById('ltxv-distilled'),
    ['ltxv-2b-distilled.safetensors', 't5xxl_fp8_e4m3fn.safetensors']);
  assert.equal(plan.needed.length, 0);
  assert.equal(plan.totalBytes, 0);
});

test('installed filenames match case-insensitively', () => {
  // ComfyUI lists whatever the filesystem gives it, and Windows does not care
  // about case.
  const plan = downloadPlan(generationModelById('ltxv-distilled'), ['T5XXL_FP8_E4M3FN.SafeTensors']);
  assert.deepEqual(plan.needed.map((m) => m.id), ['ltxv-distilled']);
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
  // and rendered with during this work.
  const proven = GENERATION_MODELS.filter((m) => m.proven).map((m) => m.id).sort();
  assert.deepEqual(proven, ['ltxv-distilled', 'sd15', 't5xxl-fp8']);
});

test('ids are unique, since downloads are keyed on them', () => {
  const ids = GENERATION_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  const files = GENERATION_MODELS.map((m) => m.filename.toLowerCase());
  assert.equal(new Set(files).size, files.length, 'two entries would overwrite each other');
});

test('every entry names its publisher', () => {
  // These labels match no Ollama family, so without this the By column read
  // "Unknown model family" for all of them.
  for (const m of GENERATION_MODELS) {
    assert.ok(m.publisher && m.publisher.length > 1, `${m.id} has no publisher`);
  }
});

test('a row says what it makes rather than leaving it to be inferred', () => {
  const rows = generationCatalogRows([]);
  const ltx = rows.find((r) => r.generationId === 'ltxv-distilled');
  assert.equal(ltx.generationKind, 'video');
  assert.equal(ltx.runtime, 'comfyui');
  assert.equal(ltx.publisher, 'Lightricks');
});

test('a row is installed only when ComfyUI is listing the file', () => {
  // A file on disk the running server cannot see may as well not exist.
  const absent = generationCatalogRows([]).find((r) => r.generationId === 'sd15');
  assert.equal(absent.installedFile, false);
  const present = generationCatalogRows(['sd15.safetensors']).find((r) => r.generationId === 'sd15');
  assert.equal(present.installedFile, true);
});
