import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeRigRequest, readRigRun, weightsDigest, sameModel, isOutOfMemory, sharedWith, runRigTier, unloadOllamaModel,
} = require('../electron/rigScoreRunner.cjs');
const { RIG_TIERS, RIG_WORKLOAD } = await import('../src/lib/rigScore.ts');
const { rigRunRequest, rigModelRequest, assembleTierResult, assembleModelResult } = await import('../src/lib/rigScoreRun.ts');

const light = RIG_TIERS.find((tier) => tier.id === 'light');
const extreme = RIG_TIERS.find((tier) => tier.id === 'extreme');
const DIGEST = 'dde5aa3fc5ffc17176b5e8bdc82f587b24b2678c6c66101bf7da77af9f7ccdff';
const machine = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, driverVersion: '610.88', isUnifiedMemory: false, appVersion: '0.9.9' };

/** A reply as Ollama sends it: durations in nanoseconds. */
const reply = (decodeTps, prefillTps, loadSeconds = 0.02) => ({
  prompt_eval_count: 1486,
  prompt_eval_duration: (1486 / prefillTps) * 1e9,
  eval_count: 256,
  eval_duration: (256 / decodeTps) * 1e9,
  load_duration: loadSeconds * 1e9,
  done_reason: 'length',
});

const aborted = () => Object.assign(new Error('Request stopped'), { name: 'AbortError' });

/** The runner's clock, fixed, so Ollama's expiry times can be set around it. */
const NOW = Date.parse('2026-10-24T21:00:00Z');
const expiresIn = (ms) => new Date(NOW + ms).toISOString();
/** What this runner's keep_alive of 2 minutes sets, just after a request. */
const OUR_EXPIRY = expiresIn(115_000);
/** Ollama's default keep_alive, as another program's request leaves it. */
const THEIR_EXPIRY = expiresIn(5 * 60_000);

/**
 * A stand-in Ollama: every call is recorded, and /api/generate answers from
 * `generate(body, index, state)`, which can change what /api/ps lists.
 */
function fakeOllama({ installed = ['llama3.2:3b'], loaded = [], generate, sizeVram = 1, unreachable = false } = {}) {
  const calls = [];
  const unloads = [];
  const state = { loaded: loaded.map((name) => ({ name, size: 100, size_vram: 100, expires_at: THEIR_EXPIRY })) };
  let generated = 0;
  const fetchJson = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, body });
    if (options.signal?.aborted) throw aborted();
    if (unreachable) throw new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:11434');
    switch (path) {
      case '/api/tags': return { models: installed.map((name) => ({ name, model: name })) };
      case '/api/version': return { version: '0.35.1' };
      case '/api/show': return {
        modelfile: `# Modelfile\nFROM D:\\ollama-models\\blobs\\sha256-${DIGEST}\nTEMPLATE x`,
        details: { quantization_level: 'Q4_K_M' },
      };
      case '/api/ps': return { models: state.loaded };
      case '/api/generate': {
        const index = generated;
        generated += 1;
        const others = state.loaded.filter((entry) => entry.name !== body.model);
        state.loaded = [...others, { name: body.model, size: 100, size_vram: Math.round(100 * sizeVram), expires_at: OUR_EXPIRY }];
        return generate(body, index, state);
      }
      default: throw new Error(`unexpected ${path}`);
    }
  };
  const unloadModel = async (_baseUrl, model) => {
    unloads.push(model);
    state.loaded = state.loaded.filter((entry) => entry.name !== model);
  };
  const generates = () => calls.filter((call) => call.path === '/api/generate');
  return { fetchJson, unloadModel, calls, unloads, generates, state };
}

const run = (ollama, overrides = {}) => runRigTier({
  request: rigRunRequest(light, 'rig-test'),
  baseUrl: 'http://127.0.0.1:11434',
  fetchJson: ollama.fetchJson,
  unloadModel: ollama.unloadModel,
  readMachine: async () => machine,
  now: () => NOW,
  ...overrides,
});

test("a reply's timings are read the way the benchmark reads them, in seconds", () => {
  const timed = readRigRun(reply(128, 2972, 1.5));
  assert.equal(timed.promptEvalCount, 1486);
  assert.equal(timed.evalCount, 256);
  assert.ok(Math.abs(timed.evalSeconds - 2) < 1e-9);
  assert.ok(Math.abs(timed.promptEvalSeconds - 0.5) < 1e-9);
  assert.ok(Math.abs(timed.loadSeconds - 1.5) < 1e-9);
  assert.deepEqual(readRigRun({}), { promptEvalCount: 0, promptEvalSeconds: 0, evalCount: 0, evalSeconds: 0, loadSeconds: 0 });
});

