// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The bridge's access rules, exercised rather than grepped for.
 *
 * release-sweep checks the source still contains the guards; this checks they
 * decide correctly. The rule that needed both: `origin && !allowed` reads like
 * an allowlist, and is one — right up until a request arrives with no Origin
 * header, when it stops being any kind of check at all. A GET could then read
 * the model list and a POST could start a GPU job, from anything on the
 * machine. It was confirmed against a running RigMatch before it was fixed:
 * no Origin returned 200 and the full scores payload.
 *
 * The logic is duplicated here rather than imported because it lives inside
 * electron/main.cjs, which pulls in `electron` at require time and cannot load
 * under plain node. That makes this file a statement of the intended rules, not
 * proof the server implements them — so the same eight cases run against the
 * real listener in scripts/gate-desktop.mjs, on a port that run owns. Those were
 * checked by deleting each guard and confirming the gate went red.
 *
 * Keep the three in step: this file for the rules, the gate for the behaviour,
 * and release-sweep for the source still containing the guards at all.
 */
function hostIsLoopback(hostHeader) {
  if (!hostHeader) return false;
  const host = String(hostHeader).replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

const ALLOWED = new Set(['http://127.0.0.1:1420', 'tauri://localhost']);

/** Mirrors the order of the checks at the top of the bridge handler. */
function decide({ method = 'GET', host = '127.0.0.1:11435', origin } = {}) {
  if (!hostIsLoopback(host)) return 'refused-host';
  if (origin && !ALLOWED.has(origin)) return 'refused-origin';
  if (method === 'POST' && !origin) return 'refused-anonymous-post';
  return 'allowed';
}

test('the companion is allowed, on both of its origins', () => {
  for (const origin of ['tauri://localhost', 'http://127.0.0.1:1420']) {
    assert.equal(decide({ origin }), 'allowed');
    assert.equal(decide({ method: 'POST', origin }), 'allowed');
  }
});

test('a foreign origin is refused whatever it asks for', () => {
  for (const origin of ['https://evil.example', 'http://localhost:3000', 'null']) {
    assert.equal(decide({ origin }), 'refused-origin');
    assert.equal(decide({ method: 'POST', origin }), 'refused-origin');
  }
});

test('an anonymous POST cannot start work', () => {
  // The half of the bypass that mattered: a GPU job on someone's machine,
  // started by anything able to open a socket.
  assert.equal(decide({ method: 'POST' }), 'refused-anonymous-post');
});

test('an anonymous GET is still allowed, deliberately', () => {
  // Already-installed companions call the scores endpoint without an Origin.
  // Refusing here would break them against an updated RigMatch, and what it
  // exposes is a model list to a process already running as this user.
  assert.equal(decide({ method: 'GET' }), 'allowed');
});

test('a rebound host name never reaches a route', () => {
  for (const host of ['evil.example', 'evil.example:11435', 'rebind.attacker.test']) {
    assert.equal(decide({ host }), 'refused-host');
    // Refused even carrying an origin the allowlist would otherwise accept.
    assert.equal(decide({ host, origin: 'tauri://localhost' }), 'refused-host');
  }
});

test('the loopback names the bridge actually answers on are accepted', () => {
  for (const host of ['127.0.0.1:11435', 'localhost:11435', '[::1]:11435', '127.0.0.1', 'LOCALHOST']) {
    assert.equal(hostIsLoopback(host), true, host);
  }
});

test('a missing Host header is refused rather than assumed local', () => {
  // Asserted against hostIsLoopback directly: passing `host: undefined` to
  // decide() would hit its default parameter and test nothing, which is exactly
  // what the first version of this test did.
  assert.equal(hostIsLoopback(undefined), false);
  assert.equal(hostIsLoopback(''), false);
  assert.equal(decide({ host: null }), 'refused-host');
});
