// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

import { loadAppFetchJson } from '../scripts/app-fetch-json.mjs';

/**
 * The app's fetchJson (lifted from main.cjs) on node:http. Node's fetch gave
 * up on any answer that sent no headers for 300 seconds, and that read as
 * "Cannot reach local AI service" while Ollama was still loading or reading a
 * 16K prompt. The 300 seconds themselves were proven once by hand, against a
 * stand-in that answered after 345; these pin what the move must keep.
 */
const fetchJson = loadAppFetchJson();

function serve(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => { server.closeAllConnections(); server.close(done); }),
    }));
  });
}

const reply = (status, body) => (_req, res) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
};

test('fetchJson is not on fetch, whose 300-second wait for headers no timeout can lift', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const start = main.indexOf('async function fetchJson(');
  const source = main.slice(start, main.indexOf('\n}\n', start));
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.match(source, /localRequest\(/);
});

test('it sends JSON, waits as long as it was told, and reads the answer', async () => {
  let seen = null;
  const server = await serve((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen = { method: req.method, type: req.headers['content-type'], length: req.headers['content-length'], body };
      // Headers only after a pause, as a model loading does.
      setTimeout(() => reply(200, '{"response":"hello","done":true}')(req, res), 600);
    });
  });
  try {
    const answer = await fetchJson(`${server.url}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'm' }) }, 5000);
    assert.deepEqual(answer, { response: 'hello', done: true });
    assert.deepEqual(seen, { method: 'POST', type: 'application/json', length: '13', body: '{"model":"m"}' });
    assert.deepEqual(await fetchJson(`${server.url}/api/tags`, {}, 5000), { response: 'hello', done: true });
  } finally {
    await server.close();
  }
  const empty = await serve(reply(200, ''));
  try {
    assert.deepEqual(await fetchJson(`${empty.url}/api/delete`, { method: 'DELETE' }, 2000), {}, 'an empty answer is an empty object');
  } finally {
    await empty.close();
  }
});

test('a service that is not there, or dies mid-answer, cannot be reached; one that hangs is slow, not gone', async () => {
  const gone = await serve(reply(200, '{}'));
  const goneUrl = gone.url;
  await gone.close();
  await assert.rejects(fetchJson(`${goneUrl}/api/tags`, {}, 2000), new RegExp(`^Error: Cannot reach local AI service at ${goneUrl.replace(/\./g, '\\.')}\\. Make sure Ollama`));

  const dies = await serve((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"response":"partial');
    setTimeout(() => res.destroy(), 30);
  });
  try {
    await assert.rejects(fetchJson(`${dies.url}/api/generate`, { method: 'POST', body: '{}' }, 5000), /^Error: Cannot reach local AI service/, 'a cut-off answer is never taken as one');
  } finally {
    await dies.close();
  }

  const hangs = await serve(() => { /* never answers */ });
  try {
    const started = Date.now();
    await assert.rejects(fetchJson(`${hangs.url}/api/generate`, { method: 'POST', body: '{}' }, 1000), /accepted the request but did not finish within 1s\. The service is reachable/);
    assert.ok(Date.now() - started < 3000);
  } finally {
    await hangs.close();
  }
});

test('Stop says it stopped, before or during the request', async () => {
  const hangs = await serve(() => { /* never answers */ });
  try {
    const controller = new AbortController();
    const pending = fetchJson(`${hangs.url}/api/generate`, { method: 'POST', body: '{}', signal: controller.signal }, 10_000);
    setTimeout(() => controller.abort(), 100);
    await assert.rejects(pending, (error) => error.name === 'AbortError' && error.message === 'Request stopped');
    const already = new AbortController();
    already.abort();
    await assert.rejects(fetchJson(`${hangs.url}/api/tags`, { signal: already.signal }, 10_000), { name: 'AbortError', message: 'Request stopped' });
  } finally {
    await hangs.close();
  }
});

test('an error answer keeps its status and the service\'s own words; an oversized one is refused', async () => {
  const failing = await serve(reply(500, '{"error":"model requires more system memory (12.0 GiB) than is available (8.1 GiB)"}'));
  try {
    await assert.rejects(fetchJson(`${failing.url}/api/generate`, { method: 'POST', body: '{}' }, 2000),
      new RegExp(`^Error: 500 Internal Server Error from ${failing.url.replace(/\./g, '\\.')}/api/generate: model requires more system memory`));
  } finally {
    await failing.close();
  }
  const big = await serve(reply(200, JSON.stringify({ response: 'x'.repeat(5000) })));
  try {
    await assert.rejects(fetchJson(`${big.url}/api/generate`, {}, 2000, 1000), new RegExp(`^Error: Response from ${big.url.replace(/\./g, '\\.')}/api/generate was too large$`));
  } finally {
    await big.close();
  }
  await assert.rejects(fetchJson('not a url', {}, 1000), /^Error: Cannot reach local AI service at not a url\./, 'a bad address reads as before');
});
