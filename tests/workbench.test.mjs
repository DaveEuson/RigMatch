// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  WORKBENCHES, CHANNEL_IDS, balanceChannel, isComparedChannel, readWorkbench, workbenchById, workbenchForGoal,
} = await import('../src/lib/workbench.ts');
const { GOALS } = await import('../src/lib/goals.ts');
const { TASK_FILTER_CHIPS } = await import('../src/lib/modelCatalog.ts');

/**
 * Advanced Mode's channels. Built on the goal taxonomy, so a goal that belongs
 * to no channel would be a first-run answer the app silently ignores.
 */

test('every goal lives in exactly one channel', () => {
  for (const goal of GOALS) {
    const homes = WORKBENCHES.filter((workbench) => workbench.goals.includes(goal.id));
    assert.equal(homes.length, 1, `${goal.id} is in ${homes.map((w) => w.id).join(', ') || 'no channel'}`);
  }
});

test('a first-run goal opens its channel', () => {
  assert.equal(workbenchForGoal('talk'), 'chat');
  assert.equal(workbenchForGoal('write'), 'chat');
  assert.equal(workbenchForGoal('use-tools'), 'chat');
  assert.equal(workbenchForGoal('code'), 'code');
  assert.equal(workbenchForGoal('make-images'), 'images');
  assert.equal(workbenchForGoal('make-video'), 'video');
  assert.equal(workbenchForGoal('animate-image'), 'video');
  assert.equal(workbenchForGoal('transcribe-file'), 'listening');
  assert.equal(workbenchForGoal('describe-image'), 'reading');
  // Nothing grades made audio yet, so it has no channel of its own to open.
  assert.equal(workbenchForGoal('make-audio'), 'all');
  assert.equal(workbenchForGoal(undefined), 'all');
});

test('only a real channel is remembered', () => {
  assert.equal(readWorkbench('video'), 'video');
  assert.equal(readWorkbench('all'), 'all');
  assert.equal(readWorkbench('toaster'), null);
  assert.equal(readWorkbench(null), null);
});

test('every channel filter is a Models filter people can see and clear', () => {
  const chips = new Set(TASK_FILTER_CHIPS.map((chip) => chip.id));
  for (const workbench of WORKBENCHES) {
    if (workbench.taskFilter) assert.ok(chips.has(workbench.taskFilter), `${workbench.id} uses ${workbench.taskFilter}`);
  }
  assert.equal(workbenchById('all').taskFilter, null);
});

test('each channel has its own fader, and All ranks the way chat does', () => {
  assert.deepEqual([...CHANNEL_IDS].sort(), ['chat', 'code', 'images', 'listening', 'reading', 'video']);
  assert.equal(balanceChannel('all'), 'chat');
  assert.equal(balanceChannel('video'), 'video');
});

test('only the channels Speed Dating cannot test compare their own results', () => {
  // Speed Dating asks questions; these make something instead of answering.
  assert.deepEqual(WORKBENCHES.map((workbench) => workbench.id).filter(isComparedChannel), ['images', 'video', 'listening']);
});

test('a channel with no Lab card says where its test runs instead', () => {
  for (const workbench of WORKBENCHES) {
    if (workbench.labCards.length === 0) assert.ok(workbench.labNote, `${workbench.id} has neither cards nor a note`);
  }
});

test('a media channel says which way the media goes', () => {
  // "Images" alone could be a model that draws them or one that reads them.
  const label = (id) => workbenchById(id).label;
  assert.equal(label('images'), 'Makes images');
  assert.equal(label('reading'), 'Reads images');
  assert.equal(label('video'), 'Makes video');
  assert.equal(label('listening'), 'Listens to audio');
  // Making and reading images sit side by side on the switch.
  const order = WORKBENCHES.map((workbench) => workbench.id);
  assert.equal(order.indexOf('reading'), order.indexOf('images') + 1);
});

test('every channel finishes a sentence in lower case', () => {
  // "What matters more for making images?", not "for makes images?".
  for (const workbench of WORKBENCHES) {
    assert.ok(workbench.activity, `${workbench.id} has no activity`);
    assert.equal(workbench.activity, workbench.activity.toLowerCase(), workbench.id);
  }
});
