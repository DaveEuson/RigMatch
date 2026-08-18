import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abortReasonFor,
  pullOutcome,
  requestPull,
  shouldStopQueue,
} from '../src/lib/pullControl.ts';

// These rules used to live as two booleans inside a 250-line async callback,
// each held twice (a ref for the loop, a useState for the buttons) and kept
// consistent by hand at four sites. The failure they guard against is the worst
// one here: a multi-gigabyte download still running after Stop, with the UI
// reporting that it stopped.

test('cancel outranks pause, in either arrival order', () => {
  assert.equal(requestPull('none', 'cancel'), 'cancel');
  assert.equal(requestPull('pause', 'cancel'), 'cancel', 'stop after pause means stop');
  assert.equal(requestPull('cancel', 'pause'), 'cancel', 'pause must not revive a cancelled queue');
});

test('a pause is only a pause while something is downloading', () => {
  // Between models there is nothing to resume, so it has to read as a cancel —
  // the other way round announces a paused queue as cancelled and throws the
  // partial download away.
  assert.equal(pullOutcome({ request: 'pause', hasActiveModel: true }), 'paused');
  assert.equal(pullOutcome({ request: 'pause', hasActiveModel: false }), 'failed');
  assert.equal(pullOutcome({ request: 'cancel', hasActiveModel: true }), 'cancelled');
  assert.equal(pullOutcome({ request: 'cancel', hasActiveModel: false }), 'cancelled');
});

test('a queue that nobody stopped reports the real failure', () => {
  // Reporting 'cancelled' here would hide a bad tag or a full disk behind a
  // message saying the user did it.
  assert.equal(pullOutcome({ request: 'none', hasActiveModel: true }), 'failed');
  assert.equal(pullOutcome({ request: 'none', hasActiveModel: false }), 'failed');
});

test('only a cancel stops the queue handing out more models', () => {
  assert.equal(shouldStopQueue('cancel'), true);
  assert.equal(shouldStopQueue('pause'), false, 'a pause resumes, so the queue is not over');
  assert.equal(shouldStopQueue('none'), false);
});

test('the abort reason distinguishes pause from cancel', () => {
  // 'pause' leaves Ollama's partial layers so Start Download resumes through
  // them. Sending 'cancel' instead turns a pause into a restart from zero.
  assert.equal(abortReasonFor('pause'), 'pause');
  assert.equal(abortReasonFor('cancel'), 'cancel');
  assert.equal(abortReasonFor('none'), null, 'nothing to abort when nothing was asked');
});
