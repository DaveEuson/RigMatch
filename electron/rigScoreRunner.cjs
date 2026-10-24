// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * RigScore's runner: one tier's fixed workload, timed on this PC.
 *
 * The renderer owns what the test is (src/lib/rigScore.ts: the tier, the
 * passage, the options) and turns the timings into a score. This side asks
 * Ollama, in order: is the model here, is anything else loaded, then a warm-up
 * and the timed runs, and reads Ollama's own timings from each reply, the same
 * four the benchmark records (eval_count, eval_duration, prompt_eval_duration,
 * load_duration) plus prompt_eval_count, which the prompt half needs.
 *
 * It never pulls a model. A missing one comes back as "not-installed" and the
 * screen offers the download through the same consent dialog as any other.
 *
 * Pure apart from the calls it is handed (fetchJson, the machine reading, the
 * unload), so tests drive it with a fake Ollama.
 */
const { buildBenchmarkGenerateBody, normalizePositiveNumber } = require('./benchmarkScoring.cjs');
const { assertValidModelName } = require('./security.cjs');

const RIG_TIER_IDS = new Set(['light', 'standard', 'heavy', 'extreme']);
/**
 * Long enough to carry the model from one run to the next, short enough that a
 * run cut off by a crash frees the card soon after. The runner unloads the
 * model itself when it finishes, however it finishes.
 */
const RIG_KEEP_ALIVE = '2m';
/** The warm-up loads the model: 18 GB from a slow disk takes minutes. */
const RIG_LOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** A timed run on a card that spilled into system memory can run at 2 tok/s. */
const RIG_RUN_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PROMPT_CHARS = 40000;

function wholeNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * The request, checked: a known tier, a model name Ollama could hold, one
 * prompt per run, and only the options that shape the work. Anything else the
 * renderer sent is dropped rather than passed on to Ollama.
 */
function normalizeRigRequest(request = {}) {
  if (!RIG_TIER_IDS.has(request.tier)) throw new Error('Unknown RigScore tier.');
  const model = assertValidModelName(request.model);
  const warmupRuns = wholeNumber(request.warmupRuns, 0, 2, 1);
  const measuredRuns = wholeNumber(request.measuredRuns, 1, 5, 3);
  const prompts = Array.isArray(request.prompts)
    ? request.prompts.filter((prompt) => typeof prompt === 'string' && prompt.length > 0 && prompt.length <= MAX_PROMPT_CHARS)
    : [];
  if (prompts.length !== warmupRuns + measuredRuns) throw new Error('The speed test needs one prompt for each run.');
  const options = request.options ?? {};
  return {
    tier: request.tier,
    model,
    prompts,
    warmupRuns,
    measuredRuns,
    minVramGb: boundedNumber(request.minVramGb, 0, 1024, 0),
    options: {
      num_ctx: wholeNumber(options.num_ctx, 512, 32768, 4096),
      num_predict: wholeNumber(options.num_predict, 16, 2048, 256),
      temperature: boundedNumber(options.temperature, 0, 2, 0),
      seed: wholeNumber(options.seed, 0, 2 ** 31 - 1, 1),
    },
  };
}

const seconds = (nanoseconds) => {
  const value = normalizePositiveNumber(nanoseconds);
  return value == null ? 0 : value / 1_000_000_000;
};

/** One reply's timings, in the shape src/lib/rigScore.ts measures (RigRun). */
function readRigRun(reply = {}) {
  return {
    promptEvalCount: normalizePositiveNumber(reply.prompt_eval_count) ?? 0,
    promptEvalSeconds: seconds(reply.prompt_eval_duration),
    evalCount: normalizePositiveNumber(reply.eval_count) ?? 0,
    evalSeconds: seconds(reply.eval_duration),
    loadSeconds: seconds(reply.load_duration),
  };
}

/**
 * The digest of the weights file itself, from the modelfile's FROM line.
 *
 * Not the tag's digest from /api/tags: that one covers the manifest, which
 * changes when a licence or template is edited while the weights stay the
 * same. Only the hash goes in the stamp, never the path in front of it.
 */
function weightsDigest(show) {
  const from = String(show?.modelfile ?? '').split(/\r?\n/).find((line) => /^FROM\s/i.test(line)) ?? '';
  const hash = from.match(/sha256[-:]([0-9a-f]{64})/i);
  return hash ? `sha256-${hash[1].toLowerCase()}` : undefined;
}

/** Whether a name Ollama lists is the model asked for. A bare name means its :latest. */
function sameModel(name, model) {
  const want = model.includes(':') ? model : `${model}:latest`;
  return name === want || name === model;
}

function listedNames(listing) {
  return (Array.isArray(listing?.models) ? listing.models : [])
    .map((entry) => entry?.name || entry?.model)
    .filter((name) => typeof name === 'string' && name);
}

/** Ollama's ways of saying a model does not fit in memory. */
function isOutOfMemory(error) {
  return /requires more system memory|out of memory|not enough memory|insufficient memory|cudamalloc failed|unable to allocate/i
    .test(String(error?.message ?? error ?? ''));
}

