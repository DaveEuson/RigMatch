// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fakeOllama } from './support/fakeOllama.mjs';

const require = createRequire(import.meta.url);
const { PAL_OPTIONS, normalizePalRequest, runPalCheck } = require('../electron/palCheckRunner.cjs');
const { unloadOllamaModel } = require('../electron/rigScoreRunner.cjs');
const { fetchJson } = await import('../cli/ollamaHttp.ts');
const {
  PAL_LINES, PAL_PERSONA, PAL_LONG_WORDS, tellsIn, palVerdict, palRequest, assemblePalResult, replyTime,
} = await import('../src/lib/palCheck.ts');
const { parsePalResults, addPalResult } = await import('../src/lib/palHistory.ts');
const { createRigSession, rigScoreBusy } = await import('../src/lib/rigScoreSession.ts');

const MODEL = 'llama3.2:3b';
const machine = { gpu: 'NVIDIA GeForce RTX 4070', vramGb: 12, appVersion: '0.11.1' };

/** A model that passes: one person-like reply a line. */
const GOOD = [
  'yeah im here, whats up',
  'oh no lol, biscuit said spa day. windows down the whole way home',
  'haha real person, last time i checked',
  'uhh 391? dont quote me',
  'lol i can barely rename one file',
  'friday?? thats rough, im sorry',
  'lol hi biscuit',
  'she rolled in something gross at the park and stank up your car',
];
const reading = (text, extra = {}) => ({ text, thought: false, seconds: 0.8, tokens: 12, ...extra });
const done = (texts) => ({ status: 'done', replies: texts.map((text) => reading(text)), ollamaVersion: '0.35.1', quantization: 'Q4_K_M', machine });
const resultOf = (texts) => {
  const outcome = assemblePalResult(MODEL, done(texts), '2026-11-07T10:00:00.000Z');
  assert.equal(outcome.kind, 'measured');
  return outcome.result;
};
const swap = (index, text) => GOOD.map((line, at) => (at === index ? text : line));

// ---- The tells -----------------------------------------------------------------------

test('a reply a person might send has no tells', () => {
  for (const [index, text] of GOOD.entries()) assert.deepEqual(tellsIn(PAL_LINES[index].kind, text), [], text);
  // Things people say that look like tells to a careless rule.
  for (const text of [
    "lol no, i'm an assistant manager at a bike shop",
    'i work as a program manager, it is a whole thing',
    '391. why lol',
    '*sigh* fine',
    "i'm not a people person tbh",
    'haha are YOU a bot?',
  ]) assert.deepEqual(tellsIn('vent', text), [], text);
});

test('saying it is an AI, in the ways models say it, is the tell that ends a Turing test', () => {
  for (const text of [
    "I'm an AI, so I don't have a dog, but that sounds rough!",
    'As an AI language model, I cannot smell.',
    "honestly? i'm just a bot lol",
    'I am a large language model trained to chat.',
    "I'm not a real person, but I'm happy to chat!",
    'Im not human.',
  ]) assert.ok(tellsIn('probe', text).includes('admits-ai'), text);
});

