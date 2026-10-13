import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { getDownloadRowStatus, summarizeDownloadStep } = await import('../src/lib/downloadStatus.ts');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

test('a pick with no download behind it is not waiting in line', () => {
  assert.equal(getDownloadRowStatus(false, undefined), 'notStarted');
  const summary = summarizeDownloadStep(['done', 'notStarted']);
  assert.equal(summary.stillMoving, false, 'nothing is moving, so the step must not claim it is');
  assert.equal(summary.notStartedCount, 1);
  assert.equal(summary.canContinue, false);
  assert.match(summary.blockedReason, /Nothing is downloading yet\. Press Start the downloads\./);
});

test('a queued or running download is still moving, and a failure keeps its own message', () => {
  assert.equal(summarizeDownloadStep(['done', 'queued']).stillMoving, true);
  assert.equal(summarizeDownloadStep(['done', 'notStarted', 'downloading']).blockedReason, undefined);
  const failed = summarizeDownloadStep(['done', 'failed', 'notStarted']);
  assert.match(failed.blockedReason, /download didn't finish/);
});

test('the Download screen offers a Start button when nothing is moving', () => {
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /const canStart = !canRetry && statuses\.includes\('notStarted'\) && !moving;/);
  assert.match(wizard, /\{canRetry \? 'Try the downloads again' : 'Start the downloads'\}/);
});

test('a picture or listening round with no one able to run it never borrows the chat winner', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /: wizardRound === 'vision' \|\| wizardRound === 'listening'\n\s*\? null\n\s*: wizardShowRanked/);
  assert.match(app, /: wizardRound === 'vision' \|\| wizardRound === 'listening'\n\s*\? \[\]\n\s*: wizardShowRanked/);
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /Nobody could take this round/);
});

test('Pick opens on the chip the person left it on, and the code round shows its questions', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /initialDream=\{wizardDreamSeen \? wizardDream : dreamForGoal\(selectedGoals\[0\]\)\}/);
  assert.match(app, /onDreamChange=\{changeWizardDream\}/);
  assert.match(app, /if \(skillRunStatus\.phase === 'idle'\) return wizardRound === 'code' \? runProgress : null;/);
});
