// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VIDEO_LINEUP,
  againstEstimate,
  allLineupEntries,
  asHardwareFit,
  calibrationFrom,
  comfyListing,
  estimateLineup,
  isLineupInstalled,
  lineupCardFacts,
  lineupDownloadBytes,
  lineupEntry,
  lineupFileIds,
  lineupGraph,
  lineupRecordEntry,
  lineupTimeoutMs,
  measuredSecondsFor,
  rankLineup,
  runVideoLineup,
  runnableLineup,
  strayLtxEntries,
  strayLtxName,
  videoMachineFrom,
} from '../src/lib/videoLineup.ts';
import { VIDEO_MODEL_SPECS } from '../src/lib/videoCatalog.ts';
import { buildTxt2VideoWorkflow } from '../src/lib/videoGen.ts';
import { generationModelById } from '../src/lib/generationCatalog.ts';
import { IMAGE_BENCHMARK_PROMPTS } from '../src/lib/imageGenScoring.ts';
import { estimateVideoSeconds, formatVideoEstimate, videoFit } from '../src/lib/videoFit.ts';

/**
 * Several video models, one prompt, one seed, one after another. What makes it
 * a comparison is identical input and an identical starting state; what makes
 * it useful is that one model failing does not end it.
 */

const RTX_4070 = { vramGb: 12, ramGb: 61.6, gpuName: 'NVIDIA GeForce RTX 4070', platform: 'win32' };
const SMALL_PC = { vramGb: 8, ramGb: 16, platform: 'win32' };
const PROMPT = IMAGE_BENCHMARK_PROMPTS[0];

/** What a real ComfyUI lists for Wan 2.1 1.3B, installed properly. */
const WAN_13B_ON_DISK = {
  diffusion_models: ['wan2.1_t2v_1.3B_fp16.safetensors'],
  text_encoders: ['umt5_xxl_fp8_e4m3fn_scaled.safetensors'],
  vae: ['wan_2.1_vae.safetensors'],
};

/** A ComfyUI listing with every file these models need, where their loaders look. */
function onDisk(...keys) {
  const listing = {};
  for (const key of keys) {
    for (const id of lineupFileIds(lineupEntry(key))) {
      const file = generationModelById(id);
      (listing[file.folder] ??= []).push(file.filename);
    }
  }
  return listing;
}

test('every catalogue model is in the lineup, and so is the 0.6 checkpoint people already have', () => {
  const keys = VIDEO_LINEUP.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const spec of VIDEO_MODEL_SPECS) assert.ok(keys.includes(spec.key), spec.key);
  assert.ok(lineupEntry('ltxv-distilled')?.legacy);
});

test('a model is installed only when every file is listed where its loader looks', () => {
  const wan = lineupEntry('wan-2.1-1.3b');
  assert.equal(isLineupInstalled(wan, WAN_13B_ON_DISK), true);
  assert.equal(isLineupInstalled(wan, { ...WAN_13B_ON_DISK, vae: [] }), false, 'no VAE, no video');
  assert.equal(
    isLineupInstalled(wan, { ...WAN_13B_ON_DISK, diffusion_models: [], checkpoints: ['wan2.1_t2v_1.3B_fp16.safetensors'] }),
    false,
    'the model in checkpoints/ loads nowhere',
  );
});

test('the download size counts only the files still missing', () => {
  const wan = lineupEntry('wan-2.1-1.3b');
  const partial = { text_encoders: WAN_13B_ON_DISK.text_encoders };
  assert.equal(
    lineupDownloadBytes(wan, partial),
    generationModelById('wan-2.1-1.3b').bytes + generationModelById('vae-wan21').bytes,
  );
  assert.equal(lineupDownloadBytes(wan, WAN_13B_ON_DISK), 0);
});

test('a card says why a model cannot join the lineup yet', () => {
  const missing = lineupCardFacts(lineupEntry('wan-2.1-1.3b'), { machine: RTX_4070, installed: {} });
  assert.equal(missing.runnable, false);
  assert.equal(missing.blocked, 'Download it first.');
  assert.ok(missing.downloadBytes > 0);

  const tooBig = lineupCardFacts(lineupEntry('minimax-h3'), { machine: SMALL_PC, installed: {} });
  assert.equal(tooBig.fit.status, 'too-big');
  assert.match(tooBig.blocked, /system memory/);

  const ready = lineupCardFacts(lineupEntry('wan-2.1-1.3b'), { machine: RTX_4070, installed: WAN_13B_ON_DISK });
  assert.equal(ready.runnable, true);
  assert.equal(ready.blocked, null);
  assert.equal(ready.downloadBytes, 0);
});

