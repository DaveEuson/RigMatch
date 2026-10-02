// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACHIEVEMENTS,
  achievementSnapshot,
  earnedFrom,
  markAchievementsSeen,
  readAchievementState,
  recordAchievements,
  unannounced,
  withEarned,
} from '../src/lib/achievements.ts';

/**
 * Achievements are read from what RigMatch already keeps, so each one is a
 * claim about something that happened on this PC. These pin what each badge
 * needs, that earning one is permanent, and that upgrading never announces
 * old runs as new.
 */

const runs = (...models) => models.map((model) => ({ model }));

test('nothing done, nothing earned', () => {
  assert.deepEqual(earnedFrom({}), []);
  assert.deepEqual(earnedFrom({ runs: [], results: [], labChallenges: [], platform: '' }), []);
});

test('runs earn the first, second and fifth date', () => {
  assert.deepEqual(earnedFrom({ runs: runs('qwen3.5:9b') }), ['first-date']);
  // The same model under two spellings is one model tested twice.
  assert.deepEqual(earnedFrom({ runs: runs('qwen3.5:9b', 'Qwen3.5:9B') }), ['first-date', 'second-date']);
  const four = runs('a:1b', 'b:1b', 'c:1b', 'd:1b');
  assert.ok(!earnedFrom({ runs: four }).includes('speed-dater'));
  assert.ok(earnedFrom({ runs: [...four, { model: 'e:1b' }] }).includes('speed-dater'));
});

test('a judge, a tool question and an edgy or difficult one each earn their badge', () => {
  const earned = (prompts) => earnedFrom({ results: [{ prompts }] });
  assert.deepEqual(earned([{ type: 'chat', scoredBy: 'heuristic' }]), []);
  assert.deepEqual(earned([{ type: 'chat', scoredBy: 'judge' }]), ['fair-judge']);
  assert.deepEqual(earned([{ type: 'tools', scoredBy: 'heuristic' }]), ['hands-on']);
  assert.deepEqual(earned([{ type: 'edgy' }]), ['thick-skin']);
  assert.deepEqual(earned([{ type: 'candour' }]), ['thick-skin']);
});

test('a picture or a sound from the Lab, and Linux, earn theirs', () => {
  assert.deepEqual(earnedFrom({ labChallenges: ['code', 'image-generation'] }), ['picture-this']);
  assert.deepEqual(earnedFrom({ labChallenges: ['audio-generation'] }), ['say-it']);
  assert.deepEqual(earnedFrom({ platform: 'linux' }), ['penguin']);
  assert.deepEqual(earnedFrom({ platform: 'Windows' }), []);
  assert.deepEqual(earnedFrom({ platform: 'win32' }), []);
});

test('testing Ajax, under any name it ships with, earns the hidden one', () => {
  for (const name of ['ajax:latest', 'ajax-qwen35', 'hf.co/odysseus-dev/Ajax-Qwen3.5-9B-GGUF:Q4_K_M']) {
    assert.ok(earnedFrom({ runs: runs(name) }).includes('trojan-hero'), name);
  }
  assert.ok(!earnedFrom({ runs: runs('qwen3.5:9b') }).includes('trojan-hero'));
  assert.ok(!earnedFrom({ runs: runs('pajaxtra:7b') }).includes('trojan-hero'), 'a word containing ajax is not Ajax');
});

test('hidden badges keep their secret, and say what they unlock', () => {
  for (const a of ACHIEVEMENTS.filter((x) => x.hidden)) {
    assert.ok(a.hint, `${a.id} is hidden with no hint`);
    assert.doesNotMatch(a.hint, /ajax|odysseus/i, `${a.id}'s hint gives it away`);
  }
  assert.match(ACHIEVEMENTS.find((a) => a.id === 'trojan-hero').reward, /Trojan stage/);
});

test('stored state drops anything it does not recognise', () => {
  assert.deepEqual(readAchievementState(null), { earned: {}, seen: [] });
  assert.deepEqual(readAchievementState('nope'), { earned: {}, seen: [] });
  const state = readAchievementState(JSON.stringify({
    earned: { 'first-date': '2026-10-02T10:00:00Z', 'made-up': '2026-10-02T10:00:00Z', 'penguin': 5 },
    seen: ['first-date', 'made-up', 7],
  }));
  assert.deepEqual(state, { earned: { 'first-date': '2026-10-02T10:00:00Z' }, seen: ['first-date'] });
});

test('a badge keeps the date it was first earned', () => {
  const once = withEarned({ earned: {}, seen: [] }, ['first-date'], '2026-10-01T00:00:00Z');
  const again = withEarned(once, ['first-date', 'penguin'], '2026-10-05T00:00:00Z');
  assert.equal(again.earned['first-date'], '2026-10-01T00:00:00Z');
  assert.equal(again.earned.penguin, '2026-10-05T00:00:00Z');
  assert.equal(withEarned(again, ['penguin'], '2026-11-01T00:00:00Z'), again, 'nothing new, nothing written');
});

test('the look at launch is quiet; a run after it is announced once, and kept when its evidence goes', () => {
  // Launch: last month's runs go straight onto the shelf, unannounced.
  recordAchievements({ runs: runs('llama3.2:3b', 'llama3.2:3b') }, { quiet: true });
  assert.deepEqual(unannounced(achievementSnapshot()), []);
  assert.ok(achievementSnapshot().earned['second-date']);
  // A show tonight: announced.
  recordAchievements({ runs: runs('llama3.2:3b', 'llama3.2:3b', 'ajax-qwen35') });
  assert.deepEqual(unannounced(achievementSnapshot()).map((a) => a.id), ['trojan-hero']);
  markAchievementsSeen(['trojan-hero']);
  assert.deepEqual(unannounced(achievementSnapshot()), []);
  // Run history pruned the Ajax run; the badge stays.
  recordAchievements({ runs: runs('llama3.2:3b') });
  assert.ok(achievementSnapshot().earned['trojan-hero']);
});

test('the app records badges from its saved runs, results and Lab, quietly at launch', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
  const at = app.indexOf('recordAchievements({');
  assert.ok(at > 0, 'the app never records achievements');
  const call = app.slice(at - 400, at + 500);
  assert.match(call, /if \(!isDesktopRuntime\) return;/, 'the preview page sample data would earn badges');
  assert.match(call, /runs: Object\.values\(runHistory\.runs\)\.flat\(\)/);
  assert.match(call, /results: Object\.values\(benchmarkByModel\)/);
  assert.match(call, /\{ quiet \}/);
  const lab = readFileSync(new URL('../src/lib/labResults.ts', import.meta.url), 'utf-8');
  assert.match(lab, /recordAchievements\(\{ labChallenges: labChallengesWithOutput\(results\) \}\)/);
});
