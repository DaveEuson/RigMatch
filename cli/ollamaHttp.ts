// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The CLI's requests to Ollama, on node:http rather than fetch.
 *
 * Node's fetch gives up on a response that has sent no headers for 300 seconds
 * (undici's headersTimeout), whatever timeout the caller asked for. The speed
 * test's first request loads the model and answers only when the warm-up has
 * finished, and rigScoreRunner.cjs allows that ten minutes, for a model that
 * loads from a slow disk or spills into system memory. A stand-in that answered
 * after 310 seconds ended the test at 308 with "fetch failed". A plain
 * http.request has no such cap, so the timeout here is the one asked for.
 */
import http from 'node:http';
import https from 'node:https';
import type { InstalledModel } from './fitCheck.ts';

export type FetchOptions = { method?: string; body?: string; signal?: AbortSignal };

/** A response past this is not Ollama's: the app's own cap (main.cjs JSON_RESPONSE_MAX_BYTES). */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export const toGb = (bytes: number) => Math.round((bytes / 1024 ** 3) * 10) / 10;

function describeTimeout(timeoutMs: number): string {
  if (timeoutMs < 1000) return `${timeoutMs} ms`;
  if (timeoutMs < 60_000) return `${Math.round(timeoutMs / 1000)} s`;
  const minutes = Math.round(timeoutMs / 60_000);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * A JSON request, abortable by `signal` (Ctrl+C) and by a timeout. The shape
 * rigScoreRunner.cjs expects of main.cjs's fetchJson: a stop says so ("Request
 * stopped", an AbortError), a timeout names how long it waited, and Ollama's
 * own error text is kept, so "requires more system memory" reads as too big.
 *
 * Built from the parsed address, never the raw string: any user name in
 * OLLAMA_HOST ("evil@localhost") is dropped rather than sent as a password.
 */
export function fetchJson(url: string, options: FetchOptions = {}, timeoutMs = 4000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      reject(new Error(`"${url}" is not a web address.`));
      return;
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      reject(new Error('Ollama is reached over http or https.'));
      return;
    }
    const stopped = () => Object.assign(new Error('Request stopped'), { name: 'AbortError' });
    if (options.signal?.aborted) {
      reject(stopped());
      return;
    }

    let done = false;
    // Why we ended it ourselves, if we did: a stop, a timeout, a response too
    // big. Destroying the request makes the response report that it was cut
    // off, and that must not hide the reason.
    let reason: Error | undefined;
    const settle = (finish: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      finish();
    };
    const endWith = (error: Error) => {
      reason ??= error;
      request.destroy(reason);
    };
    const request = (target.protocol === 'https:' ? https : http).request({
      // Brackets are part of how an IPv6 address is written, not of the address.
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(options.body) } : {},
      // A fresh connection each time: nothing pooled to keep the process alive.
      agent: false,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          endWith(new Error('Ollama sent a response too large to be its own.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', (error) => settle(() => reject(reason ?? error)));
      response.on('end', () => settle(() => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          let detail = text.slice(0, 300);
          try { detail = String((JSON.parse(text) as { error?: unknown }).error ?? detail); } catch { /* not JSON */ }
          const head = [status, response.statusMessage].filter(Boolean).join(' ');
          reject(new Error(`${head} from Ollama: ${detail}`));
          return;
        }
        try {
          resolve(text ? JSON.parse(text) : {});
        } catch {
          reject(new Error('Ollama sent something that is not JSON.'));
        }
      }));
      // Cut off before the end: we ended it (and say why), or the server closed.
      response.on('close', () => settle(() => reject(reason ?? new Error('Ollama closed the connection before it finished answering.'))));
    });

    const timer = setTimeout(() => {
      const hint = timeoutMs >= 5 * 60_000 ? ' A model that loads from a slow disk, or does not fit on the card, can take that long: try a smaller one.' : '';
      endWith(Object.assign(new Error(`Ollama did not finish within ${describeTimeout(timeoutMs)}.${hint}`), { name: 'TimeoutError' }));
    }, timeoutMs);
    const onAbort = () => endWith(stopped());
    options.signal?.addEventListener('abort', onAbort, { once: true });

    request.on('error', (error) => settle(() => reject(reason ?? error)));
    request.end(options.body);
  });
}

/**
 * The installed models, or null when Ollama does not answer within a second
 * and a half. A model with a remote host is one of Ollama's cloud models: it
 * is listed here like any other, but runs on Ollama's servers.
 */
export async function installedOllamaModels(baseUrl: string): Promise<InstalledModel[] | null> {
  try {
    const body = await fetchJson(`${baseUrl}/api/tags`, {}, 1500) as {
      models?: Array<{ name?: string; size?: number; remote_host?: string; details?: { parameter_size?: string } }>;
    };
    return (body.models ?? [])
      .filter((model) => typeof model.name === 'string' && model.name)
      .map((model) => ({
        name: String(model.name),
        sizeGb: toGb(Number(model.size) || 0),
        params: model.details?.parameter_size,
        ...(model.remote_host ? { remote: true } : {}),
      }));
  } catch {
    return null;
  }
}