/**
 * Run one tier. Resolves with a status rather than throwing for every outcome
 * a person can meet (not installed, too big, busy, stopped, failed), so the
 * screen can say each in its own words.
 *
 * deps:
 *  - request: what the renderer sent (normalizeRigRequest checks it)
 *  - baseUrl: the local Ollama
 *  - fetchJson(url, options, timeoutMs): main.cjs's, which honours options.signal
 *  - readMachine(): { gpu, vramGb, driverVersion, isUnifiedMemory, appVersion }
 *  - unloadModel(baseUrl, model): keep_alive 0, then wait for the card to free
 *  - beforeRun(): frees what RigMatch itself left loaded (Labs' models)
 *  - isUnsupportedThinkError(error): an Ollama too old for think:false
 *  - signal: aborts the run (Stop)
 *  - onProgress(update)
 */
async function runRigTier({
  request,
  baseUrl,
  fetchJson,
  readMachine,
  unloadModel,
  beforeRun = async () => {},
  isUnsupportedThinkError = () => false,
  signal,
  onProgress = () => {},
}) {
  const plan = normalizeRigRequest(request);
  if (signal?.aborted) return { status: 'stopped' };
  onProgress({ phase: 'checking' });

  const machine = await readMachine();
  // The screen offers only the tiers that fit; this is the same rule, checked
  // again with a fresh reading, so a stale screen cannot measure a spill.
  if (!machine.isUnifiedMemory && plan.minVramGb > 0 && !(Number(machine.vramGb) >= plan.minVramGb)) {
    return { status: 'too-big', machine };
  }

  const tags = await fetchJson(`${baseUrl}/api/tags`, { signal }, 4000);
  if (!listedNames(tags).some((name) => sameModel(name, plan.model))) return { status: 'not-installed' };

  const [version, show] = await Promise.all([
    fetchJson(`${baseUrl}/api/version`, { signal }, 3000).catch(() => null),
    fetchJson(`${baseUrl}/api/show`, { method: 'POST', body: JSON.stringify({ model: plan.model }), signal }, 8000).catch(() => null),
  ]);

  // Another model in memory shares the card and slows this one, so the test
  // would measure the two together. RigMatch's own leftovers are freed; a
  // model something else loaded is that program's, and is left alone.
  await beforeRun();
  const resident = listedNames(await fetchJson(`${baseUrl}/api/ps`, { signal }, 3000).catch(() => null));
  const others = resident.filter((name) => !sameModel(name, plan.model));
  if (others.length) return { status: 'busy', loadedModels: others };
  // Already loaded (a chat with it, say): unloaded first, so the load is timed.
  if (resident.length) await unloadModel(baseUrl, plan.model);

  let thinkSwitch = true;
  const generate = async (prompt, timeoutMs) => {
    const body = buildBenchmarkGenerateBody({ model: plan.model, prompt, keepAlive: RIG_KEEP_ALIVE, options: plan.options });
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

  const runs = [];
  let coldLoadSeconds = null;
  let gpuShare = null;
  try {
    for (let index = 0; index < plan.prompts.length; index += 1) {
      if (signal?.aborted) return { status: 'stopped' };
      const warmup = index < plan.warmupRuns;
      onProgress(warmup
        ? { phase: 'loading' }
        : { phase: 'run', run: index - plan.warmupRuns + 1, of: plan.measuredRuns });
      const reply = await generate(plan.prompts[index], index === 0 ? RIG_LOAD_TIMEOUT_MS : RIG_RUN_TIMEOUT_MS);
      if (index === 0) {
        coldLoadSeconds = seconds(reply?.load_duration) || null;
        // How much of the model sits on the graphics card. Below all of it,
        // the rest runs from system memory and the speed says so.
        const loaded = await fetchJson(`${baseUrl}/api/ps`, { signal }, 3000).catch(() => null);
        const entry = (loaded?.models ?? []).find((item) => sameModel(item?.name || item?.model || '', plan.model));
        const size = normalizePositiveNumber(entry?.size);
        if (size) gpuShare = Math.min(1, Math.max(0, (Number(entry.size_vram) || 0) / size));
      }
      if (!warmup) runs.push(readRigRun(reply));
    }
  } catch (error) {
    if (signal?.aborted) return { status: 'stopped' };
    if (isOutOfMemory(error)) return { status: 'too-big', machine, error: String(error?.message ?? error) };
    return { status: 'failed', error: String(error?.message ?? error) };
  } finally {
    onProgress({ phase: 'unloading' });
    try { await unloadModel(baseUrl, plan.model); } catch { /* best effort: keep_alive frees it soon anyway */ }
  }

  return {
    status: 'done',
    runs,
    coldLoadSeconds,
    gpuShare,
    ollamaVersion: typeof version?.version === 'string' ? version.version : undefined,
    modelDigest: weightsDigest(show),
    quantization: typeof show?.details?.quantization_level === 'string' ? show.details.quantization_level : undefined,
    machine,
  };
}

module.exports = {
  RIG_KEEP_ALIVE,
  normalizeRigRequest,
  readRigRun,
  weightsDigest,
  sameModel,
  isOutOfMemory,
  runRigTier,
};
