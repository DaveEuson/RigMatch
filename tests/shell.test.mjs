// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { LAB_CHANNELS, SHOW_CHANNELS, TOP_TABS, tabForView, viewForTab } from '../src/lib/topTabs.ts';
import { LOW_DISK_GB, loadLevel } from '../src/lib/loadLevel.ts';
import { isComparedChannel } from '../src/lib/workbench.ts';

/**
 * The redesign's shell: a top bar with Advanced's six tabs (or Simple's step
 * tracker), the computer-load strip under it, then the screen. It replaced the
 * side menu, the stats deck and the ticker, and these pin that nothing those
 * held became unreachable in the move.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const NAV_IDS = ['lan', 'models', 'whatsNew', 'speedDate', 'agent', 'history', 'activity', 'settings'];
const CHANNELS = ['all', 'chat', 'code', 'images', 'video', 'listening', 'reading', 'audio'];

test('every screen the side menu reached is lit by a tab, except Settings, which has its own button', () => {
  for (const nav of NAV_IDS) {
    for (const channel of CHANNELS) {
      const tab = tabForView(nav, channel);
      if (nav === 'settings') assert.equal(tab, null);
      else assert.ok(TOP_TABS.some((t) => t.id === tab), `${nav} on ${channel} lights no tab`);
    }
  }
  assert.match(read('../src/components/TopBar.tsx'), /className="top-bar-settings" onClick=\{onOpenSettings\}/);
});

test('a tab opens a screen it lights, on a channel that belongs to it', () => {
  for (const tab of TOP_TABS) {
    for (const channel of CHANNELS) {
      const view = viewForTab(tab.id, channel);
      assert.equal(tabForView(view.nav, view.workbench ?? channel), tab.id, `${tab.id} from ${channel} lands on another tab`);
    }
  }
  // Labs are the channels that render or listen; the show takes the rest.
  for (const channel of LAB_CHANNELS) assert.ok(isComparedChannel(channel), channel);
  for (const channel of SHOW_CHANNELS) assert.ok(!isComparedChannel(channel), channel);
  assert.equal(LAB_CHANNELS.length + SHOW_CHANNELS.length, CHANNELS.length, 'a channel belongs to neither tab');
});

test('the load strip colors by how full, and free disk by whether a model still fits', () => {
  assert.equal(loadLevel(69), 'ok');
  assert.equal(loadLevel(70), 'busy');
  assert.equal(loadLevel(89), 'busy');
  assert.equal(loadLevel(90), 'full');
  assert.equal(LOW_DISK_GB, 20);
  const strip = read('../src/components/LoadStrip.tsx');
  assert.match(strip, /level: free < LOW_DISK_GB \? 'full' : 'ok'/);
  // A reading the machine did not give is left out, not shown as zero.
  assert.match(strip, /if \(system\.gpu\.gpuLoadPercent != null\)/);
});

test('the strip keeps reading the computer when idle, but only while the window is visible', () => {
  const app = read('../src/App.tsx');
  const at = app.indexOf('The load strip is always on screen');
  assert.ok(at > 0, 'the idle refresh is gone, so the strip freezes between runs');
  const block = app.slice(at, at + 900);
  assert.match(block, /document\.visibilityState !== 'visible'/);
  assert.match(block, /}, 5000\);/);
});

test('the old shell is gone, and what it carried has a new home', () => {
  for (const file of ['TopDeck', 'SideMenu', 'Ticker']) {
    assert.ok(!existsSync(new URL(`../src/components/${file}.tsx`, import.meta.url)), `${file}.tsx is back`);
  }
  const app = read('../src/App.tsx');
  // The ticker's jobs: activity as a toast, downloads as a floating dock, a
  // render or run on the strip with its Stop, Chat in the top bar.
  assert.match(app, /<ActivityToast message=\{activity\} \/>/);
  assert.match(app, /<div className="download-dock-float">/);
  assert.match(app, /className="running-stop" onClick=\{renderActivity\.stop\}/);
  assert.match(app, /onOpenChat=\{\(\) => \{ void openChatApp\(\); \}\}/);
  // The stats deck's Top Match card, with use, test again, clear and restore, is on Results.
  assert.match(app, /<TopMatchCard/);
});

test('changing screens is not announced as activity', () => {
  // With activity shown as a toast, "Models selected." covered the screen just opened.
  const app = read('../src/App.tsx');
  const select = app.slice(app.indexOf('const selectNav = useCallback'), app.indexOf('}, [loadLogs]);'));
  assert.doesNotMatch(select, /setActivity/);
});

test('Simple Mode keeps its own step tracker, drawn in the shared bar', () => {
  const wizard = read('../src/components/SimpleWizard.tsx');
  assert.match(wizard, /props\.trackerSlot \? createPortal\(tracker, props\.trackerSlot\)/);
  assert.match(read('../src/App.tsx'), /trackerSlot=\{trackerSlot\}/);
});
