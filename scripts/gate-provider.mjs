#!/usr/bin/env node
/**
 * The "provider dies mid-run" gate.
 *
 * A benchmark is a long sequence of HTTP calls to a local Ollama. If that
 * process goes away — crash, quit, out of memory, laptop sleep — the run must
 * fail with something a person can read, and must never sit there looking busy
 * for ever. A frozen game show with no explanation was the exact complaint the
 * failure-message plumbing was added for.
 *
 * Rather than killing the user's own Ollama, this stands up a fake one on a
 * loopback port and makes it misbehave in the three ways that matter. The
 * request pattern is the app's own: main.cjs routes every benchmark call
 * through fetchJson, which arms an AbortController with a timeout and throws
 * on a non-OK status. Both of those are asserted against the source first, so
 * this cannot drift into testing a pattern the app no longer uses.
 *
 * Usage:  node scripts/gate-provider.mjs
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const results = [];
const record = (name, ok, note) => {
  results.push({ name, ok, note });
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

console.log('Provider-death gate\n');

// ── 0. The app still uses the pattern this gate exercises ──────────────────
const main = readFileSync('electron/main.cjs', 'utf-8');
{
  const usesFetchJson = /runBenchmarkPromptParity[\s\S]{0,900}?fetchJson\(/.test(main);
  record('the benchmark path goes through fetchJson', usesFetchJson,
    usesFetchJson ? '' : 'it does not, so nothing below describes the app');
  const armsTimeout = /async function fetchJson[\s\S]{0,400}?setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/.test(main);
  record('fetchJson arms an abort timeout', armsTimeout);
  const throwsOnNotOk = /async function fetchJson[\s\S]{0,1400}?if \(!response\.ok\)[\s\S]{0,200}?throw new Error/.test(main);
  record('fetchJson throws on a non-OK status', throwsOnNotOk);
  const passesBenchmarkTimeout = /runBenchmarkPromptParity[\s\S]{0,1200}?BENCHMARK_TIMEOUT_MS/.test(main);
  record('the benchmark passes its own timeout, not the 2.5s default', passesBenchmarkTimeout);
}

/** The app's own helper, reproduced exactly enough to exercise the behaviour. */
async function appFetchJson(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${response.status} ${response.statusText} from ${new URL(url).host}${detail ? `: ${detail.slice(0, 80)}` : ''}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** A fake Ollama that behaves badly on demand. */
function fakeOllama(mode) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (mode === 'die-mid-response') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"response":"partial');
        // Destroy the socket without finishing the body: what a crashed or
        // killed provider looks like from the client's side.
        setTimeout(() => res.destroy(), 50);
        return;
      }
      if (mode === 'hang') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Never write, never end.
        return;
      }
      if (mode === 'server-error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('model runner has crashed');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"response":"fine","done":true}');
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const attempt = async (mode, timeoutMs) => {
  const { server, port } = await fakeOllama(mode);
  const startedAt = Date.now();
  let outcome;
  try {
    const value = await appFetchJson(`http://127.0.0.1:${port}/api/generate`, { method: 'POST', body: '{}' }, timeoutMs);
    outcome = { ok: true, value };
  } catch (error) {
    outcome = { ok: false, name: error?.name, message: String(error?.message ?? error) };
  }
  await new Promise((done) => server.close(done));
  return { ...outcome, elapsed: Date.now() - startedAt };
};

// ── 1. The provider dies mid-response ──────────────────────────────────────
{
  const outcome = await attempt('die-mid-response', 5000);
  const failedFast = !outcome.ok && outcome.elapsed < 4000;
  record('a provider that dies mid-response fails, and fails quickly', failedFast,
    `${outcome.ok ? 'it SUCCEEDED, which means a truncated answer was accepted' : outcome.name} after ${outcome.elapsed}ms`);
}

// ── 2. The provider hangs ──────────────────────────────────────────────────
{
  const outcome = await attempt('hang', 1500);
  const timedOut = !outcome.ok && outcome.elapsed >= 1400 && outcome.elapsed < 6000;
  record('a provider that hangs is cut off by the timeout', timedOut,
    `${outcome.name ?? 'resolved'} after ${outcome.elapsed}ms (timeout was 1500ms)`);
}

// ── 3. The provider answers with an error ──────────────────────────────────
{
  const outcome = await attempt('server-error', 5000);
  const readable = !outcome.ok && /500/.test(outcome.message) && /crashed/.test(outcome.message);
  record('a provider error carries its status and reason', readable,
    outcome.ok ? 'a 500 was treated as success' : `"${outcome.message.slice(0, 70)}"`);
}

// ── 4. The failure actually reaches the beginner ───────────────────────────
{
  const wizard = readFileSync('src/components/SimpleWizard.tsx', 'utf-8');
  const carriesMessage = /message\?: string/.test(wizard);
  const rendersMessage = /runProgress\?\.message/.test(wizard);
  record('Simple Mode receives a failure message', carriesMessage);
  record('Simple Mode renders it instead of the next question', rendersMessage,
    rendersMessage ? '' : 'a dead run would keep saying the host is lining up the next question');
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0
  ? `\nGate closed: ${results.length} checks passed.`
  : `\nGate OPEN: ${failed.length} of ${results.length} failed.`);
// exitCode rather than process.exit(): forcing exit while the fake servers'
// handles are still closing makes libuv print an assertion failure AFTER the
// result, which reads like the gate itself crashed.
process.exitCode = failed.length === 0 ? 0 : 1;
