// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The pal check's runner: one model plays a person in a short instant-message
 * chat, one line at a time, through Ollama's /api/chat, so every reply is
 * written with the whole conversation so far in front of it.
 *
 * The renderer owns what the check is (src/lib/palCheck.ts: the persona, the
 * lines, the tells it looks for, the verdict). This side checks the request,
 * runs the chat on the local Ollama and hands back what the model wrote.
 *
 * Speed is not what is checked, so another program's copy of the same model
 * may stay loaded and be used. Any other model loaded beside it would share the
 * card, and Ollama might unload another program's model to make room, so the
 * check does not start then. It never pulls a model and unloads only one it
 * loaded itself, however it ends.
 *
 * Pure apart from the calls it is handed, so tests drive it with a fake Ollama.
 */
const { isUnsupportedThinkError: thinkRefused, normalizePositiveNumber } = require('./ollamaRequest.cjs');
const { assertValidModelName } = require('./security.cjs');
const { RIG_KEEP_ALIVE, isOutOfMemory, listedNames, sameModel, weightsDigest } = require('./rigScoreRunner.cjs');

const MAX_LINES = 12;
const MAX_LINE_CHARS = 400;
const MAX_SYSTEM_CHARS = 2000;
/** The first reply loads the model: a big one from a slow disk takes minutes. */
const PAL_LOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** A reply after that is a few sentences, so three minutes is a model that has stopped. */
const PAL_REPLY_TIMEOUT_MS = 3 * 60 * 1000;
/**
 * The same seed and a person's temperature: a chat that reads like one, and
 * the same chat from the same model on the same PC when it is run again.
 */
const PAL_OPTIONS = { temperature: 0.7, seed: 7, num_ctx: 4096, num_predict: 400 };

/** The request, checked: a model name Ollama could hold, a persona and a few short lines. */
function normalizePalRequest(request = {}) {
  const model = assertValidModelName(request.model);
  const system = typeof request.system === 'string' ? request.system.trim() : '';
  if (!system || system.length > MAX_SYSTEM_CHARS) throw new Error(`The pal check needs a persona of 1 to ${MAX_SYSTEM_CHARS} characters.`);
  const lines = Array.isArray(request.lines) ? request.lines : [];
  if (lines.length === 0 || lines.length > MAX_LINES) throw new Error(`The pal check sends 1 to ${MAX_LINES} lines.`);
  for (const line of lines) {
    if (typeof line !== 'string' || !line.trim() || line.length > MAX_LINE_CHARS) throw new Error(`Each pal check line is 1 to ${MAX_LINE_CHARS} characters.`);
  }
  return { model, system, lines: lines.map((line) => line.trim()) };
}

/**
 * Run the chat. Resolves with a status rather than throwing for every outcome
 * a person can meet (not installed, too big, busy, stopped, failed), as
 * runEndurance does, so a screen can say each in its own words.
 *
 * deps:
 *  - request: what the renderer sent (normalizePalRequest checks it)
 *  - baseUrl: the local Ollama
 *  - fetchJson(url, options, timeoutMs): honours options.signal
 *  - readMachine(): { gpu, vramGb, driverVersion, isUnifiedMemory, appVersion }
 *  - unloadModel(baseUrl, model): keep_alive 0, then wait for the card to free
 *  - beforeRun(): frees what RigMatch itself left loaded (Labs, its chat)
 *  - isUnsupportedThinkError(error): an Ollama too old for think:false
 *  - signal: aborts the run (Stop)
 *  - onProgress(update)
 */
