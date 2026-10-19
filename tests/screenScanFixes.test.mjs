// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { goalsAfterWelcome } from '../src/lib/goals.ts';
import { buildHatchProfile } from '../src/lib/hatchProfile.ts';

/**
 * Screens and flows from the 2026-10-18 bug scan. Most of these live in
 * components the tests cannot render, so they are held by source scans.
 */

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf-8');
const app = read('App.tsx');
const lab = read('components/AdvancedCapabilityLab.tsx');
const listening = read('components/ListeningLab.tsx');
const sideCard = read('components/SelectedContestantCard.tsx');

/** One function's body, from its declaration to the next line that closes it at its own indent. */
function bodyOf(source, declaration, closer = '\n  }') {
  const start = source.indexOf(declaration);
  assert.ok(start >= 0, `${declaration} not found`);
  return source.slice(start, source.indexOf(closer, start + declaration.length));
}

test('the Code round builds apps only after its question round finished', () => {
  const run = bodyOf(app, 'const runListTest = useCallback(', '\n  }, [');
  assert.match(run, /Promise<boolean>/);
  assert.equal((run.match(/return false;/g) ?? []).length, 4, 'too few, a host blocker, nobody finished, a crash');
  assert.match(run, /if \(uiMode === 'beginner'\) selectNav\('history'\);\s*return true;/);
  assert.match(app, /\.then\(\(finished\) => \(finished && !stopRunRef\.current \? runSkillTestsAfterRun\(models, 'app-builder'\) : undefined\)\)/);
});

test('Lab Run is claimed before the first await', () => {
  const build = bodyOf(lab, 'const startChallenge = useCallback(async () => {', '\n  }, [');
  assert.ok(build.indexOf("setRunState({ phase: 'running'") < build.indexOf('await '), 'App Builder');
  const picture = bodyOf(lab, 'const startImageChallenge = async () => {', '\n  };');
  assert.ok(picture.indexOf('imageAbortRef.current = controller;') < picture.indexOf('await '), 'picture');
  assert.ok(picture.indexOf("setImageRunState({ phase: 'running'") < picture.indexOf('await '), 'picture');
  const hear = bodyOf(listening, 'const start = useCallback(async () => {', '\n  }, [');
  assert.ok(hear.indexOf("setRunState({ phase: 'running'") < hear.indexOf('await '), 'listening');
});

test('the Lab picture test is on the render tracker, with its Stop', () => {
  const picture = bodyOf(lab, 'const startImageChallenge = async () => {', '\n  };');
  assert.match(picture, /startImageTest\(\{ key: trackKey, name: activeCheckpoint, message: checking, stop: \(\) => controller\.abort\(\) \}\);/);
  assert.match(picture, /describeImageTest\(trackKey, drawing\);/);
  assert.match(picture, /finally \{\s*imageAbortRef\.current = null;\s*endImageTest\(trackKey, outcome\);/);
});

test('the Listening Lab shows the picked model\'s result, not the last one run', () => {
  assert.match(listening, /const visible = \(runState\.result\?\.model === activeModel \? runState\.result : null\)/);
  assert.match(listening, /\(running \|\| !runState\.result \|\| runState\.result\.model === activeModel\)/);
});

test('"Logs" after a failed show opens My PC on its Logs view', () => {
  assert.match(read('hooks/useAppLogs.ts'), /setActiveNavId\('lan'\);/);
  assert.match(bodyOf(app, 'const openRunLogs = useCallback('), /openLogsPanel\(\);\s*setMyPcView\('logs'\);/);
  assert.match(app, /onOpenLogs=\{openRunLogs\}/);
});

test('"Export model profile" exports the model on its page, or says why not', () => {
  const candidates = [{ tag: 'yi:9b', sizeGb: 5, score: { total: 70, grade: 'C' } }, { tag: 'qwen3:8b', sizeGb: 5, score: { total: 90, grade: 'A' } }];
  const base = { candidates, device: 'GPU', gpuLabel: 'GPU', vramGb: 8, ramGb: 32 };
  const page = buildHatchProfile({ ...base, recommendedTag: 'yi:9b', only: true, isTopMatch: false });
  assert.equal(page.ok, true);
  assert.equal(page.profile.recommendedLocalModel, 'yi:9b');
  assert.doesNotMatch(JSON.stringify(page), /top match/i, 'not called the Top Match');
  const lmStudio = buildHatchProfile({ ...base, recommendedTag: 'qwen/qwen3-8b', only: true });
  assert.equal(lmStudio.ok, false);
  assert.match(lmStudio.reason, /qwen\/qwen3-8b/);
  assert.match(app, /onExportForHatch=\{\(\) => setExportHatchModel\(selectedModel\)\}/);
});

test('showing the welcome again keeps the mode and the other goals', () => {
  assert.deepEqual(goalsAfterWelcome(['code', 'write', 'chat'], ['write']), ['write', 'code', 'chat']);
  assert.deepEqual(goalsAfterWelcome(['code', 'write'], ['code']), ['code', 'write']);
  assert.deepEqual(goalsAfterWelcome(['code', 'write'], []), [], '"Show me everyone" clears them, as it says');
  assert.match(app, /saveGoalsFromSettings\(goalsAfterWelcome\(selectedGoals, goals\)\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*if \(advanced\) selectUiMode\('advanced'\);/);
});

test('a model opened from another screen clears the Models filters once, not on every visit', () => {
  assert.match(app, /if \(revealModel && activeNavId !== 'models'\) setRevealModel\(null\);/);
});

test('an installed ComfyUI model\'s side card offers no chat-only actions', () => {
  assert.match(sideCard, /const makesMedia = row\.runtime === 'comfyui';/);
  assert.match(sideCard, /\{installed && makesMedia \? \(/);
  assert.match(sideCard, /\{installed && !makesMedia && \(\s*<button[^>]*?onClick=\{\(\) => onQuickCheck\(row\)\}/);
  assert.match(sideCard, /\{!makesMedia && \(!speedDateLineupFull \|\| shortlisted\) && \(/);
  assert.match(sideCard, /\{installed && !makesMedia && \(\s*<button[^>]*?onClick=\{\(\) => onChooseModel\(row\.displayName\)\}/);
});