test('a gated model asks for a token to download, and not once it is on disk', () => {
  const ltx25 = lineupEntry('ltx-2.5');
  assert.equal(lineupCardFacts(ltx25, { machine: RTX_4070, installed: {} }).fit.status, 'needs-token');
  assert.notEqual(lineupCardFacts(ltx25, { machine: RTX_4070, installed: onDisk('ltx-2.5') }).fit.status, 'needs-token');
});

test('the 0.6 checkpoint runs the graph it always ran', () => {
  const run = { prompt: 'a lighthouse', seed: 42 };
  assert.deepEqual(
    lineupGraph(lineupEntry('ltxv-distilled'), run),
    buildTxt2VideoWorkflow({
      checkpoint: 'ltxv-2b-distilled.safetensors', textEncoder: 't5xxl_fp8_e4m3fn.safetensors', ...run,
    }),
  );
});

test('a catalogue model runs its family graph, with the frame the judge reads', () => {
  const graph = lineupGraph(lineupEntry('kandinsky-5'), { prompt: 'a lighthouse', seed: 42 });
  const classes = Object.values(graph).map((node) => node.class_type);
  assert.ok(classes.includes('Kandinsky5ImageToVideo'));
  assert.ok(classes.includes('ImageFromBatch'));
  assert.ok(Object.values(graph).some((node) => node.inputs.filename_prefix === 'RigMatchFrame'));
});

test('a three-hour model is not cut off at thirty minutes', () => {
  // Kandinsky 5 Pro takes about three hours a clip on the reference card.
  assert.ok(lineupTimeoutMs(lineupEntry('kandinsky-5-pro')) >= 3 * 3600 * 1000);
  assert.equal(lineupTimeoutMs(lineupEntry('ltxv-2b')), 30 * 60 * 1000);
});

// ── models found on disk ────────────────────────────────────────────────────

test('an LTX-Video 0.9 file RigMatch never downloaded still races, and nothing else found does', () => {
  const found = strayLtxEntries({
    checkpoints: [
      'ltx-video-2b-v0.9.5.safetensors', // LTX 0.9: runs the 0.6 graph
      'ltxv-13b-0.9.7-dev.safetensors', // LTX 0.9, 13B
      'ltx-2-19b-distilled-fp8.safetensors', // LTX-2: a different graph
      'wan2.1_t2v_1.3B_fp16.safetensors', // Wan, in the wrong folder
      'ltxv-2b-distilled.safetensors', // the catalogue's own file
      'sd15.safetensors',
    ],
    text_encoders: ['t5xxl_fp8_e4m3fn.safetensors'],
  });
  assert.deepEqual(found.map((entry) => entry.key), [
    'file:ltx-video-2b-v0.9.5.safetensors',
    'file:ltxv-13b-0.9.7-dev.safetensors',
  ]);
  assert.ok(found.every((entry) => entry.found && isLineupInstalled(entry, {}) && lineupDownloadBytes(entry, {}) === 0));
  assert.equal(found[1].sizing.ditGb, lineupEntry('ltxv-13b').sizing.ditGb, 'a 13B file is sized as one');
  assert.equal(found[0].refMeasured, false, 'its time stays rough until this machine renders it');
  // The maker card in Chat offered "ltx-video-2b-v0.9.5.safetensors" as the name
  // of the model about to make your clip. A filename is not a name.
  assert.deepEqual(found.map((entry) => entry.name), [
    'LTX-Video 2B 0.9.5 (your own file)',
    'LTX-Video 13B 0.9.7 (your own file)',
  ]);
  assert.equal(found[0].legacy.checkpoint, 'ltx-video-2b-v0.9.5.safetensors', 'the graph still loads the file itself');
  assert.equal(strayLtxName('mystery.safetensors'), 'mystery', 'a name with nothing to read keeps its own');
  assert.equal(allLineupEntries({ checkpoints: ['ltx-video-2b-v0.9.5.safetensors'], text_encoders: ['t5xxl_fp8_e4m3fn.safetensors'] }).length, VIDEO_LINEUP.length + 1);
});

