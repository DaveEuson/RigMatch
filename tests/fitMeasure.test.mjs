// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeOllama } from './support/fakeOllama.mjs';

const {
  checkMeasureArgs, planTiers, estimateSeconds, describeDuration, measureTiers, measureModel, headlineOf,
  formatIntro, formatReport, formatModelReport, formatProgress, toMeasureJson, toModelJson, tierFor,
  checkCard, farBelowEstimate, formatModelIntro, scrubPaths, fitLine, isCloudModel,
} = await import('../cli/measure.ts');
const { runMeasureCommand, assertLocalOllama } = await import('../cli/measureCommand.ts');
const { fetchJson, installedOllamaModels } = await import('../cli/ollamaHttp.ts');
const { ollamaUrl } = await import('../cli/fitCheck.ts');
const { RIG_REFERENCES, RIG_TIERS, RIG_WORKLOAD } = await import('../src/lib/rigScore.ts');

/**
 * rigmatch-fit --measure: which tiers it runs, what it prints, and the guards
 * it shares with the app (busy card, never pulling, unloading what it loaded).
 * The runs go through the app's own runner (electron/rigScoreRunner.cjs);
 * here a stand-in plays Ollama, so no GPU or model is needed.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const card12 = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, unifiedMemory: false, ramGb: 32, platform: 'win32', arch: 'x64', source: 'detected' };
const ascii = /^[\x20-\x7e\n]*$/;
const tier = (id) => RIG_TIERS.find((entry) => entry.id === id);

/** A runner answer at given speeds, with the reference PC's stamp. */
const reply = (decode, prefill, extra = {}) => ({
  status: 'done',
  runs: [1, 2, 3].map(() => ({ promptEvalCount: 1486, promptEvalSeconds: 1486 / prefill, evalCount: 256, evalSeconds: 256 / decode, loadSeconds: 0.01 })),
  coldLoadSeconds: 2.4,
  gpuShare: 1,
  ollamaVersion: '0.35.1',
  modelDigest: extra.modelDigest,
  quantization: 'Q4_K_M',
  machine: { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, driverVersion: '610.88', appVersion: 'rigmatch-fit 0.1.0' },
});
/** Each tier at its own reference speeds, on the reference weights: 1,000 points. */
const atReference = (request) => {
  const reference = RIG_REFERENCES[request.tier];
  return reply(reference.decodeTps, reference.prefillTps, { modelDigest: reference.modelDigest });
};

