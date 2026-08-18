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
  const isRegistered = async (channel) => app.evaluate(({ ipcMain }, name) => {
    try {
      ipcMain.handle(name, () => {});
      ipcMain.removeHandler(name); // nothing was there; undo ours
      return 'absent';
    } catch (error) {
      return /second handler/i.test(String(error?.message)) ? 'registered' : `unclear: ${error?.message}`;
    }
  }, channel);

  const openFolder = await isRegistered('logs:openFolder');
  record('logs:openFolder is registered', openFolder === 'registered', openFolder);

  // ── updates (useAppUpdates) ───────────────────────────────────────────────
  //
  // Nothing here is invoked for real. app:installUpdate quits and relaunches
  // the app, app:downloadUpdate pulls an installer, and app:checkForUpdates
  // reaches the network, which would make this gate fail on a train. What can
  // be proved offline and without side effects is that every channel the
  // extracted callbacks reach is registered, and — the part that matters — that
  // the effect which moved into the hook is still subscribed.
  for (const channel of ['app:checkForUpdates', 'app:openUpdatePage', 'app:checkAutoUpdate', 'app:downloadUpdate', 'app:installUpdate']) {
    const state = await isRegistered(channel);
    record(`${channel} is registered`, state === 'registered', state === 'registered' ? undefined : state);
  }

  await page.getByLabel('Settings').click();
  await page.waitForTimeout(400);

  // SettingsSection renders `{isOpen && children}` and defaults to closed, so
  // UpdateCenter is not merely hidden — it is absent from the DOM. Asserting
  // against it while collapsed reported the updater subscription dead when it
  // was fine, which is the kind of false alarm that gets a gate ignored.
  await page.locator('.settings-section-toggle', { hasText: /Versions & Release Notes/ }).first().click();
  await page.waitForSelector('.update-center', { timeout: 10000 });
  record('the Updates section opens', await page.locator('.update-center').count() === 1);

  // Push a status from the main process exactly as electron-updater would. If
  // useAppUpdates still subscribes via onUpdaterStatus, the download button
  // shows the percentage; if the effect was dropped in the move, nothing
  // changes and no other check would notice.
  await app.evaluate(({ BrowserWindow }) => {
    const [win] = BrowserWindow.getAllWindows();
    win.webContents.send('updater:status', { phase: 'downloading', percent: 42, version: '9.9.9' });
  });
  await page.waitForTimeout(600);

  const centre = page.locator('.update-center');
  const showsProgress = (await centre.innerText()).includes('42%');
  record('the updater subscription is live (42% reaches the UI)', showsProgress);

  const checkDisabled = await centre.getByRole('button', { name: /^Check(ing)?$/ }).first().isDisabled().catch(() => null);
  record('a download in flight disables Check', checkDisabled === true, String(checkDisabled));

  // selectUpdateChannel writes the shared status line — the one piece of the
  // hook that is safe to drive for real. Scoped to the update centre: an
  // unscoped name match hit a different button entirely and passed for the
  // wrong reason.
  const channelControl = centre.getByRole('button', { name: /beta|nightly/i }).first();
  if (await channelControl.count()) {
    const before = await page.evaluate(() => document.body.innerText);
    await channelControl.click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.body.innerText);
    record('choosing a channel reports it on the status line', before !== after);
  } else {
    record('choosing a channel reports it on the status line', false, 'no channel control in .update-center');
  }

  // Last on purpose: the wipe ends with setUiMode('beginner') and
  // setTutorialOpen(true), so it drops the app back to Simple Mode with the
  // first-run tutorial covering the screen. Running it earlier left a modal
  // backdrop intercepting every later click.
  // ── clear all data ────────────────────────────────────────────────────────
  //
  // Last on purpose: the wipe ends with setUiMode('beginner') and
  // setTutorialOpen(true), so it drops the app back to Simple Mode with the
  // first-run tutorial covering the screen, and any later click hits a modal
  // backdrop. A reload first, so this starts from a clean page rather than
  // whatever the update checks left behind.
  //
  // The wipe removed six hand-written keys while the app wrote twenty-four,
  // then reported "RigMatch app data cleared." The unit tests exercise the
  // sweep in isolation; only this shows that the button reaches it.
  await page.reload();
  await page.waitForSelector('.side-menu-item', { timeout: 20000 });
  await page.getByLabel('Settings').click();
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    localStorage.setItem('rigmatch:openrouter-key:v1', 'sk-gate-should-not-survive');
    localStorage.setItem('rigmatch:model-notes:v1', '{"llama3":"a private note"}');
    localStorage.setItem('rigmatch:comfy-folder:v1', 'C:/comfy');
    localStorage.setItem('rigmatch:a-key-invented-tomorrow:v9', 'canary');
    localStorage.setItem('not-ours', 'keep');
  });

  await page.locator('.settings-section-toggle', { hasText: /Scoring & Reset/ }).first().click();
  await page.waitForSelector('.danger-zone', { timeout: 10000 });
  await page.getByRole('button', { name: /^Clear All Data$/ }).first().click();
  await page.waitForSelector('.destructive-modal', { timeout: 10000 });
  await page.locator('.destructive-modal .modal-actions').getByRole('button', { name: /^Clear All Data$/ }).click();
  await page.waitForTimeout(1500);

  // Asserted as the absence of the failure, not the presence of the success
  // line: the wipe ends in Simple Mode with the tutorial open, so the status
  // line is not on screen to read. This is the check that caught the real bug —
  // clearLogs() is rate-limited in the main process, and one try/catch around
  // the whole wipe meant its failure abandoned everything, leaving the user
  // with "Could not clear all data" and nothing cleared.
  const failed = await page.evaluate(() => /Could not clear all data/i.test(document.body.innerText));
  record('the wipe does not report failure', !failed);

  const after = await page.evaluate(() => Object.fromEntries(
    Object.entries(localStorage).filter(([k]) => k.startsWith('rigmatch:')),
  ));

  // Not "no keys survive": the save effects immediately re-persist the app's
  // fresh defaults, which is correct — the question suite, ui-mode 'beginner',
  // an empty match list. What must not survive is anything the user put there.
  record('the planted canary key is gone', !('rigmatch:a-key-invented-tomorrow:v9' in after), Object.keys(after).join(', ') || 'nothing left');
  record('a saved API key does not survive', !('rigmatch:openrouter-key:v1' in after));
  record('private model notes do not survive', !('rigmatch:model-notes:v1' in after));
  record('the ComfyUI folder does not survive', !('rigmatch:comfy-folder:v1' in after));
  record(
    'nothing that survives holds planted data',
    !Object.values(after).some((v) => /sk-gate-should-not-survive|a private note|C:\/comfy|canary/.test(String(v))),
  );
  record(
    'keys belonging to other apps are untouched',
    await page.evaluate(() => localStorage.getItem('not-ours')) === 'keep',
  );

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

// Electron leaves a handle behind that outlives app.close(), so the run has to
// end itself. Without this the gate hangs after every check has already passed,
// which reads as a failure and cost a debugging round on its first outing.
process.exit(0);