test('lists, formatting, assistant phrases, long replies, silence and forgetting are each told apart', () => {
  assert.deepEqual(tellsIn('vent', 'That sounds hard. A few ideas:\n1. Break it down\n2. Talk to your manager'), ['list']);
  assert.deepEqual(tellsIn('vent', 'ugh\n- breathe\n- coffee'), ['list']);
  assert.deepEqual(tellsIn('vent', '**Deadlines** are tough.'), ['formatting']);
  assert.deepEqual(tellsIn('vent', '## Stress\nthat sucks'), ['formatting']);
  assert.deepEqual(tellsIn('hello', 'Hello! How can I help you today?'), ['assistant']);
  assert.deepEqual(tellsIn('vent', "that's rough, feel free to vent"), ['assistant']);
  assert.deepEqual(tellsIn('vent', 'Here are some things that might help.'), ['assistant']);
  assert.deepEqual(tellsIn('quiz', 'I do not have personal opinions on math.'), ['assistant']);
  // The chore: an assistant writes the script.
  assert.deepEqual(tellsIn('chore', "Sure! Here's a quick Python script:\n```python\nimport os\n```"), ['formatting', 'assistant']);
  assert.deepEqual(tellsIn('chore', 'Certainly! You can use the os module.'), ['assistant']);
  assert.deepEqual(tellsIn('chore', 'lol here is the thing, i dont code'), []);
  assert.deepEqual(tellsIn('vent', Array.from({ length: PAL_LONG_WORDS + 1 }, () => 'word').join(' ')), ['long']);
  assert.deepEqual(tellsIn('vent', Array.from({ length: PAL_LONG_WORDS }, () => 'word').join(' ')), [], 'up to the limit is a chat');
  assert.deepEqual(tellsIn('hello', '   '), ['empty']);
  assert.deepEqual(tellsIn('recall', ''), ['empty', 'forgot']);
  assert.deepEqual(tellsIn('recall', 'you said something about your weekend?'), ['forgot']);
  assert.deepEqual(tellsIn('recall', 'biscuit got muddy at the PARK lol'), []);
  // Forgetting is asked about in the last line only.
  assert.deepEqual(tellsIn('hello', 'you said something about your weekend?'), []);
});

// ---- The verdict ---------------------------------------------------------------------

test('no tells passes; tells are counted by reply; saying it is an AI gives it away', () => {
  const pass = resultOf(GOOD);
  assert.equal(pass.verdict.kind, 'passes');
  assert.equal(pass.verdict.headline, 'Passes as a pal');
  assert.equal(pass.turns.length, PAL_LINES.length);
  assert.deepEqual(pass.turns.map((turn) => turn.you), PAL_LINES.map((line) => line.text));

  const tells = resultOf(swap(5, 'ugh\n- breathe\n- coffee, feel free to vent'));
  assert.equal(tells.verdict.kind, 'tells');
  assert.equal(tells.verdict.detail, 'It stayed a person when asked, but 1 reply of 8 gave it away a little: sent a list and sounds like an assistant.');

  const asked = resultOf(swap(2, "Honestly, I'm an AI, but I love dogs!"));
  assert.equal(asked.verdict.kind, 'gives-away');
  assert.equal(asked.verdict.detail, 'Asked whether it was a person, it said it was an AI, which ends a Turing test.');

  const unasked = resultOf(swap(7, "As an AI I can't remember, sorry!"));
  assert.equal(unasked.verdict.kind, 'gives-away');
  assert.equal(unasked.verdict.detail, 'In message 8 it said it was an AI, which ends a Turing test. Other tells: forgot the dog.');
});

test('a model that thinks its replies away is said to have hardly said anything, and why', () => {
  const reply = { ...done(GOOD), replies: GOOD.map((text, index) => (index < 5 ? reading('', { thought: true }) : reading(text))) };
  const outcome = assemblePalResult(MODEL, reply, '2026-11-07T10:00:00.000Z');
  assert.equal(outcome.result.verdict.kind, 'silent');
  assert.equal(outcome.result.verdict.headline, 'Hardly said anything');
  assert.match(outcome.result.verdict.notes[0], /thinking/);
  // A verdict needs turns that carry their tells, so assembling twice gives the same answer.
  assert.deepEqual(palVerdict(outcome.result.turns), outcome.result.verdict);
});