test('--measure is a switch, with an optional model after it, and keeps away from the listing flags', () => {
  assert.equal(checkMeasureArgs({ measure: false }, []), null);
  assert.deepEqual(checkMeasureArgs({ measure: true, provider: 'ollama' }, []), { model: undefined });
  assert.deepEqual(checkMeasureArgs({ measure: true, provider: 'ollama' }, ['qwen3.5:9b']), { model: 'qwen3.5:9b' });
  assert.throws(() => checkMeasureArgs({ measure: false }, ['qwen3:8b']), /To measure a model's real speed: rigmatch-fit --measure qwen3:8b/);
  assert.throws(() => checkMeasureArgs({ measure: true }, ['a', 'b']), /one model at a time/);
  assert.throws(() => checkMeasureArgs({ measure: true, vram: '16' }, []), /--vram grades for another card/);
  assert.throws(() => checkMeasureArgs({ measure: true, installed: true }, []), /use one or the other/);
  assert.throws(() => checkMeasureArgs({ measure: true, provider: 'lmstudio' }, []), /only with --provider ollama/);
});

test('the tiers this card holds and Ollama has are run; a missing one gets its pull command; a too-big one is not run', () => {
  const plan = planTiers(card12, ['llama3.2:3b', 'qwen3:14b', 'gemma3:4b'], new Map([['llama3.2:3b', 158], ['qwen3:14b', 35]]));
  assert.deepEqual(plan.map((entry) => [entry.tier.id, entry.kind]), [['light', 'run'], ['standard', 'missing'], ['heavy', 'run'], ['extreme', 'too-big']]);
  assert.equal(plan[0].estimateTps, 158);
  assert.equal(plan[1].command, 'ollama pull qwen3:8b', 'printed, never run');
  assert.deepEqual([plan[3].needGb, plan[3].haveGb], [24, 12]);
  // Extreme runs on a 24 GB card or on shared memory, if it is installed.
  assert.equal(planTiers({ vramGb: 24, unifiedMemory: false }, ['qwen3:30b-a3b'])[3].kind, 'run');
  assert.equal(planTiers({ vramGb: 0, unifiedMemory: true }, ['qwen3:30b-a3b'])[3].kind, 'run');
  assert.deepEqual(planTiers({ vramGb: 2, unifiedMemory: false }, ['llama3.2:3b']).map((entry) => entry.kind), ['too-big', 'too-big', 'too-big', 'too-big']);
});

test('it says how long, in minutes, before it starts', () => {
  const three = estimateSeconds([{ sizeGb: 2, estimateTps: 158 }, { sizeGb: 5.2, estimateTps: 61 }, { sizeGb: 9.3, estimateTps: 35 }]);
  assert.ok(three > 60 && three < 240, `${three} s`);
  assert.equal(describeDuration(40), 'about a minute');
  assert.equal(describeDuration(three), `about ${Math.ceil(three / 60)} minutes`);
  assert.ok(estimateSeconds([{ sizeGb: 5, estimateTps: null }]) > estimateSeconds([{ sizeGb: 5, estimateTps: 60 }]), 'an unknown speed is taken as slow');
  const intro = formatIntro(card12, planTiers(card12, ['llama3.2:3b', 'qwen3:8b', 'qwen3:14b']));
  assert.match(intro, /This takes about \d+ minutes?|This takes about a minute/);
  assert.match(intro, /Ctrl\+C stops and unloads\./);
  assert.match(intro, /Extreme \(qwen3:30b-a3b\) is not run: needs 24 GB of graphics memory, and this PC has 12 GB\./);
});

test('measured tiers get points against the reference and a band, and the Standard tier is the headline', async () => {
  const plan = planTiers(card12, ['llama3.2:3b', 'qwen3:8b', 'qwen3:14b']);
  const asked = [];
  const report = await measureTiers(plan, async (request) => { asked.push(request); return atReference(request); });
  assert.deepEqual(asked.map((request) => request.model), ['llama3.2:3b', 'qwen3:8b', 'qwen3:14b'], 'smallest first, one at a time');
  assert.ok(asked.every((request) => request.prompts.length === RIG_WORKLOAD.warmupRuns + RIG_WORKLOAD.measuredRuns), "the app's workload");
  const measured = report.lines.filter((line) => line.status === 'measured');
  assert.deepEqual(measured.map((line) => line.points), measured.map(() => ({ kind: 'points', points: 1000, notes: [] })));
  assert.deepEqual(measured.map((line) => line.band.id), ['excellent', 'excellent', 'fast']);
  assert.equal(measured[0].measure.loadSeconds, 2.4, 'the cold load');
  assert.equal(report.lines[3].status, 'too-big');
  assert.equal(headlineOf(report).tier.id, 'standard');
});

test('a busy card or Ctrl+C ends the queue; the rest are not run, and none is zero', async () => {
  const plan = planTiers(card12, ['llama3.2:3b', 'qwen3:8b', 'qwen3:14b']);
  const busy = await measureTiers(plan, async () => ({ status: 'busy', loadedModels: ['mistral:7b'] }));
  assert.equal(busy.busy, true);
  assert.deepEqual(busy.lines.map((line) => line.status), ['busy', 'skipped', 'skipped', 'too-big']);
  assert.match(busy.lines[0].message, /mistral:7b loaded by another program/);
  const text = formatReport(busy);
  assert.match(text, /Not run: Ollama was busy/);
  assert.match(text, /left it alone/);
  assert.doesNotMatch(text, /\b0 tok\/s|\b0 points/);

  let calls = 0;
  const stopped = await measureTiers(plan, async (request) => { calls += 1; return calls === 2 ? { status: 'stopped' } : atReference(request); });
  assert.equal(stopped.stopped, true);
  assert.deepEqual(stopped.lines.map((line) => line.status), ['measured', 'stopped', 'skipped', 'too-big']);
  assert.match(formatReport(stopped), /Stopped with Ctrl\+C\. The model was unloaded/);
  // Standard never ran, so the first tier that did is the headline, as in the app.
  assert.equal(headlineOf(stopped).tier.id, 'light');
  assert.doesNotMatch(text, /\bwaits\b/, 'it does not start while another program has a model loaded; it does not wait');
});

test('in a terminal it is a show; piped it is plain, and both are ASCII', async () => {
  const plan = planTiers(card12, ['llama3.2:3b', 'qwen3:8b', 'qwen3:14b']);
  const report = await measureTiers(plan, async (request) => atReference(request));
  const show = `${formatIntro(card12, plan, { show: true, columns: 200 })}\n${formatReport(report, { show: true, columns: 200 })}`;
  assert.match(show, /^o-\*-o/);
  assert.match(show, /R I G M A T C H     speed test/);
  assert.match(show, /Tonight's speed dates: Light \(llama3\.2:3b\), Standard \(qwen3:8b\), Heavy \(qwen3:14b\)\./);
  assert.match(show, /\nSpeed dates\n/);
  assert.match(show, /Tonight's RigScore: 1,000 points on the Standard tier\. Excellent: long answers and code arrive in seconds\./);

  const plain = formatReport(report, { header: card12 });
  assert.match(plain, /^RigMatch speed test\nNVIDIA GeForce RTX 4070, 12 GB graphics memory, 32 GB system memory\n/);
  assert.doesNotMatch(plain, /o-\*-o|Tonight|Speed dates/);
  assert.match(plain, /RigScore: 1,000 points \(Standard tier, qwen3:8b\)\. Excellent: long answers and code arrive in seconds\./);
  assert.match(plain, /^Standard\s+qwen3:8b\s+66 tok\/s\s+3,775 tok\/s\s+1,000\s+Excellent$/m);
  assert.match(plain, /^Extreme\s+qwen3:30b-a3b\s+Not run: needs 24 GB of graphics memory, and this PC has 12 GB\.$/m);
  assert.match(plain, /1,000 points is the reference PC, an RTX 4070 12 GB on Ollama 0\.35\.1\./);
  for (const text of [show, plain]) assert.match(text, ascii);
  // Narrow terminal: no sign, wrapped prose.
  assert.doesNotMatch(formatIntro(card12, plan, { show: true, columns: 30 }), /o-\*-o/);
  assert.equal(formatProgress(tier('heavy'), { phase: 'run', run: 2, of: 3 }), 'Heavy, qwen3:14b: timed run 2 of 3');
});

test('--json has the measures, each stamp and points, and nothing about who ran it', async () => {
  const plan = planTiers(card12, ['llama3.2:3b', 'qwen3:8b']);
  const report = await measureTiers(plan, async (request) => atReference(request));
  const json = toMeasureJson(report, card12, '0.1.0');
  assert.deepEqual(Object.keys(json), ['tool', 'version', 'mode', 'hardware', 'workload', 'reference', 'tiers', 'headline', 'stopped', 'busy', 'contention']);
  assert.equal(json.mode, 'measure');
  assert.deepEqual(json.workload, { version: 1, numCtx: 4096, numPredict: 256, promptTokens: 1500, warmupRuns: 1, measuredRuns: 3 });
  assert.deepEqual(json.tiers.map((entry) => [entry.tier, entry.status]), [['light', 'measured'], ['standard', 'measured'], ['heavy', 'missing'], ['extreme', 'too-big']]);
  const standard = json.tiers[1];
  assert.deepEqual(Object.keys(standard), ['tier', 'model', 'status', 'writingTps', 'readingTps', 'loadSeconds', 'runs', 'gpuShare', 'points', 'pointsNote', 'band', 'estimatedTps', 'belowEstimate', 'stamp']);
  assert.equal(standard.points, 1000);
  assert.equal(standard.band, 'excellent');
  assert.deepEqual(Object.keys(standard.stamp).sort(), ['appVersion', 'driverVersion', 'gpu', 'model', 'modelDigest', 'numCtx', 'ollamaVersion', 'quantization', 'tier', 'vramGb', 'workloadVersion']);
  assert.deepEqual(json.tiers[2], { tier: 'heavy', model: 'qwen3:14b', status: 'missing', command: 'ollama pull qwen3:14b', sizeGb: 9.3 });
  assert.deepEqual(json.headline, { tier: 'standard', isHeadlineTier: true, points: 1000, pointsNote: null, writingTps: 66.2, band: 'excellent' });
  const text = JSON.stringify(json);
  assert.doesNotMatch(text, /hostname|127\.0\.0\.1|localhost|Wrenmouth|Reading 1\.|[A-Z]:\\|\/home\//, 'no host, address, prompt or path');
});

test('one model: its real speed beside the estimate, with points only when it is a tier model', async () => {
  const hardware = { vramGb: 12, unifiedMemory: false };
  const asked = [];
  const run = async (request) => { asked.push(request); return reply(41, 1850); };
  const other = await measureModel('gemma3:12b', { installed: ['gemma3:12b'], hardware, estimateTps: 40, run });
  assert.equal(asked[0].tier, 'model', 'the same workload, as no tier');
  assert.equal(asked[0].minVramGb, 0);
  assert.equal(other.status, 'measured');
  assert.equal(other.points, null);
  assert.equal(other.band.id, 'fast');
  assert.equal(other.stamp.tier, 'model');
  const text = formatModelReport(other, { header: card12 });
  assert.match(text, /^RigMatch speed test: gemma3:12b\n/);
  assert.match(text, /^gemma3:12b\s+41 tok\/s\s+~40 tok\/s\s+1,850 tok\/s\s+2\.4 s\s+-$/m);
  assert.match(text, /Points are for the four RigScore tier models/);
  assert.match(text, ascii);
  assert.equal(toModelJson(other, card12, '0.1.0').points, null);

  const standard = RIG_REFERENCES.standard;
  const tierModel = await measureModel('qwen3:8b', {
    installed: ['qwen3:8b'], hardware, estimateTps: 61, run: async () => reply(standard.decodeTps, standard.prefillTps, { modelDigest: standard.modelDigest }),
  });
  assert.equal(tierModel.tier.id, 'standard');
  assert.deepEqual(tierModel.points, { kind: 'points', points: 1000, notes: [] });
  assert.match(formatModelReport(tierModel), /is RigScore's Standard tier, so it has points/);

  const missing = await measureModel('phi4:14b', { installed: [], hardware, estimateTps: 30, run: async () => { throw new Error('never run'); } });
  assert.deepEqual([missing.status, missing.command], ['missing', 'ollama pull phi4:14b']);
  assert.equal(tierFor('qwen3:30b-a3b', hardware), null, 'too big for 12 GB: measured as a plain model, no points');
});

/** A command runner that answers nvidia-smi and the process list from fixed text. */
const commands = ({ smi = ['2300, 12282, 30'], processes = '"System Idle Process","0","Services","0","8 K"\r\n"explorer.exe","4242","Console","1","90,000 K"\r\n', platform = 'win32' } = {}) => {
  const asked = [];
  let sample = 0;
  const run = async (command, args) => {
    asked.push(command);
    if (command === 'nvidia-smi') {
      const output = smi[Math.min(sample, smi.length - 1)];
      sample += 1;
      return output === null ? { output: '', error: 'nvidia-smi was not found' } : { output, error: null };
    }
    if ((command === 'tasklist' && platform === 'win32') || (command === 'ps' && platform !== 'win32')) return { output: processes, error: null };
    throw new Error(`unexpected ${command} ${args.join(' ')}`);
  };
  return { run, asked };
};

test('before and after the runs it asks whether something else is using the card, as the app does', async () => {
  const idle = await checkCard(commands().run, { platform: 'win32', samples: 5, gapMs: 0 });
  assert.deepEqual([idle.level, idle.message], ['clear', ''], 'a desktop at 30% is not busy');

  // Another program on the card: the app's thresholds (45% busy, 70% heavy) and its words.
  const { run, asked } = commands({ smi: ['2400, 12282, 92'], processes: '"steamwebhelper.exe","77","Console","1","9 K"\r\n"explorer.exe","4","Console","1","1 K"\r\n' });
  const heavy = await checkCard(run, { platform: 'win32', samples: 5, gapMs: 0 });
  assert.equal(heavy.level, 'heavy');
  assert.match(heavy.message, /^Before starting: the graphics card is already 92% busy\. Steam is running\. Scores from this run will be noticeably lower than this computer can really do\./);
  assert.equal(asked.filter((command) => command === 'nvidia-smi').length, 5, 'a median of five readings, not one');
  assert.ok(asked.includes('tasklist'));
  const busy = await checkCard(commands({ smi: ['2400, 12282, 55'] }).run, { platform: 'win32', samples: 3, gapMs: 0 });
  assert.equal(busy.level, 'busy');
  assert.match(busy.message, /a little lower than this computer can really do/);

  // A median, so one spike does not make a busy card: three clear readings and two spikes.
  const spiky = await checkCard(commands({ smi: ['2300, 12282, 30', '2300, 12282, 95', '2300, 12282, 28', '2300, 12282, 97', '2300, 12282, 31'] }).run, { platform: 'win32', samples: 5, gapMs: 0 });
  assert.equal(spiky.level, 'clear');

  // No nvidia-smi (AMD, Apple, a Mac or Linux box without it): unknown, said nowhere, never "clear".
  const none = await checkCard(commands({ smi: [null], platform: 'linux' }).run, { platform: 'linux', samples: 2, gapMs: 0 });
  assert.deepEqual([none.level, none.message], ['unknown', '']);
  const linux = await checkCard(commands({ smi: ['2400, 12282, 80'], platform: 'linux', processes: 'blender\nbash\n' }).run, { platform: 'linux', samples: 2, gapMs: 0 });
  assert.equal(linux.level, 'heavy');
  assert.match(linux.message, /Blender is running/);
});

test('a speed far below the grade\'s estimate is said, with its reason, on the result', async () => {
  assert.equal(farBelowEstimate({ decodeTps: 2.4 }, 35), true);
  assert.equal(farBelowEstimate({ decodeTps: 17 }, 35), true, 'under half');
  assert.equal(farBelowEstimate({ decodeTps: 18 }, 35), false);
  // Measured against the estimates on the reference card: 0.9 to 1.5 times, never flagged.
  for (const [measured, estimate] of [[148, 158], [66, 61], [40, 35], [60, 49], [71, 49]]) assert.equal(farBelowEstimate({ decodeTps: measured }, estimate), false, `${measured} against ${estimate}`);
  assert.equal(farBelowEstimate({ decodeTps: 2 }, null), false, 'no estimate, nothing to compare with');
  assert.equal(farBelowEstimate({ decodeTps: 2 }, 0), false);

  // The contended run from the real PC: Heavy at 2.4 tok/s with its model wholly on the card.
  const plan = planTiers(card12, ['llama3.2:3b', 'qwen3:14b'], new Map([['llama3.2:3b', 158], ['qwen3:14b', 35]]));
  const report = await measureTiers(plan, async (request) => (request.tier === 'heavy' ? reply(2.4, 80) : atReference(request)));
  const heavy = report.lines.find((line) => line.tier.id === 'heavy');
  assert.equal(heavy.estimateTps, 35);
  const text = formatReport(report, { header: card12 });
  assert.match(text, /^Heavy: writing 2\.4 tok\/s is far below the ~35 tok\/s estimated for this card\. Something else may have been using the graphics card, or the model did not sit wholly on it/m);
  assert.doesNotMatch(text.split('\n').filter((line) => /^Light:/.test(line)).join(' '), /far below/, 'the tier at its estimate is not flagged');
  const json = toMeasureJson(report, card12, '0.1.0');
  assert.deepEqual(json.tiers.filter((entry) => entry.status === 'measured').map((entry) => [entry.tier, entry.estimatedTps, entry.belowEstimate]),
    [['light', 158, false], ['heavy', 35, true]]);

  const model = await measureModel('qwen3:14b', { installed: ['qwen3:14b'], hardware: card12, estimateTps: 35, run: async () => reply(6.8, 2054) });
  assert.match(formatModelReport(model), /writing 6\.8 tok\/s is far below the ~35 tok\/s estimated/);
  assert.equal(toModelJson(model, card12, '0.1.0').belowEstimate, true);
});

test('a busy card is said before the runs and after, in the text and in the JSON', async () => {
  const heavy = { level: 'heavy', reasons: ['the graphics card is already 92% busy'], apps: ['Steam'], message: 'Before starting: the graphics card is already 92% busy. Steam is running. Scores from this run will be noticeably lower than this computer can really do. Closing other graphics-heavy programs gives the most accurate result.' };
  const clear = { level: 'clear', reasons: [], apps: [], message: '' };
  const plan = planTiers(card12, ['llama3.2:3b', 'qwen3:8b']);

  const intro = formatIntro(card12, plan, { before: heavy });
  assert.match(intro, /Before starting: the graphics card is already 92% busy\. Steam is running\./);
  assert.doesNotMatch(formatIntro(card12, plan, { before: clear }), /Before starting/);
  assert.doesNotMatch(formatIntro(card12, plan, {}), /Before starting/);
  assert.doesNotMatch(formatIntro(card12, planTiers(card12, []), { before: heavy }), /Before starting/, 'nothing runs, so nothing to warn about');
  assert.match(formatModelIntro('qwen3:8b', card12, { estimateTps: 61, sizeGb: 4.9 }, { before: heavy }), /Before starting: the graphics card is already 92% busy/);

  const report = { ...(await measureTiers(plan, async (request) => atReference(request))), card: { before: heavy, after: heavy } };
  assert.match(formatReport(report), /After the runs, the graphics card is already 92% busy\. Steam is running\. Something else was probably using the graphics card during them, so these numbers are lower than this PC can do\./);
  const clean = { ...report, card: { before: clear, after: clear } };
  assert.doesNotMatch(formatReport(clean), /After the runs/);
  // Steam open, with the card itself quiet: said softly before the runs, never "busy", and nothing after.
  const quiet = await checkCard(commands({ smi: ['2300, 12282, 3'], processes: '"steamwebhelper.exe","77","Console","1","9 K"\r\n' }).run, { platform: 'win32', samples: 3, gapMs: 0 });
  assert.deepEqual([quiet.level, quiet.reasons, quiet.apps], ['clear', [], ['Steam']], 'a program being open is not the card being busy');
  assert.equal(quiet.message, 'Steam is open, and can use the graphics card, but the card itself reads quiet, so this should not matter. Closing it gives the most accurate result.');
  assert.doesNotMatch(quiet.message, /looks busy|Before starting/);
  assert.doesNotMatch(formatReport({ ...report, card: { before: quiet, after: quiet } }), /After the runs/);
  assert.match(formatIntro(card12, plan, { before: quiet }), /Steam is open, and can use the graphics card, but the card itself reads quiet/);
  assert.deepEqual(toMeasureJson({ ...report, card: { before: quiet, after: quiet } }, card12, '0.1.0').contention.before, { level: 'clear', reasons: [], apps: ['Steam'] });
  assert.deepEqual(toMeasureJson(report, card12, '0.1.0').contention, {
    before: { level: 'heavy', reasons: ['the graphics card is already 92% busy'], apps: ['Steam'] },
    after: { level: 'heavy', reasons: ['the graphics card is already 92% busy'], apps: ['Steam'] },
  });
  assert.deepEqual(toMeasureJson(await measureTiers(plan, async (request) => atReference(request)), card12, '0.1.0').contention, { before: null, after: null });

  const one = await measureModel('gemma3:12b', { installed: ['gemma3:12b'], hardware: { vramGb: 12, unifiedMemory: false }, estimateTps: 40, run: async () => reply(41, 1850) });
  assert.match(formatModelReport({ ...one, card: { before: heavy, after: heavy } }), /After the runs, the graphics card is already 92% busy/);
  assert.equal(toModelJson({ ...one, card: { before: heavy, after: clear } }, card12, '0.1.0').contention.before.level, 'heavy');
});

test('the command shares the app\'s runner and unload and think check, not copies of them', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
  const measure = read('../cli/measure.ts');
  const main = read('../electron/main.cjs');
  assert.match(measure, /import runner from '\.\.\/electron\/rigScoreRunner\.cjs';/);
  assert.match(main, /const \{ runRigTier, unloadOllamaModel \} = require\('\.\/rigScoreRunner\.cjs'\);/);
  assert.match(main, /if \(await unloadOllamaModel\(\{ fetchJson, baseUrl, model, settleMs: UNLOAD_SETTLE_TIMEOUT_MS \}\)\) return;/);
  assert.doesNotMatch(main, /^function isUnsupportedThinkError/m, 'the think check lives in ollamaRequest.cjs now');
});

// ---- The command, in process: the hardware set explicitly, a stand-in Ollama, a fake Ctrl+C ----------------

const card6 = { ...card12, gpu: 'NVIDIA GeForce RTX 3060 6GB', vramGb: 6 };
const noCard = { gpu: 'No graphics card found', vramGb: 0, unifiedMemory: false, ramGb: 16, platform: 'linux', arch: 'x64', source: 'detected' };

/** A terminal, a pipe, or a test's capture of either. */
const capture = ({ isTTY = false, columns } = {}) => ({ text: '', isTTY, columns, write(text) { this.text += text; } });

/**
 * Start the real command (cli/measureCommand.ts) with the machine replaced:
 * the hardware you give, a fake nvidia-smi, the stand-in as Ollama, and an
 * emitter in place of the process for Ctrl+C. So the same run is asserted the
 * same way on a laptop, a GPU-less CI runner and this PC.
 */
function startCommand(args, ollama, { hardware = card12, tty = false, columns, run, env = {} } = {}) {
  const out = capture({ isTTY: tty, columns });
  const err = capture({ isTTY: tty, columns });
  const interrupt = new EventEmitter();
  let left = null;
  const finished = runMeasureCommand(args, {
    baseUrl: ollama.url,
    out,
    err,
    platform: 'win32',
    version: '0.1.0',
    detectHardware: async () => hardware,
    driverVersion: async () => '610.88',
    run: (run ?? commands()).run,
    fetchJson,
    installedModels: installedOllamaModels,
    interrupt,
    leave: (code) => { left = code; },
    unloadSettleMs: 200,
    freeWaitMs: 1500,
    cardSamples: 2,
    cardGapMs: 0,
    ...env,
  }).then((code) => ({ code, error: null }), (error) => ({ code: undefined, error }))
    .then((done) => ({ ...done, out: out.text, err: err.text, left: () => left }));
  return { interrupt, finished };
}
const runCommand = (args, ollama, options) => startCommand(args, ollama, options).finished;

const TIERS_INSTALLED = ['llama3.2:3b', 'qwen3:8b', 'qwen3:14b'];

test('a full --measure --json run on a 12 GB card: three tiers measured, what it loaded unloaded, nothing pulled, the same everywhere', async () => {
  const ollama = await fakeOllama({ installed: TIERS_INSTALLED });
  try {
    const run = await runCommand({ model: undefined, json: true }, ollama);
    assert.equal(run.error, null);
    assert.equal(run.code, 0, run.err);
    const json = JSON.parse(run.out);
    assert.deepEqual(json.tiers.map((entry) => [entry.tier, entry.status]), [['light', 'measured'], ['standard', 'measured'], ['heavy', 'measured'], ['extreme', 'too-big']]);
    assert.equal(json.tiers[1].writingTps, 66.2, "the reference's own speed");
    assert.equal(json.tiers[1].points, 1000, 'on the reference weights, at the reference speed');
    assert.equal(json.tiers[1].stamp.modelDigest, RIG_REFERENCES.standard.modelDigest);
    assert.equal(json.tiers[1].stamp.driverVersion, '610.88');
    assert.equal(json.headline.tier, 'standard');
    // What it loaded, it unloaded, tier by tier, and the card ends empty.
    assert.deepEqual([...new Set(ollama.loads())], TIERS_INSTALLED);
    assert.deepEqual(ollama.unloads(), TIERS_INSTALLED, 'each unloaded once, after its runs');
    assert.deepEqual(ollama.state.loaded, []);
    assert.equal(ollama.calls.some((call) => call.path === '/api/pull'), false, 'never downloads');
    const generates = ollama.calls.filter((call) => call.path === '/api/generate' && call.body.keep_alive !== 0);
    assert.equal(generates.length, 12, 'a warm-up and three timed runs for each of three tiers');
    assert.ok(generates.every((call) => call.body.think === false && call.body.options.num_ctx === 4096 && call.body.options.num_predict === 256 && call.body.options.seed === 1));
    assert.ok(ollama.calls.every((call) => call.authorization === null));
    assert.match(run.err, /^RigMatch speed test\n/, 'the intro goes to stderr, so stdout is only JSON');
  } finally {
    await ollama.close();
  }
});

test('in a terminal the command is the show; piped it is plain', async () => {
  const ollama = await fakeOllama({ installed: TIERS_INSTALLED });
  try {
    const show = await runCommand({ model: undefined, json: false }, ollama, { tty: true, columns: 120 });
    assert.equal(show.code, 0, show.err);
    assert.match(show.out, /^o-\*-o-\*-o/);
    assert.match(show.out, /R I G M A T C H     speed test/);
    assert.match(show.out, /Tonight's speed dates: Light \(llama3\.2:3b\), Standard \(qwen3:8b\), Heavy \(qwen3:14b\)\./);
    assert.match(show.out, /\nSpeed dates\n/);
    assert.match(show.out, /Tonight's RigScore: 1,000 points on the Standard tier\./);
    assert.equal(show.err, '', 'a terminal gets everything on stdout');
    assert.match(show.out.replace(/\r/g, ''), ascii);

    const plain = await runCommand({ model: undefined, json: false }, ollama);
    assert.equal(plain.code, 0, plain.err);
    assert.match(plain.out, /^RigMatch speed test\nNVIDIA GeForce RTX 4070, 12 GB graphics memory, 32 GB system memory\n/);
    assert.doesNotMatch(plain.out, /o-\*-o|Tonight|Speed dates/);
    assert.match(plain.out, /^RigScore: 1,000 points \(Standard tier, qwen3:8b\)\./m);
    assert.match(plain.err, /Light, llama3\.2:3b: timed run 2 of 3/, 'progress goes to stderr, one line each');
    assert.doesNotMatch(plain.err, /\r/);
    assert.match(plain.out, ascii);
  } finally {
    await ollama.close();
  }
});

test('with no graphics card nothing runs: every tier is "not run", and the command says so and exits 1', async () => {
  const ollama = await fakeOllama({ installed: TIERS_INSTALLED });
  try {
    const run = await runCommand({ model: undefined, json: false }, ollama, { hardware: noCard });
    assert.equal(run.code, 1);
    assert.match(run.err, /Nothing to measure: no RigScore tier model is installed that this card can hold\./);
    assert.match(run.out, /^Light\s+llama3\.2:3b\s+Not run: needs 4 GB of graphics memory, and this PC has 0 GB\.$/m);
    assert.match(run.out, /No RigScore: no tier was measured\./);
    assert.equal(ollama.calls.some((call) => call.path === '/api/generate'), false, 'nothing loaded, so nothing to unload');
    const json = JSON.parse((await runCommand({ model: undefined, json: true }, ollama, { hardware: noCard })).out);
    assert.deepEqual(json.tiers.map((entry) => entry.status), ['too-big', 'too-big', 'too-big', 'too-big']);
    assert.equal(json.headline, null);
  } finally {
    await ollama.close();
  }
});

test('on a 6 GB card the headline is the biggest tier that ran, as in the app, not "no RigScore yet"', async () => {
  const ollama = await fakeOllama({ installed: TIERS_INSTALLED });
  try {
    const run = await runCommand({ model: undefined, json: true }, ollama, { hardware: card6 });
    assert.equal(run.code, 0, run.err);
    const json = JSON.parse(run.out);
    assert.deepEqual(json.tiers.map((entry) => entry.status), ['measured', 'too-big', 'too-big', 'too-big']);
    assert.deepEqual([json.headline.tier, json.headline.isHeadlineTier, json.headline.band], ['light', false, null], 'no speed band for a tier that is not the headline');
    assert.equal(ollama.loads().includes('qwen3:8b'), false, 'Standard is installed and too big: not run');

    const text = await runCommand({ model: undefined, json: false }, ollama, { hardware: card6 });
    assert.match(text.out, /^RigScore: 1,000 points \(Light tier, llama3\.2:3b\)\.$/m);
    assert.match(text.out, /The usual headline is the Standard tier, which this card cannot hold, so this is the biggest tier it ran\./);
    assert.doesNotMatch(text.out, /No RigScore yet/);

    // And with Standard simply not installed, the pull command is offered.
    const missing = await fakeOllama({ installed: ['llama3.2:3b'] });
    try {
      const run12 = await runCommand({ model: undefined, json: false }, missing);
      assert.match(run12.out, /The usual headline is the Standard tier: get qwen3:8b \(ollama pull qwen3:8b\) to score it\./);
    } finally {
      await missing.close();
    }
  } finally {
    await ollama.close();
  }
});

test("a slow unload is not blamed on another program: the next tier waits for this run's own model to leave", async () => {
  // Ollama frees a big model in a second or so; the unload here waits only 100 ms.
  const slow = await fakeOllama({ installed: TIERS_INSTALLED, releaseMs: 800 });
  try {
    const run = await runCommand({ model: undefined, json: true }, slow, { env: { unloadSettleMs: 100, freeWaitMs: 4000 } });
    assert.equal(run.code, 0, run.err);
    const json = JSON.parse(run.out);
    assert.deepEqual(json.tiers.map((entry) => entry.status), ['measured', 'measured', 'measured', 'too-big'], 'no tier was called "busy"');
    assert.equal(json.busy, false);
    assert.doesNotMatch(run.err + run.out, /loaded by another program/);
  } finally {
    await slow.close();
  }

  // A model that never leaves is still this run's, and it says so rather than blaming someone else.
  const stuck = await fakeOllama({ installed: TIERS_INSTALLED, releaseMs: 60_000 });
  try {
    const run = await runCommand({ model: undefined, json: false }, stuck, { env: { unloadSettleMs: 50, freeWaitMs: 300 } });
    assert.match(run.out, /Ollama has not finished releasing llama3\.2:3b, which this run had just unloaded\./);
    assert.doesNotMatch(run.out, /another program/);
    assert.equal(run.out.includes('Another program had a model loaded'), false);
  } finally {
    await stuck.close();
  }
});

test("a model another program loaded is left alone, even when it is the tier's own", async () => {
  const ollama = await fakeOllama({ installed: TIERS_INSTALLED, loaded: ['qwen3:8b'] });
  try {
    const run = await runCommand({ model: undefined, json: false }, ollama);
    assert.match(run.error.message, /^Ollama has qwen3:8b loaded by another program\. It shares the graphics card and would slow the test, so rigmatch-fit leaves it alone and does not start\./);
    assert.doesNotMatch(run.error.message, /\bwaits\b/);
    assert.equal(ollama.calls.some((call) => call.path === '/api/generate'), false, 'nothing run, nothing unloaded');
    assert.deepEqual(ollama.state.loaded.map((entry) => entry.name), ['qwen3:8b']);
  } finally {
    await ollama.close();
  }
});

test('an error from Ollama that carries a path never reaches the output or the JSON', async () => {
  const leaks = [
    'unable to load model: C:\\Users\\Alice Smith\\.ollama\\models\\blobs\\sha256-0123456789abcdef',
    'unable to load model: /home/alice/.ollama/models/blobs/sha256-0123456789abcdef',
    'unable to load model: /Users/Alice Smith/.ollama/models/blobs/sha256-0123456789abcdef',
    'open \\\\fileserver\\home\\alice\\models\\blob: access is denied',
    'could not read ~/.ollama/models/manifests/registry.ollama.ai/library/gemma3',
  ];
  for (const message of leaks) {
    const ollama = await fakeOllama({ installed: ['gemma3:12b', ...TIERS_INSTALLED], generateError: message });
    try {
      for (const args of [{ model: 'gemma3:12b', json: true }, { model: undefined, json: true }]) {
        const run = await runCommand(args, ollama);
        const body = JSON.parse(run.out);
        const everything = `${run.out}\n${run.err}`;
        assert.doesNotMatch(everything, /alice|smith|fileserver|\.ollama|\\Users\\|\/home\/|\/Users\//i, `${message} in ${args.model ?? 'the tiers'}`);
        assert.equal(run.code, 1);
        const failed = args.model ? [body] : body.tiers.filter((entry) => entry.status === 'failed');
        assert.ok(failed.length > 0);
        assert.ok(failed.every((entry) => entry.message === 'The test did not finish.'), 'the JSON says it did not finish, and no more');
      }
      // The terminal keeps what it can of the error, with the path taken out.
      const text = await runCommand({ model: 'gemma3:12b', json: false }, ollama);
      assert.match(text.out, /The test did not finish: 500 Internal Server Error from Ollama: /);
      assert.match(text.out, /<path>/);
      assert.doesNotMatch(`${text.out}\n${text.err}`, /alice|smith|fileserver|\.ollama|\\Users\\|\/home\/|\/Users\//i);
    } finally {
      await ollama.close();
    }
  }
});

test('scrubPaths takes a path out and leaves ordinary text, addresses and model names alone', () => {
  assert.equal(scrubPaths('unable to load model: C:\\Users\\Alice Smith\\.ollama\\models\\blobs\\sha256-ab'), 'unable to load model: <path>');
  assert.equal(scrubPaths('open D:/ollama-models/blobs/sha256-ab: no such file'), 'open <path>');
  assert.equal(scrubPaths('open \\\\server\\share\\models\\blob: denied'), 'open <path>');
  assert.equal(scrubPaths('at /home/alice/.ollama/models/blobs/sha256-ab'), 'at <path>');
  assert.equal(scrubPaths('"/Users/Alice Smith/.ollama/models"'), '"<path>"');
  assert.equal(scrubPaths('reading ~/.ollama/models'), 'reading <path>');
  for (const same of [
    '500 Internal Server Error from Ollama: model requires more system memory (21.3 GiB) than is available (15.2 GiB)',
    'connect ECONNREFUSED 127.0.0.1:11434',
    'http://localhost:11434/api/generate failed',
    'hf.co/someone/custom-7b-GGUF:Q4_K_M',
    'and/or 1/2 tok/s',
    'Ollama did not finish within 10 minutes.',
  ]) assert.equal(scrubPaths(same), same);
});

test('a cloud model is refused: it runs on Ollama\'s servers, not on this card, and the prompts would leave', async () => {
  const ollama = await fakeOllama({ installed: ['llama3.2:3b', 'gemma3:12b'], remote: ['gpt-oss:120b-cloud', 'glm-remote'] });
  try {
    // Listed as installed with a remote host, or just named like a cloud tag: both refused, and nothing is asked of Ollama.
    for (const model of ['gpt-oss:120b-cloud', 'glm-remote', 'kimi-k2:1t-cloud']) {
      const run = await runCommand({ model, json: false }, ollama);
      assert.match(run.error.message, new RegExp(`^${model.replace(/[.:]/g, '\\$&')} runs on Ollama's servers, not on this computer`), model);
      assert.match(run.error.message, /the prompts would leave it\. rigmatch-fit --measure runs local models only\./);
    }
    assert.equal(ollama.calls.some((call) => call.path === '/api/generate'), false);
    // A cloud tag is refused before Ollama is asked anything: with none listening, it is the cloud message and not "did not answer".
    const nobody = await runCommand({ model: 'kimi-k2:1t-cloud', json: false }, { url: 'http://127.0.0.1:9' });
    assert.match(nobody.error.message, /^kimi-k2:1t-cloud runs on Ollama's servers/);
    assert.equal(isCloudModel({ name: 'gemma3:12b' }), false);
    assert.equal(isCloudModel({ name: 'anything', remote: true }), true);
    assert.equal(isCloudModel({ name: 'qwen3-coder:480b-cloud' }), true);
    assert.equal(isCloudModel({ name: 'cloudy:7b' }), false, 'only a cloud tag, not a name that contains the word');
  } finally {
    await ollama.close();
  }

  // In the tier queue: a tier tag that Ollama lists as a cloud model is not run, and the rest are.
  const queue = await fakeOllama({ installed: ['llama3.2:3b', 'qwen3:14b'], remote: ['qwen3:8b'] });
  try {
    const run = await runCommand({ model: undefined, json: true }, queue);
    assert.equal(run.code, 0, run.err);
    const json = JSON.parse(run.out);
    assert.deepEqual(json.tiers.map((entry) => entry.status), ['measured', 'cloud', 'measured', 'too-big']);
    assert.match(json.tiers[1].message, /^qwen3:8b runs on Ollama's servers, not on this computer/);
    assert.equal(queue.loads().includes('qwen3:8b'), false, 'never sent a prompt to it');
    assert.equal(json.headline.tier, 'light', 'Standard did not run');
    const text = await runCommand({ model: undefined, json: false }, queue);
    assert.match(text.err, /Standard \(qwen3:8b\) is not run: qwen3:8b runs on Ollama's servers/);
  } finally {
    await queue.close();
  }
});

test('one model: a plain run says what it is once, progress fits the terminal, and a stop says "model"', async () => {
  assert.equal(formatProgress({ label: 'qwen3:8b', model: 'qwen3:8b' }, { phase: 'loading' }), 'qwen3:8b: loading, and a warm-up run (not timed)');
  assert.equal(formatProgress(tier('light'), { phase: 'run', run: 1, of: 3 }), 'Light, llama3.2:3b: timed run 1 of 3');
  assert.equal(fitLine('short', 20), 'short'.padEnd(19));
  assert.equal(fitLine('a long model name that will not fit on one line', 30), `${'a long model name that wil'.slice(0, 26)}...`.padEnd(29));
  assert.equal(fitLine('x'.repeat(200), 80).length, 79, 'one short of the width, so the cursor never wraps');

  const ollama = await fakeOllama({ installed: ['hf.co/someone/a-very-long-model-name-7b-instruct-GGUF:Q4_K_M'] });
  try {
    const name = 'hf.co/someone/a-very-long-model-name-7b-instruct-GGUF:Q4_K_M';
    const run = await runCommand({ model: name, json: false }, ollama, { tty: true, columns: 40 });
    assert.equal(run.code, 0, run.err);
    // Every in-place frame is cut to the width, so the carriage return redraws one row.
    const redraws = run.out.split('\r').slice(1).map((piece) => piece.split('\n')[0]);
    assert.ok(redraws.length >= 3);
    assert.ok(redraws.every((piece) => piece.length <= 39), redraws.find((piece) => piece.length > 39));
    assert.doesNotMatch(run.out, /qwen3:8b, qwen3:8b/);
  } finally {
    await ollama.close();
  }
});

test('Ctrl+C mid-run stops the run, unloads the model and exits 130; a second Ctrl+C leaves at once', async () => {
  const ollama = await fakeOllama({ installed: ['gemma3:12b'], stall: true });
  try {
    const { interrupt, finished } = startCommand({ model: 'gemma3:12b', json: false }, ollama);
    assert.equal(await ollama.waitForStall(), true, 'the run is under way, held by the stand-in');
    interrupt.emit('SIGINT');
    const run = await finished;
    assert.equal(run.error, null);
    assert.equal(run.code, 130);
    assert.match(run.err, /Stopping: unloading the model\.\.\./);
    assert.match(run.out, /Stopped\. Nothing was saved for this model\./, 'a model, not "this tier"');
    assert.deepEqual(ollama.unloads(), ['gemma3:12b'], 'the unload request went out');
    assert.deepEqual(ollama.state.loaded, [], 'and the card is empty');
    assert.equal(run.left(), null, 'one press does not leave');
    assert.equal(interrupt.listenerCount('SIGINT'), 0, 'and the handler is gone');
  } finally {
    await ollama.close();
  }

  const again = await fakeOllama({ installed: ['gemma3:12b'], stall: true });
  try {
    const { interrupt, finished } = startCommand({ model: 'gemma3:12b', json: false }, again);
    await again.waitForStall();
    interrupt.emit('SIGINT');
    interrupt.emit('SIGINT');
    assert.equal((await finished).left(), 130, 'the second press leaves');
  } finally {
    await again.close();
  }

  // The tier queue: stopping in the second tier keeps the first, runs nothing after, and unloads.
  const queue = await fakeOllama({ installed: TIERS_INSTALLED, stallModels: ['qwen3:8b'] });
  try {
    const started = startCommand({ model: undefined, json: true }, queue, { env: { unloadSettleMs: 100 } });
    assert.equal(await queue.waitForStall(), true, 'the second tier is under way, held by the stand-in');
    started.interrupt.emit('SIGINT');
    const run = await started.finished;
    assert.equal(run.code, 130);
    const json = JSON.parse(run.out);
    assert.deepEqual(json.tiers.map((entry) => entry.status), ['measured', 'stopped', 'skipped', 'too-big'], 'the first tier is kept, the second stopped, the rest not started');
    assert.equal(json.stopped, true);
    assert.equal(queue.loads().includes('qwen3:14b'), false, 'the tier after the stop never started');
    assert.deepEqual(queue.unloads(), ['llama3.2:3b', 'qwen3:8b']);
    assert.deepEqual(queue.state.loaded, []);
  } finally {
    await queue.close();
  }
});

// ---- OLLAMA_HOST ---------------------------------------------------------------

test('only this computer\'s Ollama is used, however OLLAMA_HOST is spelled', async () => {
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
  // Another host in disguise: refused.
  for (const raw of ['localhost.evil.com', '127.0.0.1.evil.com', 'localhost@evil.com', '127.0.0.1@evil.com', '[::ffff:127.0.0.1]', 'localhost.', '192.168.1.50', 'https://ollama.com', 'evil.com:11434']) {
    assert.throws(() => assertLocalOllama(ollamaUrl(raw)), /--measure runs on this computer's Ollama only/, raw);
  }
  // Spellings of this computer (the URL parser reads them as the loopback address): used, and only as that.
  for (const raw of ['127.1', '0x7f000001', '2130706433', '0177.0.0.1', '0.0.0.0', 'LOCALHOST', '[::1]:11434', 'evil@localhost', '127.0.0.1#@evil.com']) {
    const url = ollamaUrl(raw);
    assert.doesNotThrow(() => assertLocalOllama(url), raw);
    assert.ok(loopback.has(new URL(url).hostname), `${raw} is ${new URL(url).hostname}`);
  }

  // A user name in the address is not sent as a password.
  const ollama = await fakeOllama({ installed: ['gemma3:12b'] });
  try {
    const answer = await fetchJson(`http://evil:secret@127.0.0.1:${ollama.port}/api/tags`, {}, 2000);
    assert.equal(answer.models.length, 1);
    assert.equal(ollama.calls[0].authorization, null);
  } finally {
    await ollama.close();
  }
});

// ---- The requests --------------------------------------------------------------

test('a request is held for the time it was given, not cut off at five minutes by fetch', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../cli/ollamaHttp.ts', import.meta.url), 'utf-8');
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /\bfetch\(/, "node's fetch gives up on a slow answer after 300 s, whatever it was told");
  assert.match(source, /http\.request|\.request\(/);

  const slow = await fakeOllama({ installed: ['gemma3:12b'], delayMs: 400 });
  try {
    // Longer than the answer takes: it comes.
    const answer = await fetchJson(`${slow.url}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'gemma3:12b', prompt: 'x' }) }, 3000);
    assert.equal(answer.eval_count, 256);
    // Shorter: a timeout that says how long it waited, not "fetch failed".
    await assert.rejects(
      fetchJson(`${slow.url}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'gemma3:12b', prompt: 'x' }) }, 100),
      (error) => error.name === 'TimeoutError' && error.message === 'Ollama did not finish within 100 ms.',
    );
    // Stopped: says so.
    const controller = new AbortController();
    const stopped = fetchJson(`${slow.url}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'gemma3:12b', prompt: 'x' }), signal: controller.signal }, 3000);
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(stopped, (error) => error.name === 'AbortError' && error.message === 'Request stopped');
    await assert.rejects(fetchJson(`${slow.url}/api/tags`, { signal: AbortSignal.abort() }, 1000), /Request stopped/);
  } finally {
    await slow.close();
  }

  const failing = await fakeOllama({ installed: ['gemma3:12b'], generateError: 'model requires more system memory (21.3 GiB) than is available (15.2 GiB)' });
  try {
    await assert.rejects(
      fetchJson(`${failing.url}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'gemma3:12b', prompt: 'x' }) }, 2000),
      /^Error: 500 Internal Server Error from Ollama: model requires more system memory/,
    );
  } finally {
    await failing.close();
  }
  // Nothing listening: a plain refusal, quickly.
  await assert.rejects(fetchJson('http://127.0.0.1:9/api/tags', {}, 2000), /ECONNREFUSED|connect/i);
  assert.equal(await installedOllamaModels('http://127.0.0.1:9'), null);
});

// ---- The real command, as a child process, against a stand-in Ollama -----------------

const runCli = (args, env) => new Promise((resolve) => {
  execFile(process.execPath, [join(root, 'cli', 'rigmatch-fit.ts'), ...args], { cwd: root, env: { ...process.env, ...env }, timeout: 60_000 }, (error, stdout, stderr) => {
    resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
  });
});

test('the command refuses while another program has a model loaded, and never unloads it', async () => {
  const ollama = await fakeOllama({ installed: ['llama3.2:3b'], loaded: ['mistral:7b'] });
  try {
    for (const args of [['--measure'], ['--measure', '--json'], ['--measure', 'llama3.2:3b']]) {
      const result = await runCli(args, { OLLAMA_HOST: ollama.host });
      assert.equal(result.code, 1, args.join(' '));
      assert.match(result.stderr, /Ollama has mistral:7b loaded by another program\. It shares the graphics card and would slow the test, so rigmatch-fit leaves it alone and does not start\./);
      assert.equal(result.stdout, '');
    }
    assert.equal(ollama.calls.filter((call) => call.path === '/api/generate').length, 0, 'nothing run, nothing unloaded');
    assert.deepEqual(ollama.state.loaded.map((entry) => entry.name), ['mistral:7b']);
  } finally {
    await ollama.close();
  }
});

test('the command measures only on this computer, and checks its flags first', async () => {
  const remote = await runCli(['--measure'], { OLLAMA_HOST: 'http://192.168.1.50:11434' });
  assert.equal(remote.code, 1);
  assert.match(remote.stderr, /--measure runs on this computer's Ollama only/);
  const clash = await runCli(['--measure', '--vram', '12'], { OLLAMA_HOST: '127.0.0.1:9' });
  assert.equal(clash.code, 1);
  assert.match(clash.stderr, /--vram grades for another card/);
  const down = await runCli(['--measure'], { OLLAMA_HOST: '127.0.0.1:9' });
  assert.equal(down.code, 1);
  assert.match(down.stderr, /Ollama did not answer at http:\/\/127\.0\.0\.1:9\. --measure runs the models on it/);
  const help = await runCli(['--help'], {});
  assert.match(help.stdout, /--measure <model>\s+Measure one installed model's real speed with the same test/);
  assert.match(help.stdout, /will not run while another program has a model loaded/);
});

test('--measure <model> end to end, on any machine: a plain model is timed beside its estimate, with no points, and unloaded', async () => {
  const ollama = await fakeOllama({ installed: ['gemma3:12b'] });
  try {
    const text = await runCli(['--measure', 'gemma3:12b'], { OLLAMA_HOST: ollama.host });
    assert.equal(text.code, 0, text.stderr);
    assert.match(text.stdout, /^RigMatch speed test: gemma3:12b\n/);
    assert.match(text.stdout, /^Model\s+Writing\s+Estimated\s+Reading\s+Loads in\s+Points$/m);
    assert.match(text.stdout, /^gemma3:12b\s+128 tok\/s\s+(?:~\d+ tok\/s|-)\s+3,715 tok\/s\s+1\.0 s\s+-$/m);
    assert.match(text.stdout, /Points are for the four RigScore tier models/);
    assert.doesNotMatch(text.stdout, /gemma3:12b, gemma3:12b/);
    assert.match(text.stdout, ascii);

    const json = JSON.parse((await runCli(['--measure', 'gemma3:12b', '--json'], { OLLAMA_HOST: ollama.host })).stdout);
    assert.equal(json.mode, 'measure-model');
    assert.equal(json.tier, null);
    assert.equal(json.status, 'measured');
    assert.equal(json.points, null);
    assert.equal(json.writingTps, 128);
    assert.equal(json.stamp.tier, 'model');
    const allowed = ['appVersion', 'driverVersion', 'gpu', 'model', 'modelDigest', 'numCtx', 'ollamaVersion', 'quantization', 'tier', 'vramGb', 'workloadVersion'];
    assert.ok(Object.keys(json.stamp).every((key) => allowed.includes(key)), `only the stamp's own fields: ${Object.keys(json.stamp)}`);
    for (const key of ['tier', 'model', 'modelDigest', 'quantization', 'ollamaVersion', 'workloadVersion', 'numCtx', 'appVersion']) assert.ok(key in json.stamp, key);
    assert.doesNotMatch(JSON.stringify(json), /hostname|127\.0\.0\.1|localhost|[A-Z]:\\|\/home\//);

    assert.deepEqual([...new Set(ollama.loads())], ['gemma3:12b']);
    assert.deepEqual(ollama.unloads(), ['gemma3:12b', 'gemma3:12b'], 'once for each run');
    assert.equal(ollama.calls.some((call) => call.path === '/api/pull'), false);

    // Not installed: the pull command, nothing run, and exit 1.
    const missing = await runCli(['--measure', 'phi4:14b'], { OLLAMA_HOST: ollama.host });
    assert.equal(missing.code, 1);
    assert.match(missing.stdout, /phi4:14b is not installed\. Get it with: ollama pull phi4:14b, then measure again\./);
    // A name Ollama would not take.
    const bad = await runCli(['--measure', 'x y'], { OLLAMA_HOST: ollama.host });
    assert.match(bad.stderr, /"x y" is not a model name Ollama uses/);
  } finally {
    await ollama.close();
  }
});

test('a real Ctrl+C stops the real command, which unloads the model and exits 130', { skip: process.platform === 'win32' && 'Node cannot send a console interrupt on Windows: child.kill(SIGINT) ends the process without its handler' }, async () => {
  const ollama = await fakeOllama({ installed: ['gemma3:12b'], stall: true });
  try {
    const child = spawn(process.execPath, [join(root, 'cli', 'rigmatch-fit.ts'), '--measure', 'gemma3:12b'], {
      cwd: root, env: { ...process.env, OLLAMA_HOST: ollama.host }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    assert.equal(await ollama.waitForStall(20_000), true, stderr);
    child.kill('SIGINT');
    const { code, signal } = await exited;
    assert.deepEqual([code, signal], [130, null]);
    assert.match(stderr, /Stopping: unloading the model\.\.\./);
    assert.deepEqual(ollama.unloads(), ['gemma3:12b']);
  } finally {
    await ollama.close();
  }
});
