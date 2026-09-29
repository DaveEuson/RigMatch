// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fitWindowToScreen, FRAME_ALLOWANCE } = require('../electron/windowFit.cjs');

/**
 * The window must fit the screen it opens on. A fixed 1024x640 minimum ran off
 * the AppImage catalog's 800x600 test screen, and its screenshot of RigMatch
 * was a first-run dialog cut in half.
 */

const fits = (fit, area) => fit.minWidth + FRAME_ALLOWANCE.width <= area.width
  && fit.minHeight + FRAME_ALLOWANCE.height <= area.height
  && fit.width <= area.width && fit.height <= area.height;

test('an 800x600 screen gets a window that fits inside it', () => {
  const area = { width: 800, height: 600 };
  const fit = fitWindowToScreen(area);
  assert.ok(fits(fit, area), JSON.stringify(fit));
  assert.deepEqual(fit, { width: 800, height: 600, minWidth: 768, minHeight: 528 });
});

test('screens that could hold the old floor keep it', () => {
  // 1280x720 with a taskbar, 1366x768, 1080p: nothing changes for them.
  for (const area of [{ width: 1280, height: 712 }, { width: 1366, height: 728 }, { width: 1920, height: 1032 }]) {
    const fit = fitWindowToScreen(area);
    assert.equal(fit.minWidth, 1024, `${area.width}x${area.height}`);
    assert.equal(fit.minHeight, 640, `${area.width}x${area.height}`);
    assert.ok(fits(fit, area));
  }
});

test('a large screen opens at the full default size', () => {
  assert.deepEqual(fitWindowToScreen({ width: 2560, height: 1400 }), { width: 1800, height: 1020, minWidth: 1024, minHeight: 640 });
});

test('the window is never smaller than its own minimum', () => {
  for (const area of [{ width: 640, height: 480 }, { width: 1024, height: 700 }, { width: 3840, height: 2100 }]) {
    const fit = fitWindowToScreen(area);
    assert.ok(fit.width >= fit.minWidth && fit.height >= fit.minHeight, JSON.stringify({ area, fit }));
  }
});