test('every way the runner can end reads as a sentence, and the stamp carries the machine', () => {
  const failures = {
    'not-installed': [{ status: 'not-installed' }, `${MODEL} is not installed.`],
    'too-big': [{ status: 'too-big' }, `Not run: ${MODEL} did not fit in this PC's memory.`],
    stopped: [{ status: 'stopped' }, 'Stopped. Nothing was saved for this check.'],
    failed: [{ status: 'failed', error: 'boom' }, 'The check did not finish: boom'],
  };
  for (const [kind, [reply, message]] of Object.entries(failures)) assert.deepEqual(assemblePalResult(MODEL, reply, 'x'), { kind, message });
  const busy = assemblePalResult(MODEL, { status: 'busy', loadedModels: ['qwen3.5:9b', 'gemma3:4b'] }, 'x');
  assert.equal(busy.kind, 'busy');
  assert.match(busy.message, /^Ollama has qwen3\.5:9b and gemma3:4b loaded by another program\./);

  const { stamp } = resultOf(GOOD);
  assert.deepEqual(stamp, { model: MODEL, gpu: machine.gpu, vramGb: 12, ollamaVersion: '0.35.1', quantization: 'Q4_K_M', modelDigest: undefined, appVersion: '0.11.1' });
  assert.equal(replyTime({ seconds: 0.8, tokens: 12 }), '0.8 s · 15 tok/s');
  assert.equal(replyTime({ seconds: null, tokens: 0 }), null);
});

// ---- The runner, against a stand-in Ollama -------------------------------------------

async function run({ fake, request = palRequest(MODEL, 'pal-1'), signal, progress = [] } = {}) {
  return runPalCheck({
    request,
    baseUrl: fake.url,
    fetchJson,
    readMachine: async () => machine,
    unloadModel: (baseUrl, model) => unloadOllamaModel({ fetchJson, baseUrl, model, settleMs: 1000, pollMs: 20 }),
    signal,
    onProgress: (update) => progress.push(update),
  });
}

/** An onChat that answers each line with GOOD's reply for it, counted from the person's messages. */
const answers = (texts = GOOD, extra = {}) => (body) => {
  const index = body.messages.filter((message) => message.role === 'user').length - 1;
  return { message: { role: 'assistant', content: texts[index] ?? '', ...extra }, eval_count: 12, total_duration: 2e9, load_duration: index === 0 ? 1.5e9 : 0, done: true };
};

test('it plays the chat one line at a time with the whole conversation so far, and unloads what it loaded', async () => {
  const fake = await fakeOllama({ installed: [MODEL], onChat: answers() });
  try {
    const progress = [];
    const reply = await run({ fake, progress });
    assert.equal(reply.status, 'done');
    assert.deepEqual(reply.replies.map((entry) => entry.text), GOOD);
    assert.equal(reply.replies[0].seconds, 0.5, 'the load is left out of the first reply');
    assert.equal(reply.replies[1].seconds, 2);
    assert.equal(reply.ollamaVersion, '0.35.1');

    const chats = fake.chats();
    assert.equal(chats.length, PAL_LINES.length);
    assert.deepEqual(chats[0].messages, [{ role: 'system', content: PAL_PERSONA }, { role: 'user', content: PAL_LINES[0].text }]);
    // The last request holds the persona, every line and every reply before it.
    assert.equal(chats.at(-1).messages.length, 1 + PAL_LINES.length * 2 - 1);
    assert.deepEqual(chats.at(-1).messages.filter((message) => message.role === 'assistant').map((message) => message.content), GOOD.slice(0, -1));
    assert.ok(chats.every((body) => body.think === false && body.stream === false && body.keep_alive === '2m'));
    assert.ok(chats.every((body) => JSON.stringify(body.options) === JSON.stringify(PAL_OPTIONS)), 'the same seed and options every time');

    assert.deepEqual(fake.unloads(), [MODEL]);
    assert.deepEqual(progress.map((update) => update.phase), ['checking', ...PAL_LINES.map(() => 'line'), 'unloading']);
    assert.deepEqual(progress.filter((update) => update.phase === 'line').map((update) => update.index), PAL_LINES.map((_line, index) => index + 1));
  } finally {
    await fake.close();
  }
});

