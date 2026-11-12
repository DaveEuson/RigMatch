// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The scoreboard: shared Speed score results in, a board per tier out. Runs as
 * a Cloudflare Worker (worker.ts) on its D1 database.
 *
 *   POST /v1/results  one result (src/lib/rigScoreSubmit.ts), checked and kept
 *   GET  /v1/cards    a tier's board: per graphics card, how many results and
 *                     their median speeds and points
 *
 * Anonymous by construction. Only the checked fields are stored, with the day
 * they arrived and not the time. A sender's address is never stored: for the
 * day, a hash of it mixed with a random value counts sends per address, and
 * both are deleted once the day (UTC) is over. See PRIVACY.md.
 */
import { RIG_HEADLINE_TIER, RIG_REFERENCES, RIG_TIERS, median, type RigTierId } from '../src/lib/rigScore.ts';
import { boardFilter, boardPoints, checkSubmission, type RigSubmission } from '../src/lib/rigScoreSubmit.ts';

/** The parts of Cloudflare's D1 binding the scoreboard uses. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}
export type Env = { DB: D1Database };

/** A result is under 1 KB; anything this size is not one. */
export const MAX_BODY_BYTES = 4096;
/** All four tiers, run a few times over: plenty for one person, a wall for a script. */
export const SENDS_PER_DAY = 30;
const MAX_CARDS = 200;
const PRIVACY_URL = 'https://github.com/DaveEuson/RigMatch/blob/main/scoreboard/PRIVACY.md';

export type BoardCard = {
  gpu: string;
  /** Rounded to a whole GB, so 11.99 and 12 count as one card. */
  vramGb: number | null;
  results: number;
  decodeTps: number;
  prefillTps: number;
  /** Against the tier's reference machine (1000); null while the tier has none. */
  points: number | null;
};

export type Board = {
  tier: RigTierId;
  model: string;
  workloadVersion: number;
  reference: { gpu: string; vramGb: number; points: 1000 } | null;
  cards: BoardCard[];
};

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

const today = () => new Date().toISOString().slice(0, 10);

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The body as text, or null when it is larger than a result could be. */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Deletes every send count and random value from before today. */
export async function forgetOldSends(db: D1Database, day = today()): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM sends_today WHERE day < ?').bind(day),
    db.prepare('DELETE FROM day_salt WHERE day < ?').bind(day),
  ]);
}

/** This send's number today from the same address, counted without keeping the address. */
async function countSend(db: D1Database, address: string, day: string): Promise<number> {
  await db.prepare('INSERT OR IGNORE INTO day_salt (day, salt) VALUES (?, ?)').bind(day, hex(crypto.getRandomValues(new Uint8Array(16)))).run();
  const row = await db.prepare('SELECT salt FROM day_salt WHERE day = ?').bind(day).first<{ salt: string }>();
  if (!row?.salt) throw new Error('No salt for today.');
  const key = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${row.salt}|${address}`)));
  const counted = await db.prepare(
    'INSERT INTO sends_today (key, day, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count',
  ).bind(key, day).first<{ count: number }>();
  return counted?.count ?? 1;
}

async function saveResult(db: D1Database, result: RigSubmission, day: string): Promise<boolean> {
  const saved = await db.prepare(
    `INSERT OR IGNORE INTO results (
      id, received_on, tier, model, model_digest, quantization, workload_version, num_ctx,
      prefill_tps, decode_tps, load_seconds, gpu_share, gpu, vram_gb, driver_version, ollama_version, app_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    result.id, day, result.tier, result.model, result.modelDigest, result.quantization, result.workloadVersion, result.numCtx,
    result.prefillTps, result.decodeTps, result.loadSeconds, result.gpuShare, result.gpu, result.vramGb,
    result.driverVersion, result.ollamaVersion, result.appVersion,
  ).run();
  return saved.meta.changes > 0;
}

