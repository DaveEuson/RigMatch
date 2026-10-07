// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { HOST_LINES, hostLine } from '../src/lib/hostScript.ts';
import { matchMeasures } from '../src/lib/matchCard.ts';
import { questionSetLabel, questionsForSet } from '../src/lib/runSheet.ts';
import { DEFAULT_BENCHMARK_QUESTIONS } from '../src/benchmarkSuite.ts';

/**
 * Simple Mode as the redesign draws it: the host's script, one gold button a
 * screen, rows instead of cards, a plain scoreboard under the lit stage, and a
 * three-step welcome on the first run.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const wizard = read('../src/components/SimpleWizard.tsx');
const app = read('../src/App.tsx');

test('the host keeps to the script: short lines, numbers filled in, never left as braces', () => {
  for (const [situation, lines] of Object.entries(HOST_LINES)) {
    for (const line of lines) {
      const words = line.replace(/\{\w+\}/g, 'x').split(/\s+/).length;
      assert.ok(words < 30, `${situation}: "${line}" runs ${words} words`);
    }
  }
  assert.equal(hostLine('setupDone', { vram: 12 }), "Lovely! 12 GB of graphics memory. That's room for some very charming contestants.");
  // The variants rotate by turn.
  assert.notEqual(hostLine('pick', {}, 0), hostLine('pick', {}, 1));
  assert.equal(hostLine('pick', {}, 3), hostLine('pick', {}, 0));
  // A missing number is left out, never printed as a brace.
  assert.doesNotMatch(hostLine('download', {}), /[{}]/);
});

test('the script\'s Trojan line is not used: the stage is earned by testing Ajax, not by the smallest model', () => {
  assert.match(hostLine('trojan'), /Ajax/);
  assert.doesNotMatch(read('../src/lib/hostScript.ts'), /smallest contestant/);
});

test('one gold button a screen, and none while the show runs', () => {
  // Only Pick and Download have the footer with its gold Start.
  assert.match(wizard, /const footerStep = step === 'pick' \|\| step === 'download';/);
  // The running show's controls are an outline Stop and a text link.
  const controlsAt = wizard.indexOf('<div className="sw-show-controls">');
  const controls = wizard.slice(controlsAt, wizard.indexOf('Stop the show', controlsAt));
  assert.ok(controls.length > 0, 'the show has no controls');
  assert.doesNotMatch(controls, /btn-gold/);
  // The winner's one gold button is Chat.
  const actions = wizard.slice(wizard.indexOf('<div className="sw-winner-actions">', wizard.indexOf('const name = getFriendlyModelName')), wizard.indexOf('<AchievementUnlocked />', wizard.indexOf('sw-winner-chat')));
  assert.equal(actions.match(/btn-gold/g)?.length, 1);
  assert.match(actions, /Chat with \{name\}/);
});

test('Setup is one button that walks the whole step', () => {
  assert.match(wizard, /\{isScanning \? 'Looking…' : 'Check my computer'\}/);
  assert.match(wizard, /onClick=\{onContinue\}>Choose your models<\/button>/);
});

test('the Pick footer says what the show will ask, and Change opens the run sheet', () => {
  assert.match(app, /planLine=\{wizardPlanLine\}/);
  assert.match(app, /questionSetLabel\(benchmarkQuestions\)/);
  // The same sheet as Start, opened with its settings unfolded (runSheet.test.mjs).
  assert.match(wizard, /onChangePlan=\{skipDownload && pickDone \? changePlan : undefined\}/);
  assert.equal(questionSetLabel(DEFAULT_BENCHMARK_QUESTIONS), 'General');
  assert.equal(questionSetLabel(questionsForSet('coding')), 'Coding');
  assert.equal(questionSetLabel([{ ...DEFAULT_BENCHMARK_QUESTIONS[0], prompt: 'Something else' }]), 'your questions');
});

test('the winner shows the four measurements behind the score', () => {
  assert.deepEqual(
    matchMeasures({ sobriety: 94, speed: 92, stability: 96, fit: 90, total: 93 }).map((m) => [m.label, m.value]),
    [['Accuracy', 94], ['Speed', 92], ['Stability', 96], ['Fit', 90]],
  );
  // A score saved before stability was measured shows its total there, as the share card does.
  assert.equal(matchMeasures({ sobriety: 1, speed: 2, fit: 3, total: 77 })[2].value, 77);
  assert.match(app, /measures: matchMeasures\(top\)/);
});

test('the first run is one three-step welcome, and Settings brings it back', () => {
  const welcome = read('../src/components/WelcomeOverlay.tsx');
  assert.match(welcome, /const STEPS = \['welcome', 'model', 'goal'\] as const;/);
  // The first run must be answered or skipped; only the replay closes on Escape.
  assert.match(welcome, /useDialog<HTMLDivElement>\(replay \? onClose : undefined\)/);
  assert.match(app, /\{showModeSplash && \(\s*<WelcomeOverlay/);
  assert.match(read('../src/components/UtilityPanel.tsx'), /Show the welcome again/);
  for (const file of ['FirstRunTutorial', 'ModeStep']) {
    assert.ok(!existsSync(new URL(`../src/components/${file}.tsx`, import.meta.url)), `${file}.tsx is back`);
  }
});