test('the weights digest comes from the FROM line, without the path in front of it', () => {
  assert.equal(weightsDigest({ modelfile: `FROM D:\\ollama-models\\blobs\\sha256-${DIGEST}` }), `sha256-${DIGEST}`);
  assert.equal(weightsDigest({ modelfile: `FROM /usr/share/ollama/.ollama/models/blobs/sha256:${DIGEST.toUpperCase()}` }), `sha256-${DIGEST}`);
  assert.equal(weightsDigest({ modelfile: 'FROM llama3.2:3b' }), undefined);
  assert.equal(weightsDigest(null), undefined);
});

test('a request is checked: a known tier, one prompt per run, and only the options that shape the work', () => {
  const request = rigRunRequest(light, 'rig-1');
  const plan = normalizeRigRequest({ ...request, options: { ...request.options, num_gpu: 0, mirostat: 2 } });
  assert.deepEqual(Object.keys(plan.options).sort(), ['num_ctx', 'num_predict', 'seed', 'temperature']);
  assert.equal(plan.options.num_ctx, RIG_WORKLOAD.numCtx);
  assert.equal(plan.prompts.length, RIG_WORKLOAD.warmupRuns + RIG_WORKLOAD.measuredRuns);
  assert.throws(() => normalizeRigRequest({ ...request, tier: 'ultra' }), /Unknown RigScore tier/);
  assert.throws(() => normalizeRigRequest({ ...request, prompts: request.prompts.slice(1) }), /one prompt for each run/);
  assert.throws(() => normalizeRigRequest({ ...request, model: '../etc/passwd' }));
});

test("a plain model (tier 'model') is a request with no tier: no card-size rule, and it runs on a card too small for any tier", async () => {
  const request = rigModelRequest('gemma3:12b', 'fit-model');
  assert.equal(request.tier, 'model');
  assert.equal(request.minVramGb, 0);
  assert.equal(request.prompts.length, RIG_WORKLOAD.warmupRuns + RIG_WORKLOAD.measuredRuns, "the app's workload, prompt for prompt");
  assert.deepEqual(request.prompts, rigRunRequest(light, 'x').prompts);
  // However the caller fills in the size rule, a model has none.
  const plan = normalizeRigRequest({ ...request, minVramGb: 24 });
  assert.deepEqual([plan.tier, plan.model, plan.minVramGb], ['model', 'gemma3:12b', 0]);
  assert.throws(() => normalizeRigRequest({ ...request, model: 'a b' }), /unsupported characters|not valid/);
  assert.throws(() => normalizeRigRequest({ ...request, tier: 'modle' }), /Unknown RigScore tier/);

  const ollama = fakeOllama({ installed: ['gemma3:12b'], generate: (_body, index) => reply(41, 1850, index === 0 ? 1.8 : 0.02) });
  const answer = await run(ollama, { request, readMachine: async () => ({ ...machine, vramGb: 0, isUnifiedMemory: false }) });
  assert.equal(answer.status, 'done', "a 0 GB card is Ollama's to answer for, not the runner's");
  assert.equal(ollama.generates().length, 4);
  assert.deepEqual(ollama.unloads, ['gemma3:12b']);
  const outcome = assembleModelResult('gemma3:12b', answer);
  assert.equal(outcome.kind, 'measured');
  assert.equal(outcome.stamp.tier, 'model');
  assert.equal(Math.round(outcome.measure.decodeTps), 41);
  assert.equal(outcome.measure.loadSeconds, 1.8, 'the cold load, as for a tier');
  // A stop says "model" for one, and "tier" for a tier.
  assert.equal(assembleModelResult('gemma3:12b', { status: 'stopped' }).message, 'Stopped. Nothing was saved for this model.');
  assert.equal(assembleTierResult(light, { status: 'stopped' }, 'x').message, 'Stopped. Nothing was saved for this tier.');
  // Not installed: no size to quote for a model that is not a tier.
  assert.equal(assembleModelResult('gemma3:12b', { status: 'not-installed' }).message, 'gemma3:12b is not installed.');
  // Another program has a model loaded: said without "waits", since nothing waits.
  assert.doesNotMatch(assembleModelResult('gemma3:12b', { status: 'busy', loadedModels: ['mistral:7b'] }).message, /\bwaits\b/);
});

