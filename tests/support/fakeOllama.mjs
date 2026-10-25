// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import http from 'node:http';
import { RIG_REFERENCES, RIG_TIERS } from '../../src/lib/rigScore.ts';

/**
 * A stand-in Ollama on a free port, for the command-line speed test's tests.
 *
 * It answers /api/tags, /api/ps, /api/version, /api/show and /api/generate the
 * way Ollama does, and records every request. What it can do that a plain
 * answer cannot, because each is a way the real one goes wrong:
 *  - releaseMs: a model stays listed in /api/ps this long after being unloaded
 *    (a big model on a slow card takes seconds to leave).
 *  - delayMs: answers /api/generate late.
 *  - stall: never answers /api/generate (a hung model, for Ctrl+C); stallModels: only for these models.
 *
 * A tier model answers at its reference speed and with its reference weights,
 * so a run of it scores 1,000 points; any other model answers at decode and
 * prefill. Speeds are Ollama's own fields: durations in nanoseconds.
 *  - generateError: answers /api/generate with a 500 and this text.
 *  - remote: names listed with a remote host, as Ollama's cloud models are.
 *
 * Not a test file (no .test.mjs), so run-tests does not collect it.
 */
export async function fakeOllama({
  installed = [],
  remote = [],
  loaded = [],
  decode = 128,
  prefill = 3715,
  releaseMs = 0,
  delayMs = 0,
  stall = false,
  stallModels = [],
  generateError = null,
} = {}) {
  const tierOf = (model) => RIG_TIERS.find((entry) => entry.model === model);
  const speedsFor = (model) => {
    const reference = RIG_REFERENCES[tierOf(model)?.id];
    return reference ? { decode: reference.decodeTps, prefill: reference.prefillTps } : { decode, prefill };
  };
  const digestFor = (model) => RIG_REFERENCES[tierOf(model)?.id]?.modelDigest ?? `sha256-${'a'.repeat(64)}`;
  const calls = [];
  const sockets = new Set();
  const farFuture = () => new Date(Date.now() + 5 * 60_000).toISOString();
  const state = { loaded: loaded.map((name) => ({ name, size: 100, size_vram: 100, expires_at: farFuture() })) };
  const stalled = [];

  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = body ? JSON.parse(body) : null;
      calls.push({ path: request.url, body: parsed, authorization: request.headers.authorization ?? null, host: request.headers.host });
      const send = (value, status = 200) => {
        response.statusCode = status;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(value));
      };
      const now = Date.now();
      // A released model leaves when its release time has passed.
      state.loaded = state.loaded.filter((entry) => !entry.releaseAt || entry.releaseAt > now);

      if (request.url === '/api/tags') {
        return send({
          models: [
            ...installed.map((name) => ({ name, model: name, size: 2e9, details: { parameter_size: '3B' } })),
            ...remote.map((name) => ({ name, model: name, size: 400, remote_model: name, remote_host: 'https://ollama.com:443', details: { parameter_size: '120B' } })),
          ],
        });
      }
      if (request.url === '/api/ps') return send({ models: state.loaded.map((entry) => ({ name: entry.name, size: entry.size, size_vram: entry.size_vram, expires_at: entry.expires_at })) });
      if (request.url === '/api/version') return send({ version: '0.35.1' });
      if (request.url === '/api/show') {
        return send({ modelfile: `FROM /models/blobs/${digestFor(parsed?.model)}`, details: { quantization_level: 'Q4_K_M' } });
      }
      if (request.url === '/api/generate') {
        if (parsed.keep_alive === 0) {
          if (releaseMs > 0) {
            state.loaded = state.loaded.map((entry) => (entry.name === parsed.model ? { ...entry, releaseAt: now + releaseMs } : entry));
          } else {
            state.loaded = state.loaded.filter((entry) => entry.name !== parsed.model);
          }
          return send({ done: true });
        }
        if (generateError) return send({ error: generateError }, 500);
        state.loaded = [
          ...state.loaded.filter((entry) => entry.name !== parsed.model),
          { name: parsed.model, size: 100, size_vram: 100, expires_at: new Date(Date.now() + 110_000).toISOString() },
        ];
        if (stall || stallModels.includes(parsed.model)) { stalled.push(response); return undefined; }
        const speeds = speedsFor(parsed.model);
        const answer = () => send({
          prompt_eval_count: 1486,
          prompt_eval_duration: (1486 / speeds.prefill) * 1e9,
          eval_count: 256,
          eval_duration: (256 / speeds.decode) * 1e9,
          load_duration: 1e9,
          done: true,
        });
        return delayMs > 0 ? setTimeout(answer, delayMs) : answer();
      }
      return send({ error: 'not found' }, 404);
    });
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  return {
    calls,
    state,
    port,
    /** The value for OLLAMA_HOST. */
    host: `127.0.0.1:${port}`,
    url: `http://127.0.0.1:${port}`,
    /** The /api/generate requests that loaded a model, and those that unloaded one. */
    loads: () => calls.filter((call) => call.path === '/api/generate' && call.body?.keep_alive !== 0).map((call) => call.body.model),
    unloads: () => calls.filter((call) => call.path === '/api/generate' && call.body?.keep_alive === 0).map((call) => call.body.model),
    /** A /api/generate request has arrived and is being held (stall). */
    waitForStall: async (timeoutMs = 10_000) => {
      const until = Date.now() + timeoutMs;
      while (!stalled.length && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
      return stalled.length > 0;
    },
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}
