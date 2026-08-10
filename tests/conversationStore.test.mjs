import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STORE_VERSION,
  createWriteScheduler,
  parseStore,
  serializeStore,
} from '../rigmatch-chat/src/lib/conversationStore.ts';

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Controllable time, so the coalescing can be asserted rather than slept on. */
function fakeClock() {
  let current = 0;
  let timers = [];
  return {
    now: () => current,
    setTimer(fn, ms) {
      const handle = { fn, at: current + ms };
      timers.push(handle);
      return handle;
    },
    clearTimer(handle) {
      timers = timers.filter((t) => t !== handle);
    },
    async advance(ms) {
      const target = current + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        current = due.at;
        due.fn();
        await settle();
      }
      current = target;
      await settle();
    },
  };
}

function recorder({ fail = false } = {}) {
  const writes = [];
  const errors = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  return {
    writes,
    errors,
    get maxConcurrent() { return maxConcurrent; },
    onError: (e) => errors.push(e),
    async write(value) {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await settle();
      concurrent -= 1;
      if (fail) throw new Error('disk full');
      writes.push(value);
    },
  };
}

const scheduler = (rec, clock, opts = {}) => createWriteScheduler({
  write: rec.write,
  onError: rec.onError,
  now: clock.now,
  setTimer: clock.setTimer,
  clearTimer: clock.clearTimer,
  ...opts,
});

test('a store round-trips and carries its version', () => {
  const conversations = { 'llama3.2:3b::default': [{ id: 'a', role: 'user', content: 'hi', ts: 1 }] };
  const raw = serializeStore(conversations);
  assert.equal(JSON.parse(raw).version, STORE_VERSION);
  assert.deepEqual(parseStore(raw), conversations);
});

test('unreadable or foreign store files are refused, not half-read', () => {
  // The caller keeps what it has instead of replacing it with nonsense.
  assert.equal(parseStore(null), null);
  assert.equal(parseStore(''), null);
  assert.equal(parseStore('{oh no'), null);
  assert.equal(parseStore('[]'), null);
  assert.equal(parseStore(JSON.stringify({ conversations: {} })), null, 'no version');
  assert.equal(
    parseStore(JSON.stringify({ version: STORE_VERSION + 1, conversations: {} })),
    null,
    'a newer file must be left alone rather than misread',
  );
});

test('entries that are not messages are dropped rather than handed to the UI', () => {
  const raw = JSON.stringify({
    version: STORE_VERSION,
    conversations: {
      good: [{ id: 'a', role: 'user', content: 'hi', ts: 1 }],
      notAnArray: { nope: true },
      mixed: [
        { id: 'b', role: 'assistant', content: 'ok', ts: 2 },
        { id: 'c', role: 'system', content: 'wrong role', ts: 3 },
        { id: 'd', role: 'user', ts: 4 },
        null,
      ],
    },
  });
  const parsed = parseStore(raw);
  assert.deepEqual(Object.keys(parsed).sort(), ['good', 'mixed']);
  assert.equal(parsed.mixed.length, 1);
  assert.equal(parsed.mixed[0].id, 'b');
});

test('a burst of updates becomes one write', async () => {
  // The bug: an effect keyed on the message map wrote the whole store once per
  // streamed token — 4.3 ms and 5 MB each, on the main thread.
  const clock = fakeClock();
  const rec = recorder();
  const s = scheduler(rec, clock, { delayMs: 800, maxDelayMs: 4000 });

  for (let i = 0; i < 200; i++) {
    s.schedule(`token-${i}`);
    await clock.advance(1);
  }
  assert.equal(rec.writes.length, 0, 'nothing written while updates keep arriving');

  await clock.advance(800);
  assert.equal(rec.writes.length, 1, '200 updates produced one write');
  assert.equal(rec.writes[0], 'token-199', 'and it wrote the newest state');
});

test('a long unbroken stream still gets saved before it ends', async () => {
  // Without an upper bound, a reply that updates every few ms never reaches a
  // quiet moment, so nothing would reach disk until the whole reply finished.
  const clock = fakeClock();
  const rec = recorder();
  const s = scheduler(rec, clock, { delayMs: 800, maxDelayMs: 4000 });

  for (let i = 0; i < 1000; i++) {
    s.schedule(`t-${i}`);
    await clock.advance(10);
  }
  assert.ok(rec.writes.length >= 2, `expected periodic writes, got ${rec.writes.length}`);
  // Roughly one per maxDelayMs over 10s — bounded, not per update.
  assert.ok(rec.writes.length <= 5, `expected coalescing, got ${rec.writes.length}`);
});

test('flush writes immediately, and covers a value that arrived mid-write', async () => {
  const clock = fakeClock();
  const rec = recorder();
  const s = scheduler(rec, clock);

  s.schedule('first');
  const flushing = s.flush();
  s.schedule('second');
  await flushing;
  await settle();

  assert.deepEqual(rec.writes, ['first', 'second']);
});

test('writes never overlap', async () => {
  const clock = fakeClock();
  const rec = recorder();
  const s = scheduler(rec, clock, { delayMs: 10, maxDelayMs: 20 });

  for (let i = 0; i < 20; i++) {
    s.schedule(i);
    await clock.advance(10);
  }
  await s.flush();
  assert.equal(rec.maxConcurrent, 1, 'a slow write must not have another started on top of it');
});

test('a failing write is reported, never thrown, and does not stop the next one', async () => {
  // Persistence failing used to take the whole app down: the unguarded
  // setItem threw out of an effect and tripped the error boundary on mount.
  const clock = fakeClock();
  const failing = recorder({ fail: true });
  const s = scheduler(failing, clock, { delayMs: 10 });

  s.schedule('one');
  await clock.advance(10);
  await assert.doesNotReject(() => s.flush());
  assert.equal(failing.errors.length, 1);
  assert.match(String(failing.errors[0]), /disk full/);

  s.schedule('two');
  await clock.advance(10);
  assert.equal(failing.errors.length, 2, 'the next attempt still runs');
});

test('cancel drops pending work', async () => {
  const clock = fakeClock();
  const rec = recorder();
  const s = scheduler(rec, clock, { delayMs: 10 });

  s.schedule('gone');
  s.cancel();
  await clock.advance(1000);
  assert.deepEqual(rec.writes, []);
});