test('an older bridge that lists two folders still describes what is installed', () => {
  assert.deepEqual(
    comfyListing({ checkpoints: ['a.safetensors'], textEncoders: ['t5.safetensors'] }),
    { checkpoints: ['a.safetensors'], text_encoders: ['t5.safetensors'] },
  );
  assert.deepEqual(comfyListing({ checkpoints: [], folders: { vae: ['v.safetensors'] } }), { vae: ['v.safetensors'] });
  assert.deepEqual(comfyListing(null), {});
});

// ── this machine ────────────────────────────────────────────────────────────

test('this machine is read from the system profile the rest of the app uses', () => {
  const machine = videoMachineFrom({
    platform: 'win32',
    memory: { totalGb: 61.6, availableGb: 40, usedGb: 21.6 },
    gpu: { vendor: 'NVIDIA', model: 'NVIDIA GeForce RTX 4070', vramGb: 12, vramUsedGb: null, gpuLoadPercent: null, driverVersion: '', bus: '' },
  });
  assert.deepEqual(machine, { vramGb: 12, ramGb: 61.6, unifiedMemory: false, platform: 'win32', gpuName: 'NVIDIA GeForce RTX 4070' });
});

test('what can race now is what is on disk and runs here, fastest first', () => {
  const installed = onDisk('wan-2.1-1.3b', 'ltxv-2b', 'minimax-h3');
  const order = (machine) => runnableLineup(installed, machine).map((entry) => entry.key);
  const expected = ['wan-2.1-1.3b', 'ltxv-2b', 'minimax-h3']
    .sort((a, b) => estimateVideoSeconds(lineupEntry(a).sizing, RTX_4070).seconds - estimateVideoSeconds(lineupEntry(b).sizing, RTX_4070).seconds);
  assert.deepEqual(order(RTX_4070), expected);
  assert.equal(order(RTX_4070)[0], 'ltxv-2b');
  assert.deepEqual(order(SMALL_PC), ['ltxv-2b', 'wan-2.1-1.3b'], 'too big here is left out, not attempted');
});

test('a lineup’s total is the sum of its models, and says rough until calibrated', () => {
  const entries = ['ltxv-2b', 'wan-2.1-1.3b'].map(lineupEntry);
  const parts = entries.map((entry) => estimateVideoSeconds(entry.sizing, RTX_4070));
  const total = estimateLineup(entries, RTX_4070);
  assert.equal(total.low, parts[0].low + parts[1].low);
  assert.equal(total.high, parts[0].high + parts[1].high);
  assert.equal(total.basis, 'rough');
  const calibrated = estimateLineup(entries, RTX_4070, { calibration: { gpu: RTX_4070.gpuName, seconds: 17 } });
  assert.equal(calibrated.basis, 'calibrated');
});

test('a lineup of measured models still reads as a forecast, and once', () => {
  const saved = {
    'video:ltxv-2b': { elapsedMs: 16000, gpu: RTX_4070.gpuName },
    'video:wan-2.1-1.3b': { elapsedMs: 380000, gpu: RTX_4070.gpuName },
  };
  const total = estimateLineup(['ltxv-2b', 'wan-2.1-1.3b'].map(lineupEntry), RTX_4070, { saved });
  assert.equal(total.low, 396);
  assert.equal(total.high, 396);
  assert.equal(total.basis, 'calibrated', '"Took … here" would describe a run that has not happened');
  assert.equal(formatVideoEstimate(total), 'About 7 min', 'not "About 7–7 min"');
});

test('on the Models screen a video model is sized the way the Lab sizes it', () => {
  // VRAM alone called Wan 2.2 14B too big for a 12 GB card, and the queue
  // refused a model the Lab could run.
  const wan = asHardwareFit(videoFit(lineupEntry('wan-2.2-14b').sizing, RTX_4070));
  assert.equal(wan.recommend, true);
  assert.equal(wan.label, 'Fits with offloading');
  const tooBig = asHardwareFit(videoFit(lineupEntry('minimax-h3').sizing, SMALL_PC));
  assert.equal(tooBig.recommend, false);
  assert.equal(tooBig.tone, 'out-of-league');
  const gated = asHardwareFit(videoFit(lineupEntry('ltx-2.5').sizing, RTX_4070));
  assert.equal(gated.recommend, true, 'the download says what a missing token needs, with the page to fix it');
});

// ── running a lineup ────────────────────────────────────────────────────────