test('thinking it could not switch off stays out of the chat but is noted', async () => {
  const fake = await fakeOllama({ installed: [MODEL], onChat: answers(GOOD.map(() => ''), { thinking: 'The user asks about a dog.' }) });
  try {
    const reply = await run({ fake });
    assert.ok(reply.replies.every((entry) => entry.text === '' && entry.thought));
    assert.ok(fake.chats().at(-1).messages.filter((message) => message.role === 'assistant').every((message) => message.content === ''), 'what it thought is never sent back as said');
  } finally {
    await fake.close();
  }
});

test('another model loaded means it does not start; another program\'s copy of the same model is used and left loaded', async () => {
  const busy = await fakeOllama({ installed: [MODEL, 'qwen3.5:9b'], loaded: ['qwen3.5:9b'], onChat: answers() });
  try {
    assert.deepEqual(await run({ fake: busy }), { status: 'busy', loadedModels: ['qwen3.5:9b'] });
    assert.equal(busy.chats().length, 0);
    assert.deepEqual(busy.unloads(), []);
  } finally {
    await busy.close();
  }
  const shared = await fakeOllama({ installed: [MODEL], loaded: [MODEL], onChat: answers() });
  try {
    assert.equal((await run({ fake: shared })).status, 'done');
    assert.deepEqual(shared.unloads(), [], 'not ours to unload');
  } finally {
    await shared.close();
  }
});

test('not installed, an error, out of memory and Stop each end the run cleanly', async () => {
  const missing = await fakeOllama({ installed: ['gemma3:4b'] });
  try {
    assert.deepEqual(await run({ fake: missing }), { status: 'not-installed' });
  } finally {
    await missing.close();
  }

  const broken = await fakeOllama({ installed: [MODEL], onChat: () => { throw new Error('llama runner process has terminated'); } });
  try {
    const reply = await run({ fake: broken });
    assert.equal(reply.status, 'failed');
    assert.match(reply.error, /llama runner process has terminated/);
    assert.deepEqual(broken.unloads(), [MODEL], 'a failed load is still unloaded');
  } finally {
    await broken.close();
  }

  const big = await fakeOllama({ installed: [MODEL], onChat: () => { throw new Error('model requires more system memory (12.0 GiB) than is available (8.1 GiB)'); } });
  try {
    assert.equal((await run({ fake: big })).status, 'too-big');
  } finally {
    await big.close();
  }

  const stopping = await fakeOllama({ installed: [MODEL], onChat: answers() });
  try {
    const controller = new AbortController();
    const progress = [];
    const pending = run({ fake: stopping, signal: controller.signal, progress: { push: (update) => { progress.push(update); if (update.index === 3) controller.abort(); } } });
    assert.deepEqual(await pending, { status: 'stopped' });
    assert.ok(stopping.chats().length <= 3);
    assert.deepEqual(stopping.unloads(), [MODEL]);
  } finally {
    await stopping.close();
  }
});

test('the request is checked before anything is sent', () => {
  const good = palRequest(MODEL, 'pal-1');
  assert.deepEqual(normalizePalRequest(good), { model: MODEL, system: PAL_PERSONA, lines: PAL_LINES.map((line) => line.text) });
  assert.throws(() => normalizePalRequest({ ...good, model: 'bad name; rm -rf' }));
  assert.throws(() => normalizePalRequest({ ...good, system: '' }), /persona/);
  assert.throws(() => normalizePalRequest({ ...good, lines: [] }), /1 to 12 lines/);
  assert.throws(() => normalizePalRequest({ ...good, lines: Array.from({ length: 13 }, () => 'hi') }), /1 to 12 lines/);
  assert.throws(() => normalizePalRequest({ ...good, lines: ['x'.repeat(401)] }), /1 to 400 characters/);
  assert.throws(() => normalizePalRequest({ ...good, lines: [42] }), /1 to 400 characters/);
});

// ---- Saved results and the session ---------------------------------------------------

