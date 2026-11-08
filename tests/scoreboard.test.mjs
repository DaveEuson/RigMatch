// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { scoreboardDb } from './support/d1Sqlite.mjs';

const { RIG_TIERS, RIG_REFERENCES, rigPoints } = await import('../src/lib/rigScore.ts');
const { assembleTierResult } = await import('../src/lib/rigScoreRun.ts');
const { checkSubmission, submissionFor } = await import('../src/lib/rigScoreSubmit.ts');
const { handleRequest, forgetOldSends, SENDS_PER_DAY, MAX_BODY_BYTES } = await import('../scoreboard/scoreboard.ts');
const workerModule = await import('../scoreboard/worker.ts');

const tier = (id) => RIG_TIERS.find((entry) => entry.id === id);
const STANDARD_DIGEST = RIG_REFERENCES.standard.modelDigest;
const today = () => new Date().toISOString().slice(0, 10);

/** A finished run as the runner answers it, with three timed runs near the given speeds. */
function doneReply({ decode = 48, prefill = 2600, gpu = 'NVIDIA GeForce RTX 3060', vramGb = 12, digest = STANDARD_DIGEST, ...extra } = {}) {
  return {
    status: 'done',
    runs: [0.99, 1, 1.01].map((wobble) => ({
      promptEvalCount: 1495,
      promptEvalSeconds: 1495 / (prefill * wobble),
      evalCount: 256,
      evalSeconds: 256 / (decode * wobble),
      loadSeconds: 0.02,
    })),
    coldLoadSeconds: 2.4,
    gpuShare: 1,
    ollamaVersion: '0.35.1',
    modelDigest: digest,
    quantization: 'Q4_K_M',
    machine: { gpu, vramGb, driverVersion: '610.88', appVersion: '0.11.1' },
    ...extra,
  };
}

/** A real result, made by the app's own code from a runner's answer. */
function savedResult(tierId = 'standard', options = {}) {
  const outcome = assembleTierResult(tier(tierId), doneReply(options), '2026-11-07T10:00:00.000Z');
  assert.equal(outcome.kind, 'measured');
  return outcome.result;
}

function shared(result) {
  const checked = submissionFor(result, randomUUID());
  assert.equal(checked.ok, true, checked.error);
  return checked.submission;
}

