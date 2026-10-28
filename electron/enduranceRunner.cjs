// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Context endurance's runner: one model, the same prompt grown to fill three
 * context sizes, timed on this PC.
 *
 * Every other RigMatch test runs at a short context (num_ctx 2048), so a model
 * that is fast there can crawl at 16K and nothing says so. This loads the model
 * at each size in turn (the context size changes, so Ollama reloads it), fills
 * the context with a fake server log that hides a passkey 55% of the way in,
 * and reads back from Ollama itself: the prompt it counted, the reading and
 * writing speed, the load time, how much of the model sits on the graphics card
 * (/api/ps) and whether the passkey came back.
 *
 * The renderer owns what the test is (src/lib/contextEndurance.ts: the stages,
 * the thresholds, the verdict). This side builds the prompts, because their
 * length has to be worked out against the model's own tokenizer at run time.
 *
 * Four things the first real run of this test taught (2026-10-26):
 *  - Ollama silently cuts a prompt longer than the context, to about half of
 *    it, and the call still succeeds. So tokens per line are measured on small
 *    prompts well under the context, never assumed (30 to 37 across tokenizers),
 *    and every stage checks the prompt Ollama counted against the target. A
 *    stage whose prompt came out the wrong size is marked, never scored as the
 *    model's failure.
 *  - A cached prefix would make the reading speed a fiction, so every prompt
 *    starts with a fresh random line.
 *  - The model reloads at each size. Load time is reported on its own.
 *  - The result depends on what else uses the card. The caller records that.
 *
 * It never pulls a model, never runs beside another program's model, never
 * unloads one it did not load, and unloads its own however it ends.
 *
 * Pure apart from the calls it is handed, so tests drive it with a fake Ollama.
 */
const { randomInt, randomUUID } = require('node:crypto');
const { buildBenchmarkGenerateBody, isUnsupportedThinkError: thinkRefused, normalizePositiveNumber } = require('./ollamaRequest.cjs');
const { assertValidModelName } = require('./security.cjs');
const { RIG_KEEP_ALIVE, isOutOfMemory, listedNames, sameModel, sharedWith, weightsDigest } = require('./rigScoreRunner.cjs');

/** A stage's prompt, as Ollama counted it, may be this far from the target before the stage is thrown out. */
const SIZE_TOLERANCE = 0.15;
/** The passkey sits this far into the log: not at either end, where models find it easily. */
const NEEDLE_POSITION = 0.55;
/** Two small prompts, sized to stay well under the first stage's context whatever the tokenizer. */
const CALIBRATION_LINES = [8, 24];
const MIN_CONTEXT = 2048;
const MAX_CONTEXT = 65536;
const MAX_STAGES = 4;
/** The first request loads the model: 18 GB from a slow disk takes minutes. */
const ENDURANCE_LOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** A stage that spilled into system memory can read at a few dozen tokens a second. */
const ENDURANCE_STAGE_TIMEOUT_MS = 10 * 60 * 1000;

const SUBSYSTEMS = ['AUTH_GATEWAY', 'VRAM_ALLOC', 'ROUTER_CORE', 'KV_CACHE_MGR'];
const STATUSES = ['NOMINAL', 'SYNCED', 'VERIFIED', 'IDLE_WAIT'];

/**
 * A synthetic server log of `lines` entries, a fresh nonce on the first line
 * (so no cached prefix can be reused) and the passkey on one line 55% of the
 * way in, then the question. The reply asked for is short JSON.
 */
function buildEndurancePrompt({ lines, passkey, nonce }) {
  const needleAt = Math.floor(lines * NEEDLE_POSITION);
  const out = [`[SESSION_NONCE: ${nonce}]`, 'SYSTEM AUDIT LOG, CONTEXT STRESS TEST'];
  for (let index = 0; index < lines; index += 1) {
    out.push(index === needleAt
      ? `[LOG_SEQ_${index}] OVERRIDE_NOTICE: The secret emergency override passkey is "${passkey}". Keep this in active memory.`
      : `[LOG_SEQ_${index}] SUBSYSTEM=${SUBSYSTEMS[index % 4]} STATUS=${STATUSES[(index * 3) % 4]} LATENCY=${(index % 17) + 2}ms CHECKSUM=${(index * 2654435761) >>> 0}`);
  }
  out.push(
    '',
    'INSTRUCTION: Review the audit log above. Reply with valid JSON containing ONLY two keys:',
    '1. "passkey": the exact emergency override passkey found in the logs.',
    '2. "summary": a technical explanation, about 60 words, of why memory bandwidth matters for local AI models.',
  );
  return out.join('\n');
}

