// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { canPauseDownload, downloadCloseAction } from '../src/lib/downloadStatus.ts';
import { downloadBlockedLabel, getHardwareFit, pickDockProgress } from '../src/lib/modelCatalog.ts';

/**
 * Downloads from the 2026-10-18 bug scan: things that fetched gigabytes nobody
 * asked for, or that could not be stopped.
 */

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf-8');
const app = read('App.tsx');
const cabinet = read('components/ModelCabinet.tsx');
const sideCard = read('components/SelectedContestantCard.tsx');
const dock = read('components/DownloadTickerDock.tsx');

/** One useCallback's body in App.tsx, up to its dependency list. */
function callbackBody(name) {
  const start = app.indexOf(`const ${name} = useCallback(`);
  assert.ok(start >= 0, `${name} not found`);
  return app.slice(start, app.indexOf('\n  }, [', start));
}

test('the X on a failed download dismisses it and never queues it again', () => {
  assert.equal(downloadCloseAction(false, false), 'dismiss', 'a failed row is not queued');
  assert.equal(downloadCloseAction(false, true), 'unqueue');
  assert.equal(downloadCloseAction(true, false), 'stop');
  assert.equal(downloadCloseAction(true, true), 'stop');
  for (const [name, source] of [['ModelCabinet', cabinet], ['SelectedContestantCard', sideCard]]) {
    assert.match(source, /downloadCloseAction\(/, `${name} asks what the X does`);
    assert.match(source, /onDismissDownload\(row\.displayName\)/, `${name} dismisses`);
    assert.doesNotMatch(source, /onCancel=\{\(\) => \(isPull\w* \? onCancelQueue\(\) : onQueueModel\(row\)\)\}/, `${name} toggles the queue`);
  }
  assert.match(callbackBody('dismissDownload'), /removePullProgress\(current, model\)/);
  assert.doesNotMatch(callbackBody('dismissDownload'), /setQueuedModelIds/);
});

test('a model taken off the queue while another downloads does not start on its turn', () => {
  const body = callbackBody('pullQueuedModels');
  const loop = body.slice(body.indexOf('for (const row of queuedRows) {'));
  const skip = loop.indexOf('if (!queuedModelIdsRef.current.has(row.displayName)) continue;');
  assert.ok(skip > 0, 'the loop checks the live queue');
  assert.ok(skip < loop.indexOf('await '), 'before anything is fetched');
  assert.match(app, /queuedModelIdsRef\.current = queuedModelIds;/);
});

test('the X on a running ComfyUI download reaches Stop', () => {
  const body = callbackBody('pullQueuedModels');
  const comfy = body.slice(body.indexOf("if (row.runtime === 'comfyui') {"));
  const named = comfy.indexOf('setPullingModel(row.displayName);');
  assert.ok(named >= 0 && named < comfy.indexOf('await downloadGenerationModel(row)'),
    'the row is the one downloading, so its X calls cancelDownloadQueue');
  assert.match(callbackBody('cancelDownloadQueue'), /abortComfyDownload\(\)/);
});

test('the download box is about the newest download, not the first one ever seen', () => {
  const T = Date.parse('2026-10-18T12:00:00Z');
  const at = (model, phase, msAgo) => ({ id: model, model, phase, status: '', updatedAt: new Date(T - msAgo).toISOString() });
  const oldDone = at('old:1b', 'complete', 1_000);
  const failing = at('new:7b', 'failed', 500);
  const running = at('comfy-flux', 'pulling', 30_000);
  assert.equal(pickDockProgress({ 'old:1b': oldDone, 'new:7b': failing }, null, T)?.model, 'new:7b');
  assert.equal(pickDockProgress({ 'old:1b': oldDone, 'new:7b': failing, 'comfy-flux': running }, null, T)?.model, 'comfy-flux',
    'one still going outranks one that ended');
  assert.equal(pickDockProgress({ 'old:1b': oldDone, 'new:7b': failing }, 'old:1b', T)?.model, 'old:1b', 'the queue names it');
  assert.equal(pickDockProgress({ 'old:1b': at('old:1b', 'complete', 60_000) }, null, T), undefined);
  assert.match(dock, /pickDockProgress\(pullProgressByModel, pullingModel, now\)/);
});

test('Pause is offered only for an Ollama pull', () => {
  assert.equal(canPauseDownload(true, { runtime: 'ollama' }), true);
  assert.equal(canPauseDownload(true, {}), true);
  assert.equal(canPauseDownload(true, { runtime: 'comfyui' }), false);
  assert.equal(canPauseDownload(false, { runtime: 'ollama' }), false);
  assert.equal(canPauseDownload(true, undefined), false);
  assert.match(dock, /const showPause = !isPaused && canPause;/);
  assert.match(cabinet, /\{canPause && \(\s*<button[^>]*?className="mini-button outline queue-pause-button"/);
  assert.match(callbackBody('pauseDownloadQueue'), /if \(!pullCanPause\)/);
});

test('a download started on the Models screen shows the model terms first', () => {
  const body = callbackBody('queueModel');
  assert.match(body, /requestThirdPartyModelDownloads\(\[row\]\)/);
  assert.doesNotMatch(body, /\.add\(row\.displayName\)/, 'nothing joins the queue before the dialog');
  assert.doesNotMatch(body, /createQueuedPullProgress/);
  assert.ok(app.indexOf('const requestThirdPartyModelDownloads = useCallback(') < app.indexOf('const queueModel = useCallback('),
    'declared first, so queueModel can list it as a dependency');
});

test('Get on a model the queue would refuse is disabled and says why', () => {
  const tooBig = getHardwareFit({ params: '70B', sizeGb: 42 }, 8);
  const unknown = getHardwareFit({ params: '7B', sizeGb: 0 }, 8);
  const fits = getHardwareFit({ params: '3B', sizeGb: 2 }, 8);
  assert.equal(downloadBlockedLabel(tooBig), 'Too big for this PC');
  assert.equal(downloadBlockedLabel(unknown), 'Size unknown');
  assert.equal(downloadBlockedLabel(getHardwareFit({ params: '7B', sizeGb: 5 }, 0)), 'Graphics memory unknown');
  assert.equal(downloadBlockedLabel(fits), null);
  for (const source of [cabinet, sideCard]) assert.doesNotMatch(source, /download anyway/i);
  assert.match(cabinet, /disabled=\{!queued && \(!platformFit\.compatible \|\| Boolean\(blockedLabel\)\)\}/);
  assert.match(sideCard, /disabled=\{Boolean\(blockedLabel\)\}/);
});
