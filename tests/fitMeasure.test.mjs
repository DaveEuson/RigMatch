// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  checkMeasureArgs, planTiers, estimateSeconds, describeDuration, measureTiers, measureModel, headlineOf,
  formatIntro, formatReport, formatModelReport, formatProgress, toMeasureJson, toModelJson, tierFor,
} = await import('../cli/measure.ts');
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
  assert.equal(headlineOf(stopped), null);
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
  assert.deepEqual(Object.keys(json), ['tool', 'version', 'mode', 'hardware', 'workload', 'reference', 'tiers', 'headline', 'stopped', 'busy']);
  assert.equal(json.mode, 'measure');
  assert.deepEqual(json.workload, { version: 1, numCtx: 4096, numPredict: 256, promptTokens: 1500, warmupRuns: 1, measuredRuns: 3 });
  assert.deepEqual(json.tiers.map((entry) => [entry.tier, entry.status]), [['light', 'measured'], ['standard', 'measured'], ['heavy', 'missing'], ['extreme', 'too-big']]);
  const standard = json.tiers[1];
  assert.deepEqual(Object.keys(standard), ['tier', 'model', 'status', 'writingTps', 'readingTps', 'loadSeconds', 'runs', 'gpuShare', 'points', 'pointsNote', 'band', 'stamp']);
  assert.equal(standard.points, 1000);
  assert.equal(standard.band, 'excellent');
  assert.deepEqual(Object.keys(standard.stamp).sort(), ['appVersion', 'driverVersion', 'gpu', 'model', 'modelDigest', 'numCtx', 'ollamaVersion', 'quantization', 'tier', 'vramGb', 'workloadVersion']);
  assert.deepEqual(json.tiers[2], { tier: 'heavy', model: 'qwen3:14b', status: 'missing', command: 'ollama pull qwen3:14b', sizeGb: 9.3 });
  assert.deepEqual(json.headline, { tier: 'standard', points: 1000, pointsNote: null, writingTps: 66.2, band: 'excellent' });
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

