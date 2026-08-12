/**
 * Transport for ComfyUI, the image-generation runtime.
 *
 * Deliberately thin. The workflow graph is built in the renderer by
 * src/lib/comfyui.ts, which is unit tested, and this module only carries it to
 * the server and carries the reply back. Putting the graph construction here
 * would move the interesting logic into a file that no test can reach, and
 * would also make user-supplied workflows a rewrite instead of a pass-through.
 *
 * The renderer cannot call ComfyUI directly: its origin is not one ComfyUI's
 * CORS policy accepts, the same reason the chat app routes Ollama through Rust.
 */

const DEFAULT_TIMEOUT_MS = 10000;
/** A decoded 1024px PNG runs to a few MB; this is the ceiling before refusing. */
const IMAGE_MAX_BYTES = 32 * 1024 * 1024;

/** Strips a trailing slash so `${base}/view` never becomes `//view`. */
function origin(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

function createComfyBridge({ fetchJson, assertLocalhostUrl }) {
  async function getStatus(baseUrl, timeoutMs = 3000) {
    assertLocalhostUrl(baseUrl);
    const base = origin(baseUrl);

    // A build that answers /system_stats is running; the checkpoint list is a
    // second call because a server with no models installed is still reachable
    // and the user needs to be told those two things apart.
    const stats = await fetchJson(`${base}/system_stats`, {}, timeoutMs);

    // Older builds do not expose /models/{folder}, and none of these are worth
    // calling the server down over. Reachability is what /system_stats settled.
    const listStrings = async (path) => {
      try {
        const listed = await fetchJson(`${base}${path}`, {}, timeoutMs);
        return Array.isArray(listed) ? listed.filter((n) => typeof n === 'string') : [];
      } catch {
        return [];
      }
    };
    const [checkpoints, textEncoders] = await Promise.all([
      listStrings('/models/checkpoints'),
      listStrings('/models/text_encoders'),
    ]);

    // Queue depth, so a run can refuse rather than share a GPU with whatever
    // the user is already rendering.
    let execInfo = null;
    try {
      execInfo = await fetchJson(`${base}/prompt`, {}, timeoutMs);
    } catch {
      // Treated as idle: failing to read the queue must not block a run.
    }

    return { reachable: true, stats, checkpoints, textEncoders, execInfo };
  }

  async function submit(baseUrl, graph, clientId) {
    assertLocalhostUrl(baseUrl);
    if (!graph || typeof graph !== 'object') throw new Error('No workflow graph was supplied.');

    const body = JSON.stringify({ prompt: graph, client_id: clientId || 'rigmatch' });
    const result = await fetchJson(`${origin(baseUrl)}/prompt`, { method: 'POST', body }, DEFAULT_TIMEOUT_MS);

    // ComfyUI answers 200 with node_errors populated when the graph is
    // structurally valid but references something missing, so a bad checkpoint
    // name arrives here rather than as an HTTP error.
    const nodeErrors = result?.node_errors;
    if (nodeErrors && Object.keys(nodeErrors).length) {
      throw new Error(`ComfyUI rejected the workflow: ${describeNodeErrors(nodeErrors)}`);
    }
    if (!result?.prompt_id) throw new Error('ComfyUI accepted the workflow but returned no prompt id.');
    return { promptId: result.prompt_id };
  }

  function describeNodeErrors(nodeErrors) {
    const parts = [];
    for (const [nodeId, detail] of Object.entries(nodeErrors)) {
      const errors = Array.isArray(detail?.errors) ? detail.errors : [];
      const first = errors[0];
      parts.push(`node ${nodeId}${first?.message ? `: ${first.message}` : ''}`);
    }
    return parts.join('; ') || 'no detail given';
  }

  async function getHistory(baseUrl, promptId, timeoutMs = DEFAULT_TIMEOUT_MS) {
    assertLocalhostUrl(baseUrl);
    if (!promptId) throw new Error('No prompt id to look up.');
    return fetchJson(`${origin(baseUrl)}/history/${encodeURIComponent(promptId)}`, {}, timeoutMs);
  }

  /**
   * Fetch a produced image as a data URL.
   *
   * Not JSON, so it bypasses fetchJson entirely — reading a PNG through a JSON
   * parser would corrupt it.
   */
  async function getImage(baseUrl, ref, timeoutMs = 30000) {
    assertLocalhostUrl(baseUrl);
    if (!ref?.filename) throw new Error('No image filename to fetch.');

    const query = new URLSearchParams({
      filename: String(ref.filename),
      subfolder: String(ref.subfolder ?? ''),
      type: String(ref.type ?? 'output'),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${origin(baseUrl)}/view?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`${response.status} fetching the generated image.`);

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > IMAGE_MAX_BYTES) throw new Error('The generated image was too large to load.');

      const mime = response.headers.get('content-type') || 'image/png';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Timed out fetching the generated image.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Unload models and drop cached node outputs.
   *
   * Called before a timed run, and it does two jobs. It gives a VRAM reading
   * attributable to this run rather than to whatever was left resident — the
   * spike without it reported a 1024x768 video using less memory than a
   * 768x512 one, which is impossible. And it evicts ComfyUI's execution cache,
   * without which resubmitting an identical graph returns the previous result
   * in about two seconds; a fixed-seed benchmark would report that as the
   * generation time on every run after the first.
   */
  async function free(baseUrl, { unloadModels = true, freeMemory = true } = {}) {
    assertLocalhostUrl(baseUrl);
    await fetchJson(
      `${origin(baseUrl)}/free`,
      { method: 'POST', body: JSON.stringify({ unload_models: unloadModels, free_memory: freeMemory }) },
      DEFAULT_TIMEOUT_MS,
    );
    return { freed: true };
  }

  /**
   * Stop a run.
   *
   * Without a prompt id ComfyUI interrupts whatever is executing, so the id is
   * always sent — a Stop must not cancel a different job the user started from
   * ComfyUI's own interface.
   */
  async function interrupt(baseUrl, promptId) {
    assertLocalhostUrl(baseUrl);
    const body = JSON.stringify(promptId ? { prompt_id: promptId } : {});
    await fetchJson(`${origin(baseUrl)}/interrupt`, { method: 'POST', body }, DEFAULT_TIMEOUT_MS);
    return { stopped: true };
  }

  return { getStatus, submit, getHistory, getImage, interrupt, free };
}

module.exports = { createComfyBridge, describeComfyOrigin: origin };