async function runPalCheck({
  request,
  baseUrl,
  fetchJson,
  readMachine,
  unloadModel,
  beforeRun = async () => {},
  isUnsupportedThinkError = thinkRefused,
  signal,
  onProgress = () => {},
}) {
  const plan = normalizePalRequest(request);
  if (signal?.aborted) return { status: 'stopped' };
  onProgress({ phase: 'checking' });

  // Set once the first line is sent to a model that was not already loaded: only then is there one of ours to unload.
  let loading = false;
  try {
    const machine = await readMachine();
    const tags = await fetchJson(`${baseUrl}/api/tags`, { signal }, 4000);
    if (!listedNames(tags).some((name) => sameModel(name, plan.model))) return { status: 'not-installed' };

    const [version, show] = await Promise.all([
      fetchJson(`${baseUrl}/api/version`, { signal }, 3000).catch(() => null),
      fetchJson(`${baseUrl}/api/show`, { method: 'POST', body: JSON.stringify({ model: plan.model }), signal }, 8000).catch(() => null),
    ]);

    await beforeRun();
    if (signal?.aborted) return { status: 'stopped' };
    const resident = listedNames(await fetchJson(`${baseUrl}/api/ps`, { signal }, 3000));
    const others = resident.filter((name) => !sameModel(name, plan.model));
    if (others.length) return { status: 'busy', loadedModels: others };
    // Another program has this model loaded: use it, and leave it as it was found.
    const alreadyLoaded = resident.length > 0;

    let thinkSwitch = true;
    const chat = async (messages, timeoutMs) => {
      const body = { model: plan.model, messages, stream: false, think: false, keep_alive: RIG_KEEP_ALIVE, options: PAL_OPTIONS };
      if (!thinkSwitch) delete body.think;
      try {
        return await fetchJson(`${baseUrl}/api/chat`, { method: 'POST', body: JSON.stringify(body), signal }, timeoutMs);
      } catch (error) {
        // An Ollama that predates think:false is asked again without it.
        if (!thinkSwitch || signal?.aborted || !isUnsupportedThinkError(error)) throw error;
        thinkSwitch = false;
        delete body.think;
        return fetchJson(`${baseUrl}/api/chat`, { method: 'POST', body: JSON.stringify(body), signal }, timeoutMs);
      }
    };

    const messages = [{ role: 'system', content: plan.system }];
    const replies = [];
    for (const [index, line] of plan.lines.entries()) {
      if (signal?.aborted) return { status: 'stopped' };
      onProgress({ phase: 'line', index: index + 1, of: plan.lines.length });
      messages.push({ role: 'user', content: line });
      if (!alreadyLoaded) loading = true;
      const reply = await chat(messages, index === 0 ? PAL_LOAD_TIMEOUT_MS : PAL_REPLY_TIMEOUT_MS);
      const text = typeof reply?.message?.content === 'string' ? reply.message.content.trim() : '';
      // Only what was said goes back into the chat, as a person reads only what was sent.
      messages.push({ role: 'assistant', content: text });
      const total = normalizePositiveNumber(reply?.total_duration);
      const load = normalizePositiveNumber(reply?.load_duration);
      replies.push({
        text,
        // Thinking a model could not be stopped from doing (gpt-oss) is not part of the chat, but it explains an empty reply.
        thought: typeof reply?.message?.thinking === 'string' && reply.message.thinking.trim().length > 0,
        seconds: total ? Math.max(0, total - (load ?? 0)) / 1e9 : null,
        tokens: normalizePositiveNumber(reply?.eval_count) ?? 0,
      });
    }

    return {
      status: 'done',
      replies,
      ollamaVersion: typeof version?.version === 'string' ? version.version : undefined,
      modelDigest: weightsDigest(show),
      quantization: typeof show?.details?.quantization_level === 'string' ? show.details.quantization_level : undefined,
      machine,
    };
  } catch (error) {
    if (signal?.aborted) return { status: 'stopped' };
    if (loading && isOutOfMemory(error)) return { status: 'too-big', error: String(error?.message ?? error) };
    return { status: 'failed', error: String(error?.message ?? error) };
  } finally {
    if (loading) {
      onProgress({ phase: 'unloading' });
      try { await unloadModel(baseUrl, plan.model); } catch { /* best effort: keep_alive frees it soon anyway */ }
    }
  }
}

module.exports = {
  PAL_OPTIONS,
  normalizePalRequest,
  runPalCheck,
};
