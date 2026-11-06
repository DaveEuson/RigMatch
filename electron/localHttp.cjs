// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * fetchJson's requests to local services (Ollama, LM Studio, ComfyUI), on
 * node:http rather than fetch.
 *
 * Node's fetch gives up on a response that has sent no headers for 300 seconds
 * (undici's headersTimeout), whatever timeout the caller set, and the "fetch
 * failed" it throws read as "Cannot reach local AI service". The context check
 * and the RigScore warm-up allow ten minutes for a cold load or a long prompt
 * on a slow machine, so a model still working at 300 seconds was reported as
 * Ollama not running. A plain http.request has no such cap, so the caller's
 * timeout is the only one. The command line does the same (cli/ollamaHttp.ts).
 */
const http = require('node:http');
const https = require('node:https');

/**
 * One request, answered the way fetchJson reads a fetch Response: ok, status,
 * statusText and text(). The body is read whole, and a body past maxBytes ends
 * the request with tooLarge(). An abort of `signal` rejects with an
 * AbortError. A service that cannot be reached, or that closes the connection
 * before it has answered, rejects with an error that has a `code`.
 */
function localRequest(url, { method = 'GET', headers = {}, body, signal } = {}, { maxBytes = Infinity, tooLarge = () => new Error('The response was too large') } = {}) {
  return new Promise((resolve, reject) => {
    // A bad address throws a TypeError here, as fetch did, and so rejects.
    const target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new TypeError(`${target.protocol} is not http or https`);
    }
    const aborted = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    if (signal?.aborted) {
      reject(aborted());
      return;
    }

    let settled = false;
    // Why we ended the request ourselves, if we did. Destroying it makes the
    // socket report a reset, and that must not hide the reason.
    let reason = null;
    const onAbort = () => end(aborted());
    const settle = (finish) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      finish();
    };
    const fail = (error) => settle(() => reject(reason ?? error));
    const end = (error) => {
      reason ??= error;
      request.destroy(reason);
    };

    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const request = (target.protocol === 'https:' ? https : http).request({
      // Brackets are how an IPv6 address is written in a URL, not part of it.
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method,
      headers: payload ? { ...headers, 'Content-Length': payload.length } : headers,
      // A fresh connection each time: a pooled one the server has already
      // closed fails the next request with a reset that reads as "cannot reach".
      agent: false,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          end(tooLarge());
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => settle(() => {
        // The whole body can arrive before we end the request over its size.
        if (reason) {
          reject(reason);
          return;
        }
        const text = Buffer.concat(chunks).toString('utf8');
        const status = response.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, statusText: response.statusMessage ?? '', text: async () => text });
      }));
      response.on('error', fail);
      // Closed before the end: we ended it (and say why), or the service went away mid-answer.
      response.on('close', () => fail(Object.assign(new Error('The connection closed before the answer was complete'), { code: 'ECONNRESET' })));
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    request.on('error', fail);
    request.end(payload ?? undefined);
  });
}

module.exports = { localRequest };