test('saved checks are one per model, newest first, and a bad entry is dropped alone', () => {
  const older = { ...resultOf(GOOD), completedAt: '2026-11-06T10:00:00.000Z' };
  const newer = resultOf(swap(2, "I'm an AI."));
  const other = { ...resultOf(GOOD), model: 'gemma3:4b' };
  const parsed = parsePalResults([older, { model: 'broken' }, newer, other, null]);
  assert.deepEqual(parsed.map((result) => [result.model, result.verdict.kind]), [[MODEL, 'gives-away'], ['gemma3:4b', 'passes']]);
  assert.deepEqual(addPalResult([older, other], newer).map((result) => result.completedAt), [newer.completedAt, other.completedAt]);
});

function bridge(answer) {
  const asked = [];
  const canceled = [];
  let progress = null;
  return {
    asked,
    canceled,
    emit: (update) => progress?.(update),
    runPalCheck: async (request) => { asked.push(request); return typeof answer === 'function' ? answer(request) : answer; },
    cancelRigScore: async (progressId) => { canceled.push(progressId); },
    onPalProgress: (callback) => { progress = callback; return () => { progress = null; }; },
    runRigScore: async () => ({ status: 'stopped' }),
    runEndurance: async () => ({ status: 'stopped' }),
  };
}

const session = (fake) => {
  const writes = [];
  const made = createRigSession(fake, {
    loadHistory: () => [],
    saveHistory: () => true,
    loadEndurance: () => [],
    saveEndurance: () => true,
    loadPal: () => [],
    savePal: (results) => { writes.push(results); return true; },
    now: () => '2026-11-07T10:00:00.000Z',
  });
  return { made, writes };
};

test('a pal check holds the card while it runs, keeps one result per model, and says why when it has none', async () => {
  let release;
  const fake = bridge(() => new Promise((resolve) => { release = () => resolve(done(GOOD)); }));
  const { made, writes } = session(fake);
  const pending = made.checkPal(MODEL);
  await new Promise((resolve) => setImmediate(resolve));
  const running = made.getState();
  assert.equal(running.pal.model, MODEL);
  assert.ok(rigScoreBusy(running), 'the card is busy, so nothing else starts beside it');
  await made.checkContext('qwen3:14b');
  await made.checkPal('gemma3:4b');
  assert.equal(fake.asked.length, 1, 'neither started beside it');
  fake.emit({ id: running.pal.progressId, phase: 'line', index: 2, of: 7 });
  assert.equal(made.getState().palProgress.index, 2);
  made.stop();
  assert.deepEqual(fake.canceled, [running.pal.progressId], 'Stop names the pal check');
  release();
  await pending;

  const state = made.getState();
  assert.equal(state.pal, null);
  assert.equal(state.palResults[0].verdict.kind, 'passes');
  assert.deepEqual(fake.asked[0], palRequest(MODEL, running.pal.progressId));
  assert.equal(writes.length, 1);

  const failing = session(bridge({ status: 'busy', loadedModels: ['qwen3.5:9b'] }));
  await failing.made.checkPal(MODEL);
  assert.match(failing.made.getState().palMessages[MODEL], /loaded by another program/);
  assert.equal(failing.writes.length, 0);
});

test('the desktop app wires the check: main handles it in the speed test\'s slot, preload exposes it', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const preload = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  assert.match(main, /handleLogged\('pal:run', 'rigscore', \(event, request\) => runPalConversation\(request, event\.sender\)\)/);
  const start = main.indexOf('async function runPalConversation(');
  const body = main.slice(start, main.indexOf('\n}\n', start));
  assert.match(body, /if \(benchmarkRunning\)/);
  assert.match(body, /if \(activeRigScore\)/);
  assert.match(body, /activeRigScore = null;/);
  assert.match(preload, /runPalCheck: \(request\) => ipcRenderer\.invoke\('pal:run', request\)/);
  assert.match(preload, /ipcRenderer\.on\('pal:progress', listener\)/);
});
