// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const app = read('../src/App.tsx');
const wizard = read('../src/components/SimpleWizard.tsx');
/** Whether a source carries a line; a failing match must not print the whole file. */
const has = (source, pattern) => pattern.test(source);

const { isMakerDream, makerFooterHint } = await import('../src/lib/wizardCopy.ts');

/**
 * Three Simple Mode findings from the 0.9.7 bug scan: a model whose download
 * failed still stood on the stage, the Show and Winner steps stayed ticked
 * after the lineup changed, and a maker chip's footer asked for picks that
 * could never be made.
 */

test('only the models that are in the show stand on the stage', () => {
  // The show runs the installed picks (runListTest). A pick whose download
  // failed and was carried on without stayed a podium: "contestant 1 of 3" of
  // two, and once the run moved past its place it read "Done".
  const compare = wizard.slice(wizard.indexOf('export function CompareScreen'));
  assert.equal(has(compare, /const contestants = shortlistedRows\.filter\(\(row\) => row\.installed\);/), true, 'the stage lists every pick');
  assert.equal(has(compare, /const modelCount = contestants\.length;/), true);
  assert.equal(has(compare, /\{contestants\.map\(\(row, index\) => \{/), true);
  assert.equal(has(compare, /const modelCount = shortlistedRows\.length;/), false);
  assert.equal(has(compare, /\{shortlistedRows\.map\(\(row, index\) => \{/), false);
});

test('a finished show is this lineup\'s only while its results are', () => {
  // The Winner step fell back to the best score ever saved, and Compare's
  // "complete" belonged to whichever show last ran, so both stayed ticked for
  // a lineup that had never been on stage.
  const winner = app.slice(app.indexOf('const wizardWinner = useMemo('), app.indexOf('const openChatWithWinner'));
  assert.equal(has(winner, /topRigPick\?\.score/), false, 'the Winner screen crowns the show, never the saved Top Match');
  const progress = app.slice(app.indexOf('const wizardRunProgress'), app.indexOf('const wizardRunProgress') + 2200);
  assert.equal(has(progress, /progress\?\.phase === 'complete' && progress\.total > 0 && !\(wizardShowResult \|\| wizardSkillBoard\)/), true,
    'a complete show with no result on this stage is no show at all');
  // Derived after the show's results, which it is read against.
  assert.ok(app.indexOf('const wizardRunProgress') > app.indexOf('const wizardShowResult = useMemo('));
});

test('a maker chip\'s footer points at the card, not at picks that cannot be made', () => {
  for (const dream of ['image', 'video', 'audio']) {
    assert.equal(isMakerDream(dream), true, dream);
    assert.match(makerFooterHint(dream), /not in the show/, dream);
  }
  assert.match(makerFooterHint('image'), /^Picture makers/);
  assert.match(makerFooterHint('audio'), /^Sound makers/);
  for (const dream of ['talk', 'write', 'code', 'read-image', 'hear', 'all', undefined]) {
    assert.equal(isMakerDream(dream), false, String(dream));
    assert.equal(makerFooterHint(dream), '', String(dream));
  }
  // Pick's footer: the hint where the tray was, and no disabled "Pick 2 or more".
  assert.equal(has(wizard, /const makerHint = step === 'pick' && shortlistedRows\.length === 0 \? makerFooterHint\(props\.dream\) : '';/), true);
  assert.equal(has(wizard, /\{makerHint\n\s*\? <span className="sw-footer-hint">\{makerHint\}<\/span>\n\s*: step === 'pick'/), true);
  assert.equal(has(wizard, /\{!makerHint && \(\n\s*<button\n\s*type="button"\n\s*className="btn btn-gold"\n\s*onClick=\{goNext\}/), true);
  assert.equal(has(app, /dream=\{wizardDream\}/), true, 'the wizard is told which chip is up');
});