test("the command shares the app's runner and unload, and Ctrl+C stops the run rather than the process", async () => {
  const { readFileSync } = await import('node:fs');
  const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
  const measure = read('../cli/measure.ts');
  const entry = read('../cli/rigmatch-fit.ts');
  const main = read('../electron/main.cjs');
  // One runner, one unload, one think check: shared, not copied.
  assert.match(measure, /import runner from '\.\.\/electron\/rigScoreRunner\.cjs';/);
  assert.match(main, /const \{ runRigTier, unloadOllamaModel \} = require\('\.\/rigScoreRunner\.cjs'\);/);
  assert.match(main, /if \(await unloadOllamaModel\(\{ fetchJson, baseUrl, model, settleMs: UNLOAD_SETTLE_TIMEOUT_MS \}\)\) return;/);
  assert.doesNotMatch(main, /^function isUnsupportedThinkError/m, 'the think check lives in ollamaRequest.cjs now');
  // The first Ctrl+C aborts the run, so the runner unloads on its way out; a second one leaves.
  assert.match(entry, /process\.on\('SIGINT', \(\) => \{\n\s*interrupts \+= 1;\n\s*if \(interrupts > 1\) process\.exit\(130\);\n\s*controller\.abort\(\);/);
  assert.match(entry, /signal: controller\.signal,/);
  assert.match(entry, /security\.assertLocalhostUrl\(baseUrl\);/);
});

// ---- The real command, from source, against a stand-in Ollama -----------------

/** A stand-in Ollama on a free port, recording what it was asked. */
async function fakeOllama({ installed = [], loaded = [] } = {}) {
  const calls = [];
  const state = { loaded: loaded.map((name) => ({ name, size: 100, size_vram: 100, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() })) };
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = body ? JSON.parse(body) : null;
      calls.push({ path: request.url, body: parsed });
      const send = (value) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
      if (request.url === '/api/tags') return send({ models: installed.map((name) => ({ name, model: name, size: 2e9, details: { parameter_size: '3B' } })) });
      if (request.url === '/api/ps') return send({ models: state.loaded });
      if (request.url === '/api/version') return send({ version: '0.35.1' });
      if (request.url === '/api/show') return send({ modelfile: `FROM /models/blobs/sha256-${'a'.repeat(64)}`, details: { quantization_level: 'Q4_K_M' } });
      if (request.url === '/api/generate') {
        if (parsed.keep_alive === 0) { state.loaded = state.loaded.filter((entry) => entry.name !== parsed.model); return send({ done: true }); }
        state.loaded = [{ name: parsed.model, size: 100, size_vram: 100, expires_at: new Date(Date.now() + 110_000).toISOString() }];
        return send({ prompt_eval_count: 1486, prompt_eval_duration: 0.4e9, eval_count: 256, eval_duration: 2e9, load_duration: 1e9, done: true });
      }
      response.statusCode = 404;
      return send({ error: 'not found' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { calls, state, host: `127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

const runCli = (args, env) => new Promise((resolve) => {
  execFile(process.execPath, [join(root, 'cli', 'rigmatch-fit.ts'), ...args], { cwd: root, env: { ...process.env, ...env }, timeout: 60_000 }, (error, stdout, stderr) => {
    resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
  });
});

test('the command refuses while another program has a model loaded, and never unloads it', async () => {
  const ollama = await fakeOllama({ installed: ['llama3.2:3b'], loaded: ['mistral:7b'] });
  try {
    const result = await runCli(['--measure'], { OLLAMA_HOST: ollama.host });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Ollama has mistral:7b loaded by another program\. It shares the graphics card and would slow the test, so rigmatch-fit leaves it alone\./);
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
});

test('a full --measure --json run: valid JSON on stdout, progress on stderr, every model it loaded unloaded, none pulled', async () => {
  const ollama = await fakeOllama({ installed: ['llama3.2:3b', 'qwen3:8b', 'qwen3:14b'] });
  try {
    const result = await runCli(['--measure', '--json'], { OLLAMA_HOST: ollama.host });
    const json = JSON.parse(result.stdout);
    assert.equal(json.mode, 'measure');
    assert.equal(json.tiers.length, 4);
    assert.ok(json.tiers.every((entry) => ['measured', 'missing', 'too-big', 'skipped', 'busy', 'stopped', 'failed'].includes(entry.status)));
    const loads = ollama.calls.filter((call) => call.path === '/api/generate' && call.body.keep_alive !== 0).map((call) => call.body.model);
    const unloads = ollama.calls.filter((call) => call.path === '/api/generate' && call.body.keep_alive === 0).map((call) => call.body.model);
    assert.deepEqual([...new Set(unloads)], [...new Set(loads)], 'every model it loaded, it unloaded');
    assert.equal(ollama.calls.some((call) => call.path === '/api/pull'), false);
    assert.ok(ollama.calls.filter((call) => call.path === '/api/generate' && call.body.keep_alive !== 0).every((call) => call.body.think === false && call.body.options.num_ctx === 4096));
    // On a machine with a graphics card the tiers ran (stand-in speeds: 128 tok/s writing); without one, each is "too-big".
    for (const entry of json.tiers.filter((item) => item.status === 'measured')) {
      assert.equal(entry.writingTps, 128);
      assert.equal(entry.stamp.ollamaVersion, '0.35.1');
      assert.equal(entry.stamp.modelDigest, `sha256-${'a'.repeat(64)}`);
      assert.match(result.stderr, new RegExp(`${entry.tier === 'light' ? 'Light' : entry.tier === 'standard' ? 'Standard' : 'Heavy'}, ${entry.model.replace('.', '\\.')}: `));
    }
    assert.match(result.stderr, /^RigMatch speed test\n/, 'the intro goes to stderr, so stdout is only JSON');
    if (json.tiers.some((entry) => entry.status === 'measured')) assert.equal(result.code, 0, result.stderr);
  } finally {
    await ollama.close();
  }
});