test('unloadOllamaModel asks for keep_alive 0 and says whether the model left: true, false, or an error', async () => {
  const calls = [];
  const listing = (names) => ({ models: names.map((name) => ({ name })) });
  const make = (ps, fail = false) => async (url, options = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: options.body ? JSON.parse(options.body) : null });
    if (path === '/api/generate' && fail) throw new Error('connection refused');
    return path === '/api/ps' ? ps() : {};
  };

  // Gone on the first look: true.
  calls.length = 0;
  assert.equal(await unloadOllamaModel({ fetchJson: make(() => listing([])), baseUrl: 'http://x', model: 'qwen3:8b' }), true);
  assert.deepEqual(calls[0], { path: '/api/generate', body: { model: 'qwen3:8b', keep_alive: 0 } });
  assert.deepEqual(calls.map((call) => call.path), ['/api/generate', '/api/ps']);

  // Gone after a few looks: true, having asked once.
  calls.length = 0;
  let looks = 0;
  assert.equal(await unloadOllamaModel({ fetchJson: make(() => listing(++looks < 3 ? ['qwen3:8b'] : [])), baseUrl: 'http://x', model: 'qwen3:8b', pollMs: 5 }), true);
  assert.equal(calls.filter((call) => call.path === '/api/generate').length, 1);
  assert.equal(calls.filter((call) => call.path === '/api/ps').length, 3);

  // Another model is listed, not this one: gone.
  assert.equal(await unloadOllamaModel({ fetchJson: make(() => listing(['mistral:7b'])), baseUrl: 'http://x', model: 'qwen3:8b' }), true);

  // Still listed when the time is up: false. Not a throw, since the unload itself worked.
  const started = Date.now();
  assert.equal(await unloadOllamaModel({ fetchJson: make(() => listing(['qwen3:8b'])), baseUrl: 'http://x', model: 'qwen3:8b', settleMs: 60, pollMs: 10 }), false);
  assert.ok(Date.now() - started >= 50, 'it waited the time it was given');
  // No time to wait: asked, and not looked at.
  calls.length = 0;
  assert.equal(await unloadOllamaModel({ fetchJson: make(() => listing(['qwen3:8b'])), baseUrl: 'http://x', model: 'qwen3:8b', settleMs: 0 }), false);
  assert.deepEqual(calls.map((call) => call.path), ['/api/generate']);

  // The request itself failing is an error, for the caller to decide about.
  await assert.rejects(unloadOllamaModel({ fetchJson: make(() => listing([]), true), baseUrl: 'http://x', model: 'qwen3:8b' }), /connection refused/);
  // A /api/ps that fails while waiting counts as "not listed": nothing says it is still there.
  assert.equal(await unloadOllamaModel({ fetchJson: async (url) => { if (new URL(url).pathname === '/api/ps') throw new Error('timeout'); return {}; }, baseUrl: 'http://x', model: 'qwen3:8b', settleMs: 50, pollMs: 5 }), true);
});

