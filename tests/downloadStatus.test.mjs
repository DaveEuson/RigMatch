import test from 'node:test';
import assert from 'node:assert/strict';

import { getDownloadRowStatus, summarizeDownloadStep, MIN_CONTESTANTS } from '../src/lib/downloadStatus.ts';

const pull = (phase, extra = {}) => ({ phase, model: 'm', baseUrl: '', status: '', percent: null, ...extra });
const row = (displayName, installed) => ({ displayName, installed });
/** Mirrors what the wizard does: derive each row's status, then summarize. */
const summarize = (rows, pulls = {}) =>
  summarizeDownloadStep(rows.map((r) => getDownloadRowStatus(r.installed, pulls[r.displayName])));

test('a failed download is not reported as waiting in line', () => {
  // The bug: 'failed' fell through to 'queued', so the row read "Up next" and
  // the error the main process had reported was discarded.
  assert.equal(getDownloadRowStatus(false, pull('failed', { error: 'no space left on device' })), 'failed');
});

test('a paused download is not reported as downloading', () => {
  // The bug: 'paused' counted as downloading, so the row showed a live byte
  // counter and an ETA for a transfer that was stopped.
  assert.equal(getDownloadRowStatus(false, pull('paused')), 'paused');
});

test('the ordinary states still read the way they did', () => {
  assert.equal(getDownloadRowStatus(true, undefined), 'done');
  assert.equal(getDownloadRowStatus(true, pull('failed')), 'done', 'installed wins over a stale failure');
  assert.equal(getDownloadRowStatus(false, undefined), 'queued');
  assert.equal(getDownloadRowStatus(false, pull('queued')), 'queued');
  assert.equal(getDownloadRowStatus(false, pull('downloading')), 'downloading');
});

test('a failed download no longer strands the step when enough models arrived', () => {
  // The bug: the step completed only when every model was installed, so one
  // failure left Next disabled forever under "Waiting for downloads to finish".
  const summary = summarize(
    [row('a', true), row('b', true), row('c', false)],
    { c: pull('failed', { error: 'manifest not found' }) },
  );
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.stillMoving, false);
  assert.equal(summary.canContinue, true);
  assert.equal(summary.blockedReason, undefined);
});

test('but it does block when too few contestants arrived, and says why', () => {
  const summary = summarize(
    [row('a', true), row('b', false), row('c', false)],
    { b: pull('failed'), c: pull('failed') },
  );
  assert.equal(summary.installedCount, 1);
  assert.ok(summary.installedCount < MIN_CONTESTANTS);
  assert.equal(summary.canContinue, false);
  assert.match(summary.blockedReason ?? '', /2 downloads didn't finish/);
  assert.doesNotMatch(summary.blockedReason ?? '', /waiting/i, 'must not claim downloads are still running');
});

test('nothing is skipped while a download is still moving', () => {
  for (const phase of ['downloading', 'queued', 'paused']) {
    const summary = summarize(
      [row('a', true), row('b', true), row('c', false)],
      { c: pull(phase) },
    );
    assert.equal(summary.stillMoving, true, phase);
    assert.equal(summary.canContinue, false, `${phase} must not let the user continue`);
    assert.equal(summary.blockedReason, undefined, `${phase} keeps the default "still downloading" hint`);
  }
});

test('all installed continues, as it always did', () => {
  const summary = summarize([row('a', true), row('b', true)]);
  assert.equal(summary.canContinue, true);
  assert.equal(summary.failedCount, 0);
});

test('an empty lineup cannot continue', () => {
  assert.equal(summarize([]).canContinue, false);
});

test('allInstalled stays distinct from canContinue', () => {
  // skipDownload hangs off allInstalled: a lineup that continues *despite* a
  // failure must still show the download step, not skip past the evidence.
  const withFailure = summarize(
    [row('a', true), row('b', true), row('c', false)],
    { c: pull('failed') },
  );
  assert.equal(withFailure.canContinue, true);
  assert.equal(withFailure.allInstalled, false, 'must not skip the step that shows the failure');

  assert.equal(summarize([row('a', true), row('b', true)]).allInstalled, true);
});
