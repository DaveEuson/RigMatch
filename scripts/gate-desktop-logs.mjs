#!/usr/bin/env node
/**
 * The run log, driven through the real desktop app.
 *
 * The web preview cannot test this. `getLogs()` there returns
 * `{ entries: [], logPath: 'Preview mode' }`, so every button is inert and a
 * green screenshot proves nothing — which is exactly how a broken loadLogs
 * would reach a release. useAppLogs was extracted out of App() with no runtime
 * coverage at all, and this closes that.
 *
 * Two safety properties matter more than the assertions:
 *
 * NEVER INSTALL. The NSIS installer shares a GUID with the real copy on this
 * machine and would evict it. This launches electron/main.cjs directly with
 * RIGMATCH_FORCE_BUILT_RENDERER=1, which loads dist/ without packaging
 * anything.
 *
 * NEVER TOUCH REAL LOGS. They live at userData/rigmatch-log.jsonl, and
 * clearLogs() would delete the user's own history. `--user-data-dir` redirects
 * userData to a temp profile, and the run asserts that redirect took effect
 * before it clears anything.
 *
 * Usage:  node scripts/gate-desktop-logs.mjs
 */

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

if (!existsSync('dist/index.html')) {
  throw new Error('dist/index.html missing — run `npm run build` first');
}

const profile = mkdtempSync(join(tmpdir(), 'rigmatch-gate-'));
const results = [];
const record = (name, ok, note) => {
  results.push({ name, ok, note });
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

console.log('Desktop log gate\n');
console.log(`  profile: ${profile}\n`);

let app = null;
try {
  app = await electron.launch({
    args: ['electron/main.cjs', `--user-data-dir=${profile}`],
    env: { ...process.env, RIGMATCH_FORCE_BUILT_RENDERER: '1' },
  });

  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  const isolated = userData.startsWith(profile);
  record('the profile is isolated from real user data', isolated, userData);
  if (!isolated) throw new Error('refusing to continue — this would clear the real run log');

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Without this the whole run could pass against preview stubs and prove
  // nothing at all — the false green this gate exists to rule out.
  const desktop = await page.evaluate(() => Boolean(window.agentArcade));
  record('running as the desktop app, not the preview stub', desktop);
  if (!desktop) throw new Error('window.agentArcade missing — this is the web build');

  const marker = `gate-marker-${results.length}-${userData.length}`;
  await page.evaluate(async (text) => {
    await window.agentArcade.appendLog({ level: 'info', message: text });
  }, marker);

  const loaded = await page.evaluate(() => window.agentArcade.getLogs(200));
  const realPath = typeof loaded?.logPath === 'string' && loaded.logPath !== 'Preview mode';
  record('logs:list returns a real path, not the preview stub', realPath, loaded?.logPath);
  record(
    'an appended entry comes back',
    Array.isArray(loaded?.entries) && loaded.entries.some((e) => String(e.message ?? '').includes(marker)),
    `${loaded?.entries?.length ?? 0} entr(y/ies)`,
  );

  // The UI path: openLogsPanel() moves to History and calls loadLogs(). This is
  // the part that moved into useAppLogs, so drive it rather than the API.
  await page.evaluate(() => {
    localStorage.setItem('rigmatch:ui-mode:v1', 'advanced');
    localStorage.setItem('rigmatch:first-run-tutorial:v1', 'seen');
    localStorage.setItem('rigmatch:mode-splash:v1', 'chosen');
    localStorage.setItem('rigmatch:goals-offered:v1', 'yes');
  });
  await page.reload();
  await page.waitForSelector('.side-menu-item', { timeout: 20000 });
  await page.getByLabel('Scorecards').click();
  await page.waitForTimeout(600);

  const shown = await page.evaluate((text) => document.body.innerText.includes(text), marker);
  const pathShown = await page.evaluate(
    (p) => document.body.innerText.includes(p) || document.body.innerText.includes('rigmatch-log'),
    profile,
  );
  record('the History panel renders loaded entries', shown);
  record('the log path is shown to the user', pathShown);

  const copied = await page.evaluate(async () => {
    const before = await window.agentArcade.getLogs(200);
    return before.entries.length;
  });

  const cleared = await page.evaluate(() => window.agentArcade.clearLogs());
  record(
    'logs:clear empties the log',
    Array.isArray(cleared?.entries) && cleared.entries.length === 0,
    `${copied} -> ${cleared?.entries?.length ?? '?'}`,
  );

  // logs:openFolder is deliberately not invoked: it opens a file-manager window
  // on the user's desktop, and a gate should not litter someone's screen.
  //
  // Its existence is probed by trying to register a second handler on the same
  // channel, which Electron refuses. ipcMain.eventNames() cannot answer this —
  // it lists on() channels, while handle() keeps its own map — and asking it
  // reported the handler missing when it was there all along.
  const openFolder = await app.evaluate(({ ipcMain }) => {
    try {
      ipcMain.handle('logs:openFolder', () => {});
      ipcMain.removeHandler('logs:openFolder'); // nothing was there; undo ours
      return 'absent';
    } catch (error) {
      return /second handler/i.test(String(error?.message)) ? 'registered' : `unclear: ${error?.message}`;
    }
  });
  record('logs:openFolder is registered', openFolder === 'registered', openFolder);
} finally {
  if (app) await app.close().catch(() => {});
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  ${f.name}`);
  process.exit(1);
}