test('a tier runs a warm-up then three timed runs, unloads after, and only the timed runs count', async () => {
  const ollama = fakeOllama({ generate: (_body, index) => reply(100 + index, 3000, index === 0 ? 1.8 : 0.02) });
  const progress = [];
  const answer = await run(ollama, { onProgress: (update) => progress.push(update) });

  assert.equal(answer.status, 'done');
  const generates = ollama.generates();
  assert.equal(generates.length, 4, 'one warm-up and three timed runs');
  assert.deepEqual(generates.map((call) => call.body.prompt.split('\n')[0]), ['Reading 1.', 'Reading 2.', 'Reading 3.', 'Reading 4.'],
    'each run opens differently, so Ollama cannot skip reading a prompt it has seen');
  for (const call of generates) {
    assert.equal(call.body.think, false);
    assert.equal(call.body.stream, false);
    assert.equal(call.body.options.num_predict, RIG_WORKLOAD.numPredict);
    assert.equal(call.body.options.temperature, 0);
  }
  assert.equal(answer.runs.length, 3);
  assert.deepEqual(answer.runs.map((timed) => Math.round(timed.evalCount / timed.evalSeconds)), [101, 102, 103], 'the warm-up is not one of them');
  assert.equal(answer.coldLoadSeconds, 1.8, 'the load is timed on the warm-up, which found the model unloaded');
  assert.equal(answer.gpuShare, 1);
  assert.equal(answer.modelDigest, `sha256-${DIGEST}`);
  assert.equal(answer.quantization, 'Q4_K_M');
  assert.equal(answer.ollamaVersion, '0.35.1');
  assert.deepEqual(answer.machine, machine);
  assert.deepEqual(ollama.unloads, ['llama3.2:3b']);
  assert.deepEqual(progress.map((update) => update.phase), ['checking', 'loading', 'run', 'run', 'run', 'unloading']);

  // Through the renderer's assembly: a measure and a stamp, from the same answer.
  const outcome = assembleTierResult(light, answer, '2026-10-24T21:00:00.000Z');
  assert.equal(outcome.kind, 'measured');
  assert.equal(Math.round(outcome.result.measure.decodeTps), 102, 'the median of the three timed runs');
  assert.equal(Math.round(outcome.result.measure.prefillTps), 3000);
  assert.deepEqual(outcome.result.stamp, {
    tier: 'light', model: 'llama3.2:3b', modelDigest: `sha256-${DIGEST}`, quantization: 'Q4_K_M',
    workloadVersion: RIG_WORKLOAD.version, numCtx: RIG_WORKLOAD.numCtx, ollamaVersion: '0.35.1',
    driverVersion: '610.88', gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, appVersion: '0.9.9',
  });
  assert.equal(outcome.result.measure.loadSeconds, 1.8, "the measure's load time is the cold load, not the timed runs' few milliseconds");
});

test('a model that is not installed is reported, never pulled', async () => {
  const ollama = fakeOllama({ installed: ['gemma3:4b'], generate: () => reply(100, 3000) });
  const answer = await run(ollama);
  assert.deepEqual(answer, { status: 'not-installed' });
  assert.equal(ollama.calls.some((call) => call.path === '/api/pull'), false);
  assert.equal(ollama.generates().length, 0);
  assert.deepEqual(ollama.unloads, [], 'nothing was loaded, so nothing is unloaded');
});

test('a tier too big for the card is not run, with a fresh reading of the card', async () => {
  const ollama = fakeOllama({ installed: ['qwen3:30b-a3b'], generate: () => reply(100, 3000) });
  const answer = await run(ollama, { request: rigRunRequest(extreme, 'rig-x') });
  assert.equal(answer.status, 'too-big');
  assert.equal(ollama.calls.length, 0, 'Ollama is not asked anything');

  // Unified memory has no separate card: every tier is tried.
  const unified = fakeOllama({ installed: ['qwen3:30b-a3b'], generate: () => reply(30, 400) });
  const tried = await run(unified, {
    request: rigRunRequest(extreme, 'rig-y'),
    readMachine: async () => ({ ...machine, vramGb: 8, isUnifiedMemory: true }),
  });
  assert.equal(tried.status, 'done');
});

test("a model that will not fit in memory comes back as too big, and is unloaded", async () => {
  const ollama = fakeOllama({
    generate: () => { throw new Error('500 Internal Server Error from 127.0.0.1:11434: model requires more system memory (21.3 GiB) than is available (15.2 GiB)'); },
  });
  const answer = await run(ollama);
  assert.equal(answer.status, 'too-big');
  assert.match(answer.error, /more system memory/);
  assert.deepEqual(ollama.unloads, ['llama3.2:3b']);
  assert.equal(isOutOfMemory(new Error('CUDA error: out of memory')), true);
  assert.equal(isOutOfMemory(new Error('connection refused')), false);
});

test('another model in memory makes the test wait; RigMatch does not unload what it did not load', async () => {
  const ollama = fakeOllama({ loaded: ['mistral:7b'], generate: () => reply(100, 3000) });
  let freed = 0;
  const answer = await run(ollama, { beforeRun: async () => { freed += 1; } });
  assert.deepEqual(answer, { status: 'busy', loadedModels: ['mistral:7b'] });
  assert.equal(freed, 1, "RigMatch's own leftovers are freed first");
  assert.equal(ollama.generates().length, 0);
  assert.deepEqual(ollama.unloads, []);
});