async function receive(request: Request, env: Env): Promise<Response> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return reply(415, { error: 'Send the result as JSON.' });
  }
  const text = await readCapped(request, MAX_BODY_BYTES);
  if (text === null) return reply(413, { error: 'That is larger than a result.' });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return reply(400, { error: 'Not a result.' });
  }
  const checked = checkSubmission(raw);
  if (!checked.ok) return reply(400, { error: checked.error });

  const day = today();
  await forgetOldSends(env.DB, day);
  const sends = await countSend(env.DB, request.headers.get('cf-connecting-ip') ?? 'unknown', day);
  if (sends > SENDS_PER_DAY) return reply(429, { error: 'That is a lot of results from one place today. Try again tomorrow.' });

  return await saveResult(env.DB, checked.submission, day)
    ? reply(201, { status: 'saved' })
    : reply(200, { status: 'duplicate' });
}

type BoardRow = { gpu: string; vram_gb: number | null; prefill_tps: number; decode_tps: number };

/** A tier's board: the results that measured the reference's work, grouped by card. */
export async function buildBoard(db: D1Database, tierId: RigTierId): Promise<Board> {
  const tier = RIG_TIERS.find((entry) => entry.id === tierId) ?? RIG_TIERS[0];
  const filter = boardFilter(tier.id);
  const where = ['tier = ?', 'workload_version = ?', 'num_ctx = ?', 'hidden = 0'];
  const values: unknown[] = [tier.id, filter.workloadVersion, filter.numCtx];
  if (filter.modelDigest) {
    where.push('model_digest = ?');
    values.push(filter.modelDigest);
  }
  if (filter.quantization) {
    where.push('quantization = ?');
    values.push(filter.quantization);
  }
  const { results: rows } = await db.prepare(
    `SELECT gpu, vram_gb, prefill_tps, decode_tps FROM results WHERE ${where.join(' AND ')}`,
  ).bind(...values).all<BoardRow>();

  const groups = new Map<string, { gpu: string; vramGb: number | null; prefill: number[]; decode: number[] }>();
  for (const row of rows) {
    const vramGb = row.vram_gb === null ? null : Math.round(row.vram_gb);
    const key = `${row.gpu}|${vramGb ?? ''}`;
    const group = groups.get(key) ?? { gpu: row.gpu, vramGb, prefill: [], decode: [] };
    group.prefill.push(row.prefill_tps);
    group.decode.push(row.decode_tps);
    groups.set(key, group);
  }

  const cards = [...groups.values()].map((group): BoardCard => {
    const prefillTps = median(group.prefill);
    const decodeTps = median(group.decode);
    return {
      gpu: group.gpu,
      vramGb: group.vramGb,
      results: group.prefill.length,
      decodeTps: Math.round(decodeTps * 10) / 10,
      prefillTps: Math.round(prefillTps),
      points: boardPoints(tier.id, { prefillTps, decodeTps }),
    };
  }).sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || b.decodeTps - a.decodeTps);

  const reference = RIG_REFERENCES[tier.id];
  return {
    tier: tier.id,
    model: tier.model,
    workloadVersion: filter.workloadVersion,
    reference: reference ? { gpu: reference.gpu, vramGb: reference.vramGb, points: 1000 } : null,
    cards: cards.slice(0, MAX_CARDS),
  };
}

async function cards(url: URL, env: Env): Promise<Response> {
  const asked = url.searchParams.get('tier') ?? RIG_HEADLINE_TIER;
  const tier = RIG_TIERS.find((entry) => entry.id === asked);
  if (!tier) return reply(400, { error: `Unknown tier. Ask for one of: ${RIG_TIERS.map((entry) => entry.id).join(', ')}.` });
  return reply(200, await buildBoard(env.DB, tier.id), {
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=300',
  });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/v1/results') {
      // No CORS headers: a web page can't send results from its visitors' browsers.
      return request.method === 'POST' ? await receive(request, env) : reply(405, { error: 'Send results with POST.' }, { allow: 'POST' });
    }
    if (url.pathname === '/v1/cards') {
      return request.method === 'GET' ? await cards(url, env) : reply(405, { error: 'Read the board with GET.' }, { allow: 'GET' });
    }
    if (url.pathname === '/') {
      return new Response(`RigMatch scoreboard: shared Speed score results, by graphics card.\nGET /v1/cards?tier=standard\nPrivacy: ${PRIVACY_URL}\n`, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return reply(404, { error: 'Not found.' });
  } catch {
    return reply(500, { error: 'The scoreboard had a problem. Try again later.' });
  }
}
