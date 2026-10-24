// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * From the 2026-10-24 sweep of the real desktop app: copy feedback, the
 * "Report ready" notice, the Ranking's fader and the Runs dates. The clipboard
 * permission itself is tested against electron/security.cjs in security.test.mjs.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');

test('Copy results says whether it copied', () => {
  const panel = read('../src/components/UtilityPanel.tsx');
  assert.doesNotMatch(panel, /navigator\.clipboard\.writeText/, 'a bare writeText had no catch: an unhandled rejection and no word');
  assert.match(panel, /void copyText\(text\)\.then\(\(ok\) => \{\s*setScoreCopy\(ok \? 'copied' : 'failed'\)/);
  assert.match(panel, /scoreCopy === 'failed' \? 'Couldn’t copy' : 'Copy results'/);
});

test('the copy icon says what happened beside it, where a screen reader hears it', () => {
  const button = read('../src/components/FitGrade.tsx');
  assert.match(button, /<span className="copy-command-note" role="status">\{note\}<\/span>/);
  assert.match(button, /copied \? 'Copied' : 'Couldn’t copy'/);
});

test('"Report ready" takes a row of its own instead of covering the screen', () => {
  const shell = read('../src/styles/shell.css');
  assert.match(shell, /\.app-shell:has\(> \.report-ready-bar\) \{\s*grid-template-rows: auto auto minmax\(0, 1fr\) auto auto;\s*grid-template-areas: "topbar" "strip" "stage" "notice" "lineup";/);
  assert.match(shell, /\.app-shell \.report-ready-bar \{\s*grid-area: notice;\s*position: static;/);
});

test("the Ranking's fader keeps its height in the scrolling column", () => {
  assert.match(read('../src/App.css'), /\.comparison-view > \.balance-fader \{\s*flex-shrink: 0;\s*\}/);
});

test('Runs writes every time in the same short form', () => {
  const runs = read('../src/components/ActivityPanel.tsx');
  assert.doesNotMatch(runs, /toLocaleString\(/, 'the default form ("10/24/2026, 3:13:59 PM") sat beside "Oct 24, 03:13 PM"');
  assert.match(runs, /formatHistoryTime\(report\.completedAt\)/);
});