test("the tier's own model loaded by another program makes the test wait too, and is not evicted", async () => {
  // Open WebUI mid-reply on llama3.2:3b, say: unloading it would cut that reply off.
  const ollama = fakeOllama({ loaded: ['llama3.2:3b'], generate: () => reply(100, 3000) });
  const answer = await run(ollama);
  assert.deepEqual(answer, { status: 'busy', loadedModels: ['llama3.2:3b'] });
  assert.equal(ollama.generates().length, 0);
  assert.deepEqual(ollama.unloads, [], 'it is not RigMatch\'s to unload');
});

test("RigMatch's own copy (Labs, its chat) is freed by beforeRun, and then the test runs and times the load", async () => {
  const ollama = fakeOllama({ loaded: ['llama3.2:3b'], generate: (_body, index) => reply(100, 3000, index === 0 ? 2 : 0.02) });
  const answer = await run(ollama, { beforeRun: async () => { ollama.state.loaded = []; } });
  assert.equal(answer.status, 'done');
  assert.equal(answer.coldLoadSeconds, 2);
  assert.deepEqual(ollama.unloads, ['llama3.2:3b'], 'only its own copy, after the last run');
});

test('a model that comes to share the card mid-test means nothing is kept, and the test model is still unloaded', async () => {
  const ollama = fakeOllama({
    generate: (_body, index, state) => {
      // A chat in another program loads gemma3 during the second timed run.
      if (index === 2) state.loaded.push({ name: 'gemma3:4b', size: 100, size_vram: 100, expires_at: THEIR_EXPIRY });
      return reply(100, 3000);
    },
  });
  const answer = await run(ollama);
  assert.deepEqual(answer, { status: 'shared', loadedModels: ['gemma3:4b'], sameModel: false });
  assert.equal(ollama.generates().length, 3, 'it stops at the run that found it');
  assert.deepEqual(ollama.unloads, ['llama3.2:3b']);
});

test('another program using the same model mid-test means nothing is kept, and the model is left loaded for it', async () => {
  const ollama = fakeOllama({
    generate: (body, index, state) => {
      // Its request refreshed the expiry with Ollama's five-minute default.
      if (index === 1) state.loaded.find((entry) => entry.name === body.model).expires_at = THEIR_EXPIRY;
      return reply(100, 3000);
    },
  });
  const answer = await run(ollama);
  assert.deepEqual(answer, { status: 'shared', loadedModels: [], sameModel: true });
  assert.deepEqual(ollama.unloads, [], 'unloading it would cut the other program off');
});

test("who shares the card is read from /api/ps: other models by name, the same model by its expiry", () => {
  const listing = (expiresAt, ...others) => ({ models: [{ name: 'llama3.2:3b', expires_at: expiresAt }, ...others.map((name) => ({ name }))] });
  assert.deepEqual(sharedWith(listing(OUR_EXPIRY), 'llama3.2:3b', NOW), { others: [], sameModelElsewhere: false });
  assert.deepEqual(sharedWith(listing(expiresIn(170_000)), 'llama3.2:3b', NOW), { others: [], sameModelElsewhere: false }, 'inside the slack');
  assert.deepEqual(sharedWith(listing(THEIR_EXPIRY, 'gemma3:4b'), 'llama3.2:3b', NOW), { others: ['gemma3:4b'], sameModelElsewhere: true });
  assert.deepEqual(sharedWith(listing('2318-08-29T00:00:00Z'), 'llama3.2:3b', NOW).sameModelElsewhere, true, 'keep_alive -1 is forever');
  assert.deepEqual(sharedWith(null, 'llama3.2:3b', NOW), { others: [], sameModelElsewhere: false });
});

test('Stop while Ollama is being checked is a stop, not a failure, and nothing is unloaded', async () => {
  const during = async (step) => {
    const controller = new AbortController();
    const ollama = fakeOllama({ generate: () => reply(100, 3000) });
    const answer = await run(ollama, {
      signal: controller.signal,
      readMachine: async () => { if (step === 'machine') controller.abort(); return machine; },
      beforeRun: async () => { if (step === 'beforeRun') controller.abort(); },
    });
    return { answer, ollama };
  };
  for (const step of ['machine', 'beforeRun']) {
    const { answer, ollama } = await during(step);
    assert.deepEqual(answer, { status: 'stopped' }, `stopped during ${step}`);
    assert.equal(ollama.generates().length, 0);
    assert.deepEqual(ollama.unloads, []);
  }
});