/**
 * How many log lines make a prompt of a given size, from two measured prompts:
 * the slope is the tokens a line costs on this model's tokenizer, the rest is
 * the fixed part (the header, the question, the chat template). Null when the
 * two do not give a believable slope.
 */
function calibrateLines(small, large) {
  const perLine = (large.tokens - small.tokens) / (large.lines - small.lines);
  if (!Number.isFinite(perLine) || perLine < 4 || perLine > 200) return null;
  const fixed = small.tokens - perLine * small.lines;
  return {
    tokensPerLine: perLine,
    linesFor: (targetTokens) => Math.max(2, Math.round((targetTokens - fixed) / perLine)),
  };
}

/** Whether Ollama counted a prompt near the size that was meant. A cut-down prompt fails this. */
function promptSizeOk(promptTokens, targetTokens) {
  return Number.isFinite(promptTokens)
    && promptTokens >= targetTokens * (1 - SIZE_TOLERANCE)
    && promptTokens <= targetTokens * (1 + SIZE_TOLERANCE);
}

/**
 * What Ollama has loaded, asked again if it does not answer: a slow answer
 * while a model is loading is not a reason to know nothing about the card.
 * Null when it never does.
 */
async function readLoaded(fetchJson, baseUrl, signal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchJson(`${baseUrl}/api/ps`, { signal }, 5000);
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return null;
}

const passkeyKept = (response, passkey) => typeof response === 'string' && response.includes(passkey);

function boundedInteger(value, min, max, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`The context check needs ${label} between ${min} and ${max}.`);
  return number;
}

/**
 * The request, checked: a model name Ollama could hold and a few stages that
 * each fit their own context (a target the model's window cannot hold would
 * be cut by Ollama, which is the one thing this test must not do).
 */
function normalizeEnduranceRequest(request = {}) {
  const model = assertValidModelName(request.model);
  const raw = Array.isArray(request.stages) ? request.stages : [];
  if (raw.length === 0 || raw.length > MAX_STAGES) throw new Error(`The context check runs one to ${MAX_STAGES} stages.`);
  const stages = raw.map((stage) => {
    const numCtx = boundedInteger(stage?.numCtx, MIN_CONTEXT, MAX_CONTEXT, 'a context size');
    const targetTokens = boundedInteger(stage?.targetTokens, 128, Math.floor(numCtx * 0.9), 'a prompt size under its context');
    const id = String(stage?.id ?? '');
    if (!/^[a-z0-9-]{1,24}$/.test(id)) throw new Error('A context stage needs a short id.');
    return { id, numCtx, targetTokens };
  });
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) throw new Error('The context stages need different ids.');
  const numPredict = Number(request.numPredict);
  return { model, stages, numPredict: Number.isInteger(numPredict) ? Math.min(512, Math.max(16, numPredict)) : 128 };
}

const seconds = (nanoseconds) => {
  const value = normalizePositiveNumber(nanoseconds);
  return value == null ? 0 : value / 1_000_000_000;
};

const perSecond = (count, nanoseconds) => {
  const tokens = normalizePositiveNumber(count);
  const time = seconds(nanoseconds);
  return tokens && time ? tokens / time : null;
};

/**
 * A practice prompt that came back near the context is one Ollama may have cut,
 * so its count says nothing about the tokenizer. (They are meant to be a third
 * of it or less.) Also true when Ollama gave no count.
 */
const tooLargeToSizeFrom = (tokens, numCtx) => !(tokens > 0 && tokens <= numCtx * 0.8);

/**
 * Run the stages. Resolves with a status rather than throwing for every
 * outcome a person can meet (not installed, too big, busy, shared, stopped,
 * failed), as runRigTier does, so a screen can say each in its own words.
 *
 * deps:
 *  - request: what the renderer sent (normalizeEnduranceRequest checks it)
 *  - baseUrl: the local Ollama
 *  - fetchJson(url, options, timeoutMs): honours options.signal
 *  - readMachine(): { gpu, vramGb, driverVersion, isUnifiedMemory, appVersion }
 *  - unloadModel(baseUrl, model): keep_alive 0, then wait for the card to free
 *  - beforeRun(): frees what RigMatch itself left loaded (Labs, its chat)
 *  - isUnsupportedThinkError(error): an Ollama too old for think:false
 *  - signal: aborts the run (Stop)
 *  - onProgress(update)
 *  - now(): the clock, for reading Ollama's expiry times
 *  - makeNonce(), makePasskey(): random by default; tests fix them
 */