const post = (body, { ip = '203.0.113.7', type = 'application/json' } = {}) => new Request('https://scores.example/v1/results', {
  method: 'POST',
  headers: { 'content-type': type, 'cf-connecting-ip': ip },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const get = (path) => new Request(`https://scores.example${path}`);

async function send(env, body, options) {
  const response = await handleRequest(post(body, options), env);
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function board(env, tierId = 'standard') {
  const response = await handleRequest(get(`/v1/cards?tier=${tierId}`), env);
  assert.equal(response.status, 200);
  return response.json();
}

test('a real Standard result goes in and stands on the board with the app\'s own points', async () => {
  const env = { DB: scoreboardDb() };
  const result = savedResult();
  const sent = await send(env, shared(result));
  assert.equal(sent.status, 201);
  assert.deepEqual(sent.body, { status: 'saved' });

  const standard = await board(env);
  assert.equal(standard.model, 'qwen3:8b');
  assert.deepEqual(standard.reference, { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, points: 1000 });
  assert.equal(standard.cards.length, 1);
  const [card] = standard.cards;
  assert.equal(card.gpu, 'NVIDIA GeForce RTX 3060');
  assert.equal(card.vramGb, 12);
  assert.equal(card.results, 1);
  // The board's points are the ones the app shows for this result on its own screen.
  assert.equal(card.points, rigPoints(result.measure, result.stamp).points);
  assert.equal(card.decodeTps, Math.round(result.measure.decodeTps * 10) / 10);
});

test('the same result sent twice is counted once', async () => {
  const env = { DB: scoreboardDb() };
  const submission = shared(savedResult());
  assert.equal((await send(env, submission)).status, 201);
  const again = await send(env, submission);
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, { status: 'duplicate' });
  assert.equal((await board(env)).cards[0].results, 1);
});

test('the app says why a result can\'t be shared, before anything is sent', () => {
  const clean = savedResult();
  const reasons = {
    disturbed: { ...clean, disturbed: true, disturbedBy: ['Steam is running'] },
    preview: { ...clean, stamp: { ...clean.stamp, appVersion: 'preview' } },
    noDigest: { ...clean, stamp: { ...clean.stamp, modelDigest: undefined } },
    noGpu: { ...clean, stamp: { ...clean.stamp, gpu: undefined } },
    spilled: { ...clean, gpuShare: 0.8 },
    unknownShare: { ...clean, gpuShare: null },
  };
  const said = Object.fromEntries(Object.entries(reasons).map(([name, result]) => {
    const checked = submissionFor(result, randomUUID());
    assert.equal(checked.ok, false, name);
    return [name, checked.error];
  }));
  assert.match(said.disturbed, /Something else used the graphics card/);
  assert.match(said.preview, /browser preview/);
  assert.match(said.noDigest, /which model file ran/);
  assert.match(said.noGpu, /graphics card's name/);
  assert.match(said.spilled, /system memory/);
  assert.equal(said.unknownShare, said.spilled);
  // Every tier with a fixed model can be shared, Extreme (no reference yet) included.
  for (const entry of RIG_TIERS) assert.equal(submissionFor(savedResult(entry.id), randomUUID()).ok, true, entry.id);
});

test('the scoreboard checks every field and keeps only the known ones', () => {
  const good = shared(savedResult());
  const checked = checkSubmission({ ...good, hostname: 'DAVE-PC', prompt: 'secret', user: 'dave' });
  assert.equal(checked.ok, true);
  assert.deepEqual(Object.keys(checked.submission).sort(), Object.keys(good).sort());
  assert.equal(JSON.stringify(checked.submission).includes('DAVE-PC'), false);

  const refused = {
    'not an object': [null],
    'another format': [{ ...good, v: 2 }],
    'a made-up id': [{ ...good, id: 'dave-pc-1' }],
    'the wrong model for its tier': [{ ...good, model: 'qwen3:14b' }],
    'an unknown tier': [{ ...good, tier: 'turbo' }],
    'another test version': [{ ...good, workloadVersion: 0 }, { ...good, numCtx: 8192 }],
    'no model file': [{ ...good, modelDigest: 'abc' }, { ...good, modelDigest: undefined }],
    'no quantization': [{ ...good, quantization: '' }, { ...good, quantization: 'Q4 K M; DROP' }],
    'impossible speeds': [{ ...good, decodeTps: 0 }, { ...good, decodeTps: 9000 }, { ...good, prefillTps: -1 }, { ...good, prefillTps: Number.NaN }],
    'a bad load time': [{ ...good, loadSeconds: -1 }],
    'the wrong number of runs': [{ ...good, runs: 2 }],
    'a spill': [{ ...good, gpuShare: 0.5 }, { ...good, gpuShare: 2 }],
    'a bad card name': [{ ...good, gpu: '' }, { ...good, gpu: 'RTX\u00004070' }, { ...good, gpu: 'x'.repeat(81) }],
    'bad memory': [{ ...good, vramGb: 0 }, { ...good, vramGb: '12' }],
    'bad versions': [{ ...good, driverVersion: 'latest' }, { ...good, ollamaVersion: 35 }, { ...good, appVersion: 'preview' }],
  };
  for (const [what, cases] of Object.entries(refused)) {
    for (const raw of cases) assert.equal(checkSubmission(raw).ok, false, what);
  }
  // Missing driver and Ollama versions (a Mac has no driver to read) are fine.
  assert.equal(checkSubmission({ ...good, driverVersion: null, ollamaVersion: undefined, vramGb: null }).ok, true);
});

test('nothing kept names the sender: no address, no extra fields, the day and not the time', async () => {
  const env = { DB: scoreboardDb() };
  const submission = shared(savedResult());
  await send(env, { ...submission, hostname: 'DAVE-PC' }, { ip: '198.51.100.23' });
  const kept = env.DB.dump();
  const everything = JSON.stringify(kept);
  assert.equal(everything.includes('198.51.100.23'), false);
  assert.equal(everything.includes('DAVE-PC'), false);
  assert.equal(kept.results.length, 1);
  assert.equal(kept.results[0].received_on, today());
  assert.match(kept.sends_today[0].key, /^[0-9a-f]{64}$/);
  assert.match(kept.day_salt[0].salt, /^[0-9a-f]{32}$/);

  // A hash of the address alone could be undone by hashing every address there
  // is. The count's key is mixed with the day's random value, so it can't.
  assert.notEqual(kept.sends_today[0].key, createHash('sha256').update('198.51.100.23').digest('hex'));
  env.DB.sqlite.exec('DELETE FROM day_salt; DELETE FROM sends_today;');
  await send(env, shared(savedResult()), { ip: '198.51.100.23' });
  assert.notEqual(env.DB.dump().sends_today[0].key, kept.sends_today[0].key);
});

test('one address can send a day\'s worth, then waits until tomorrow; another address is not held up', async () => {
  const env = { DB: scoreboardDb() };
  for (let index = 0; index < SENDS_PER_DAY; index += 1) {
    assert.equal((await send(env, shared(savedResult()))).status, 201, `send ${index + 1}`);
  }
  const over = await send(env, shared(savedResult()));
  assert.equal(over.status, 429);
  assert.match(over.body.error, /tomorrow/);
  assert.equal((await send(env, shared(savedResult()), { ip: '192.0.2.44' })).status, 201);
  assert.equal(env.DB.dump().results.length, SENDS_PER_DAY + 1);
});

test('junk is refused before it costs a write or a send count', async () => {
  const env = { DB: scoreboardDb() };
  for (let index = 0; index < SENDS_PER_DAY + 5; index += 1) {
    assert.equal((await send(env, { v: 1, tier: 'standard' })).status, 400);
  }
  assert.deepEqual(env.DB.dump(), { results: [], day_salt: [], sends_today: [] });
  assert.equal((await send(env, shared(savedResult()))).status, 201);
});

test('yesterday\'s send counts and random value are deleted, by a send or by the daily schedule', async () => {
  for (const clear of ['send', 'schedule']) {
    const env = { DB: scoreboardDb() };
    env.DB.sqlite.prepare('INSERT INTO day_salt (day, salt) VALUES (?, ?)').run('2026-11-01', 'ab'.repeat(16));
    env.DB.sqlite.prepare('INSERT INTO sends_today (key, day, count) VALUES (?, ?, ?)').run('cd'.repeat(32), '2026-11-01', 4);
    if (clear === 'send') await send(env, shared(savedResult()));
    else await workerModule.default.scheduled({}, env);
    const kept = env.DB.dump();
    assert.equal(kept.day_salt.some((row) => row.day === '2026-11-01'), false, clear);
    assert.equal(kept.sends_today.some((row) => row.day === '2026-11-01'), false, clear);
  }
  // Today's are kept until the day is over.
  const env = { DB: scoreboardDb() };
  await send(env, shared(savedResult()));
  await forgetOldSends(env.DB);
  assert.equal(env.DB.dump().sends_today.length, 1);
});

test('the board groups by card, takes medians and ranks by points', async () => {
  const env = { DB: scoreboardDb() };
  for (const decode of [40, 48, 50]) await send(env, shared(savedResult('standard', { decode, prefill: 2500 })));
  await send(env, shared(savedResult('standard', { decode: 130, prefill: 9000, gpu: 'NVIDIA GeForce RTX 4090', vramGb: 24 })));
  // The 8 GB RTX 3060 is another card from the 12 GB one; 11.99 and 12 are the same.
  await send(env, shared(savedResult('standard', { decode: 30, prefill: 1500, vramGb: 8 })));
  await send(env, shared(savedResult('standard', { decode: 49, prefill: 2500, vramGb: 11.99 })));
  // On other weights: kept, but not on the board, which ranks the reference's work only.
  await send(env, shared(savedResult('standard', { decode: 300, prefill: 30000, digest: `sha256-${'e'.repeat(64)}` })));
  // Hidden by hand as junk.
  await send(env, shared(savedResult('standard', { decode: 400, prefill: 40000, gpu: 'Totally Real GPU' })));
  env.DB.sqlite.prepare('UPDATE results SET hidden = 1 WHERE gpu = ?').run('Totally Real GPU');

  const standard = await board(env);
  assert.deepEqual(standard.cards.map((card) => [card.gpu, card.vramGb, card.results]), [
    ['NVIDIA GeForce RTX 4090', 24, 1],
    ['NVIDIA GeForce RTX 3060', 12, 4],
    ['NVIDIA GeForce RTX 3060', 8, 1],
  ]);
  const twelve = standard.cards[1];
  assert.equal(twelve.decodeTps, 48.5);
  assert.equal(twelve.prefillTps, 2500);
  assert.ok(standard.cards[0].points > twelve.points && twelve.points > standard.cards[2].points);
});

test('a tier without a reference shows speeds and no points', async () => {
  const env = { DB: scoreboardDb() };
  await send(env, shared(savedResult('extreme', { gpu: 'NVIDIA GeForce RTX 4090', vramGb: 24, digest: `sha256-${'f'.repeat(64)}` })));
  const extreme = await board(env, 'extreme');
  assert.equal(extreme.reference, null);
  assert.equal(extreme.cards.length, 1);
  assert.equal(extreme.cards[0].points, null);
  // Each tier's board holds only its own tier.
  assert.deepEqual((await board(env, 'standard')).cards, []);
});

test('requests that are not a result, or not the board, are answered plainly', async () => {
  const env = { DB: scoreboardDb() };
  const good = shared(savedResult());
  assert.equal((await send(env, good, { type: 'text/plain' })).status, 415);
  assert.equal((await send(env, '{"v":1,')).status, 400);
  assert.equal((await send(env, { ...good, padding: 'x'.repeat(MAX_BODY_BYTES) })).status, 413);

  const status = async (request) => (await handleRequest(request, env)).status;
  assert.equal(await status(get('/v1/results')), 405);
  assert.equal(await status(new Request('https://scores.example/v1/results', { method: 'OPTIONS' })), 405);
  assert.equal(await status(new Request('https://scores.example/v1/cards', { method: 'POST' })), 405);
  assert.equal(await status(get('/v1/cards?tier=turbo')), 400);
  assert.equal(await status(get('/admin')), 404);

  // The board is for any page to read; sending is not, so a web page can't send from its visitors' browsers.
  const cards = await handleRequest(get('/v1/cards'), env);
  assert.equal(cards.headers.get('access-control-allow-origin'), '*');
  assert.match(cards.headers.get('cache-control'), /max-age=300/);
  assert.equal((await cards.json()).tier, 'standard');
  const sent = await handleRequest(post(shared(savedResult())), env);
  assert.equal(sent.headers.get('access-control-allow-origin'), null);

  const home = await handleRequest(get('/'), env);
  assert.match(await home.text(), /scoreboard\/PRIVACY\.md/);
});

test('a database failure is a plain 500 that says nothing about the inside', async () => {
  const broken = { prepare() { throw new Error('D1_ERROR: no such table: results at /internal/path'); }, batch() { throw new Error('D1_ERROR'); } };
  const response = await handleRequest(post(shared(savedResult())), { DB: broken });
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(await response.json()).includes('D1_ERROR'), false);
});

test('the Worker entry exports only its handlers, and the config keeps logs off and the daily clean-up on', () => {
  assert.deepEqual(Object.keys(workerModule), ['default']);
  assert.deepEqual(Object.keys(workerModule.default).sort(), ['fetch', 'scheduled']);
  const config = readFileSync('scoreboard/wrangler.toml', 'utf8');
  assert.match(config, /^main = "worker\.ts"$/m);
  assert.match(config, /\[observability\]\s+enabled = false/);
  assert.match(config, /^crons = \["5 0 \* \* \*"\]$/m);
  assert.match(config, /^binding = "DB"$/m);
});