test('an Ollama that does not answer is a failure in words, never a thrown error that logs the prompts', async () => {
  const ollama = fakeOllama({ unreachable: true, generate: () => reply(100, 3000) });
  const answer = await run(ollama);
  assert.equal(answer.status, 'failed');
  assert.match(answer.error, /ECONNREFUSED/);
  assert.deepEqual(ollama.unloads, []);
});

test('Stop ends the run mid-question, saves nothing and still unloads the model', async () => {
  const controller = new AbortController();
  const ollama = fakeOllama({
    generate: (_body, index) => {
      if (index === 2) { controller.abort(); throw aborted(); }
      return reply(100, 3000);
    },
  });
  const answer = await run(ollama, { signal: controller.signal });
  assert.deepEqual(answer, { status: 'stopped' });
  assert.equal(ollama.generates().length, 3);
  assert.deepEqual(ollama.unloads, ['llama3.2:3b']);

  const early = new AbortController();
  early.abort();
  assert.deepEqual(await run(fakeOllama({ generate: () => reply(100, 3000) }), { signal: early.signal }), { status: 'stopped' });
});

test('an Ollama too old for think:false is asked again without it, for every run after', async () => {
  const ollama = fakeOllama({
    generate: (body) => {
      if ('think' in body) throw new Error('400 Bad Request: unknown field think');
      return reply(100, 3000);
    },
  });
  const answer = await run(ollama, { isUnsupportedThinkError: (error) => /think/.test(error.message) });
  assert.equal(answer.status, 'done');
  const generates = ollama.generates();
  assert.equal(generates.filter((call) => 'think' in call.body).length, 1, 'asked with it once');
  assert.equal(generates.length, 5);
});

test('a model that spilled out of the card says how much ran on it', async () => {
  const ollama = fakeOllama({ generate: () => reply(20, 300), sizeVram: 0.87 });
  const answer = await run(ollama);
  assert.equal(answer.gpuShare, 0.87);
});

test('a listed name matches its tag, and a bare name means :latest', () => {
  assert.equal(sameModel('llama3.2:3b', 'llama3.2:3b'), true);
  assert.equal(sameModel('qwen3:latest', 'qwen3'), true);
  assert.equal(sameModel('qwen3:latest', 'qwen3:8b'), false);
});

// Quitting mid-test is covered beside the show's quit, in mainScanFixes.test.mjs.
test('the main process runs one speed test at a time, never beside a show, on the local Ollama only', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
  const runner = main.slice(main.indexOf('async function runRigScore('), main.indexOf('\n}\n', main.indexOf('async function runRigScore(')));
  assert.match(runner, /if \(benchmarkRunning\) throw new Error/);
  assert.match(runner, /if \(activeRigScore\) throw new Error/);
  assert.match(runner, /baseUrl: OLLAMA_LOCAL_URL,/, 'local only: a remote card cannot be read');
  assert.match(runner, /finally \{\n\s*activeRigScore = null;\n\s*finished\(\);/);
  // RigMatch frees its own copies first: Labs' models and its chat's.
  assert.match(runner, /beforeRun: async \(\) => \{\n\s*await releaseOllamaLabModels\(\);\n\s*await releaseOllamaChatModels\(\);/);
  const chat = main.slice(main.indexOf('async function sendChat('), main.indexOf('async function runAdvancedGenerate('));
  assert.match(chat, /ollamaChatResident\.set\(`\$\{baseUrl\}\\n\$\{model\}`, \{ baseUrl, model \}\);/, 'the chat records what it loaded');
  const bench = main.slice(main.indexOf('async function runBenchmark('), main.indexOf('async function runBenchmark(') + 600);
  assert.match(bench, /if \(activeRigScore\) \{\n\s*throw new Error/);
  assert.match(main, /handleLogged\('rigscore:run', 'rigscore'/);
  assert.match(main, /ipcMain\.handle\('rigscore:cancel'/);
  const preload = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf-8');
  assert.match(preload, /runRigScore: \(request\) => ipcRenderer\.invoke\('rigscore:run', request\)/);
  assert.match(preload, /cancelRigScore: \(progressId\) => ipcRenderer\.invoke\('rigscore:cancel', progressId\)/);
  assert.match(preload, /ipcRenderer\.on\('rigscore:progress', listener\)/);
});