async function runEndurance({
  request,
  baseUrl,
  fetchJson,
  readMachine,
  unloadModel,
  beforeRun = async () => {},
  isUnsupportedThinkError = thinkRefused,
  signal,
  onProgress = () => {},
  now = () => Date.now(),
  makeNonce = () => randomUUID(),
  makePasskey = () => `RM-${randomInt(1000, 10000)}`,
}) {
  const plan = normalizeEnduranceRequest(request);
  if (signal?.aborted) return { status: 'stopped' };
  onProgress({ phase: 'checking' });

  // Set once the first request is sent: only then is there a model of ours to unload.
  let loading = false;
  // Another program is using this model too, so it is not ours to unload.
  let leaveLoaded = false;
  try {
    const machine = await readMachine();

    const tags = await fetchJson(`${baseUrl}/api/tags`, { signal }, 4000);
    if (!listedNames(tags).some((name) => sameModel(name, plan.model))) return { status: 'not-installed' };

    const [version, show] = await Promise.all([
      fetchJson(`${baseUrl}/api/version`, { signal }, 3000).catch(() => null),
      fetchJson(`${baseUrl}/api/show`, { method: 'POST', body: JSON.stringify({ model: plan.model }), signal }, 8000).catch(() => null),
    ]);

    // Another model in memory shares the card and slows this one. RigMatch's own
    // leftovers are freed first; anything still loaded belongs to another
    // program, this model included, and is left alone: the test does not start.
    await beforeRun();
    if (signal?.aborted) return { status: 'stopped' };
    const resident = listedNames(await fetchJson(`${baseUrl}/api/ps`, { signal }, 3000));
    if (resident.length) return { status: 'busy', loadedModels: resident };

    return await timedStages({
      plan, baseUrl, fetchJson, isUnsupportedThinkError, signal, onProgress, now, makeNonce, makePasskey, machine, version, show,
      markLoading: () => { loading = true; },
      markShared: () => { leaveLoaded = true; },
    });
  } catch (error) {
    if (signal?.aborted) return { status: 'stopped' };
    if (loading && isOutOfMemory(error)) return { status: 'too-big', error: String(error?.message ?? error) };
    return { status: 'failed', error: String(error?.message ?? error) };
  } finally {
    if (loading && !leaveLoaded) {
      onProgress({ phase: 'unloading' });
      try { await unloadModel(baseUrl, plan.model); } catch { /* best effort: keep_alive frees it soon anyway */ }
    }
  }
}