/** ComfyUI, as far as the runner can tell: prompt ids in order, and a failure where asked. */
function fakeComfy({ failOn = new Set() } = {}) {
  let next = 0;
  const calls = { freed: 0, graphs: [], events: [] };
  return {
    calls,
    transport: {
      free: async () => { calls.freed += 1; calls.events.push('free'); },
      submit: async (graph) => {
        next += 1;
        calls.graphs.push(graph);
        calls.events.push(`submit:${next}`);
        return { promptId: `p${next}` };
      },
      history: async (promptId) => {
        const n = Number(promptId.slice(1));
        if (failOn.has(n)) {
          return { [promptId]: { status: { status_str: 'error', completed: false, messages: [['execution_error', { exception_message: 'CUDA out of memory' }]] } } };
        }
        return { [promptId]: {
          status: { status_str: 'success', completed: true },
          outputs: {
            jf: { images: [{ filename: `RigMatchFrame_${n}.png`, subfolder: '', type: 'output' }] },
            91: { images: [{ filename: `clip_${n}.mp4`, subfolder: 'rigmatch', type: 'output' }] },
          },
        } };
      },
      image: async () => 'data:image/png;base64,AAAA',
      interrupt: async () => {},
    },
  };
}

/** A clock that moves only when the runner waits, so elapsed times are exact. */
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

const three = ['wan-2.1-1.3b', 'wan-2.2-5b-official', 'wan-2.2-14b'].map(lineupEntry);

test('every pick renders the same prompt and seed, in the order given', async () => {
  const { transport, calls } = fakeComfy();
  const outcomes = await runVideoLineup({
    entries: three, transport, imagePrompt: PROMPT, seed: 777, unloadBetweenRuns: false, ...fakeClock(),
  });
  assert.deepEqual(outcomes.map((o) => o.entry.key), three.map((e) => e.key));
  for (const graph of calls.graphs) {
    const json = JSON.stringify(graph);
    assert.ok(json.includes(JSON.stringify(PROMPT.prompt)), 'the prompt reached every model');
    assert.ok(json.includes('777'), 'the seed reached every model');
  }
});

test('with consent, ComfyUI is unloaded before every model, not just the first', async () => {
  const { transport, calls } = fakeComfy();
  await runVideoLineup({ entries: three, transport, imagePrompt: PROMPT, seed: 1, unloadBetweenRuns: true, ...fakeClock() });
  assert.deepEqual(calls.events, ['free', 'submit:1', 'free', 'submit:2', 'free', 'submit:3']);
});

test('without consent, nothing the user loaded is unloaded', async () => {
  const { transport, calls } = fakeComfy();
  await runVideoLineup({ entries: three, transport, imagePrompt: PROMPT, seed: 1, unloadBetweenRuns: false, ...fakeClock() });
  assert.equal(calls.freed, 0);
});

test('one model failing records why, and the rest still run', async () => {
  const { transport } = fakeComfy({ failOn: new Set([2]) });
  const outcomes = await runVideoLineup({ entries: three, transport, imagePrompt: PROMPT, seed: 1, unloadBetweenRuns: false, ...fakeClock() });
  assert.equal(outcomes.length, 3);
  assert.equal(outcomes[0].result.error, undefined);
  assert.match(outcomes[1].result.error, /out of memory/i);
  assert.equal(outcomes[2].result.error, undefined, 'the third model ran after the second failed');
});

test('Stop ends the lineup with the model in flight', async () => {
  const controller = new AbortController();
  const { transport } = fakeComfy();
  const outcomes = await runVideoLineup({
    entries: three, transport, imagePrompt: PROMPT, seed: 1, unloadBetweenRuns: false, signal: controller.signal,
    onProgress: (p) => { if (p.phase === 'done') controller.abort(); },
    ...fakeClock(),
  });
  assert.equal(outcomes.length, 1);
});

test('the frames are judged once every model has rendered, never between renders', async () => {
  // The judge stays in Ollama's VRAM for ten minutes after it answers, and
  // ComfyUI's unload cannot reach it. Judged between renders, every model
  // after the first was timed with gigabytes of the card taken.
  const { transport, calls } = fakeComfy();
  const judge = async () => { calls.events.push('judge'); return 'Yes'; };
  await runVideoLineup({ entries: three, transport, judge, imagePrompt: PROMPT, seed: 1, unloadBetweenRuns: true, ...fakeClock() });
  const firstJudge = calls.events.indexOf('judge');
  assert.ok(firstJudge > calls.events.indexOf('submit:3'), calls.events.join(' '));
});

test('a judged frame is scored with its answer, and progress says so in place', async () => {
  const phases = [];
  const run = (judge, onProgress) => runVideoLineup({
    entries: [lineupEntry('wan-2.1-1.3b')],
    transport: fakeComfy().transport,
    judge,
    imagePrompt: PROMPT,
    seed: 1,
    unloadBetweenRuns: false,
    onProgress,
    ...fakeClock(),
  });
  const [unjudged] = await run(undefined);
  // "Yes" to everything is not all right: a prompt can ask whether something
  // is absent, so this judge earns less than full marks, and should.
  const [judged] = await run(async () => 'Yes', (p) => phases.push(p.phase));
  assert.equal(unjudged.result.judged, false);
  assert.equal(judged.result.judged, true);
  assert.ok(judged.result.adherence > 0);
  assert.ok(judged.result.score > unjudged.result.score, 'the answer counts toward the score');
  assert.deepEqual(phases, ['rendering', 'done', 'judging', 'judged']);
});

test('Stop skips the judging too', async () => {
  const controller = new AbortController();
  const { transport, calls } = fakeComfy();
  await runVideoLineup({
    entries: three,
    transport,
    judge: async () => { calls.events.push('judge'); return 'Yes'; },
    imagePrompt: PROMPT,
    seed: 1,
    unloadBetweenRuns: false,
    signal: controller.signal,
    onProgress: (p) => { if (p.phase === 'done') controller.abort(); },
    ...fakeClock(),
  });
  assert.ok(!calls.events.includes('judge'));
});

test('the leaderboard is fastest first, with every failure after the last finisher', () => {
  const ranked = rankLineup([
    { key: 'kandinsky-5', elapsedMs: 1278000 },
    { key: 'mochi-1', elapsedMs: 5000, error: 'CUDA out of memory' },
    { key: 'ltxv-2b', elapsedMs: 16500 },
    { key: 'ltx-2.3', elapsedMs: 65100 },
  ]);
  assert.deepEqual(ranked.map((item) => item.key), ['ltxv-2b', 'ltx-2.3', 'kandinsky-5', 'mochi-1']);
});

test('a result is read against the estimate its card showed', () => {
  const entry = lineupEntry('wan-2.1-1.3b');
  const run = { elapsedMs: 380000, realtimeCost: 75, score: 60, grade: 'C', judged: true };
  const expected = { low: 222, high: 592, basis: 'rough' };
  assert.equal(againstEstimate(lineupRecordEntry(entry, run, expected)), 'inside');
  assert.equal(againstEstimate(lineupRecordEntry(entry, { ...run, elapsedMs: 100000 }, expected)), 'faster');
  assert.equal(againstEstimate(lineupRecordEntry(entry, { ...run, elapsedMs: 900000 }, expected)), 'slower');
  assert.equal(againstEstimate(lineupRecordEntry(entry, { ...run, error: 'OOM' }, expected)), null, 'a failure has no time to compare');
  assert.equal(againstEstimate(lineupRecordEntry(entry, run, { low: 380, high: 380, basis: 'measured' })), null);
  assert.equal(lineupRecordEntry(entry, { ...run, error: 'OOM' }).error, 'OOM');
});

test('an LTX-Video 2B run in the lineup calibrates this machine, and a failed one does not', () => {
  const ok = [{ entry: lineupEntry('ltxv-2b'), result: { elapsedMs: 20000 } }];
  assert.deepEqual(calibrationFrom(ok, 'GPU', null), { gpu: 'GPU', seconds: 20 });
  const failedRun = [{ entry: lineupEntry('ltxv-2b'), result: { elapsedMs: 3000, error: 'boom' } }];
  assert.equal(calibrationFrom(failedRun, 'GPU', null), null);
});

test('a measured time is this machine\'s only if it was measured on this GPU', () => {
  const saved = { 'video:kandinsky-5': { elapsedMs: 1278000, gpu: 'NVIDIA GeForce RTX 4070' } };
  assert.equal(measuredSecondsFor(lineupEntry('kandinsky-5'), saved, 'NVIDIA GeForce RTX 4070'), 1278);
  assert.equal(measuredSecondsFor(lineupEntry('kandinsky-5'), saved, 'NVIDIA GeForce RTX 4090'), null);
  assert.equal(measuredSecondsFor(lineupEntry('ltxv-2b'), saved, 'NVIDIA GeForce RTX 4070'), null);
});