async function timedStages({ plan, baseUrl, fetchJson, isUnsupportedThinkError, signal, onProgress, now, makeNonce, makePasskey, machine, version, show, markLoading, markShared }) {
  let thinkSwitch = true;
  const generate = async (prompt, numCtx, numPredict, timeoutMs) => {
    const options = { num_ctx: numCtx, num_predict: numPredict, temperature: 0 };
    const body = buildBenchmarkGenerateBody({ model: plan.model, prompt, keepAlive: RIG_KEEP_ALIVE, options });
    if (!thinkSwitch) delete body.think;
    try {
      return await fetchJson(`${baseUrl}/api/generate`, { method: 'POST', body: JSON.stringify(body), signal }, timeoutMs);
    } catch (error) {
      // An Ollama that predates think:false is asked again without it.
      if (!thinkSwitch || signal?.aborted || !isUnsupportedThinkError(error)) throw error;
      thinkSwitch = false;
      delete body.think;
      return fetchJson(`${baseUrl}/api/generate`, { method: 'POST', body: JSON.stringify(body), signal }, timeoutMs);
    }
  };

  // Calibrate at the first stage's context, so the one cold load happens here
  // and the first stage is not a reload. The prompts are small and the reply
  // one token: this measures the tokenizer, not the model.
  const first = plan.stages[0];
  onProgress({ phase: 'calibrating' });
  markLoading();
  const samples = [];
  let firstLoadSeconds = 0;
  for (const lines of CALIBRATION_LINES) {
    if (signal?.aborted) return { status: 'stopped' };
    const reply = await generate(buildEndurancePrompt({ lines, passkey: 'RM-0000', nonce: makeNonce() }), first.numCtx, 1, samples.length === 0 ? ENDURANCE_LOAD_TIMEOUT_MS : ENDURANCE_STAGE_TIMEOUT_MS);
    firstLoadSeconds += seconds(reply?.load_duration);
    samples.push({ lines, tokens: normalizePositiveNumber(reply?.prompt_eval_count) ?? 0 });
  }
  const sizing = samples.some((sample) => tooLargeToSizeFrom(sample.tokens, first.numCtx)) ? null : calibrateLines(samples[0], samples[1]);
  if (!sizing) throw new Error('Ollama counted the practice prompts in a way that cannot be sized from, so the context check cannot size its prompts for this model.');

  const stages = [];
  for (const [index, stage] of plan.stages.entries()) {
    if (signal?.aborted) return { status: 'stopped' };
    onProgress({ phase: 'stage', stage: stage.id, index: index + 1, of: plan.stages.length });
    const passkey = makePasskey();
    const prompt = buildEndurancePrompt({ lines: sizing.linesFor(stage.targetTokens), passkey, nonce: makeNonce() });
    let reply;
    try {
      reply = await generate(prompt, stage.numCtx, plan.numPredict, ENDURANCE_STAGE_TIMEOUT_MS);
    } catch (error) {
      // The first stage failing is the whole test failing (the outer catch says why).
      // A later one is a finding: the earlier stages ran, and this size did not.
      if (signal?.aborted || index === 0) throw error;
      stages.push({
        id: stage.id, numCtx: stage.numCtx, targetTokens: stage.targetTokens, status: 'failed',
        outOfMemory: isOutOfMemory(error), error: String(error?.message ?? error),
      });
      break;
    }

    // After every stage: how much of the model is on the card at this context,
    // what context Ollama really gave it, and did anything else come to share the card.
    const listing = await readLoaded(fetchJson, baseUrl, signal);
    const entry = (listing?.models ?? []).find((item) => sameModel(item?.name || item?.model || '', plan.model));
    const size = normalizePositiveNumber(entry?.size);
    const { others, sameModelElsewhere } = sharedWith(listing, plan.model, now());
    if (sameModelElsewhere) markShared();
    if (others.length || sameModelElsewhere) return { status: 'shared', loadedModels: others, sameModel: sameModelElsewhere };
    // The model is gone from a listing that Ollama did answer: it has been unloaded since its reply,
    // which Ollama does to make room for another program's model, so the card was not ours alone.
    if (listing && !entry) return { status: 'shared', loadedModels: [], evicted: true };

    const promptTokens = normalizePositiveNumber(reply?.prompt_eval_count) ?? 0;
    stages.push({
      id: stage.id,
      numCtx: stage.numCtx,
      targetTokens: stage.targetTokens,
      status: 'ok',
      promptTokens,
      outputTokens: normalizePositiveNumber(reply?.eval_count) ?? 0,
      readingTps: perSecond(reply?.prompt_eval_count, reply?.prompt_eval_duration),
      writingTps: perSecond(reply?.eval_count, reply?.eval_duration),
      // The cold load happened during calibration, at the first stage's size.
      loadSeconds: (index === 0 ? firstLoadSeconds : 0) + seconds(reply?.load_duration),
      gpuShare: size ? Math.min(1, Math.max(0, (Number(entry.size_vram) || 0) / size)) : null,
      contextReported: normalizePositiveNumber(entry?.context_length),
      passkeyKept: passkeyKept(reply?.response, passkey),
      sizeOk: promptSizeOk(promptTokens, stage.targetTokens),
    });
  }

  return {
    status: 'done',
    stages,
    tokensPerLine: Math.round(sizing.tokensPerLine * 10) / 10,
    numPredict: plan.numPredict,
    ollamaVersion: typeof version?.version === 'string' ? version.version : undefined,
    modelDigest: weightsDigest(show),
    quantization: typeof show?.details?.quantization_level === 'string' ? show.details.quantization_level : undefined,
    machine,
  };
}

module.exports = {
  SIZE_TOLERANCE,
  NEEDLE_POSITION,
  CALIBRATION_LINES,
  buildEndurancePrompt,
  calibrateLines,
  promptSizeOk,
  normalizeEnduranceRequest,
  runEndurance,
};
