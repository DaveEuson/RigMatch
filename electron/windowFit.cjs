// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.

/**
 * The main window's size, fitted to the screen it opens on.
 *
 * A fixed minimum is a promise the window can always fit, and no fixed number
 * keeps it on every screen. 1024x640 fits a 1280x720 panel, but the AppImage
 * catalog tests on an 800x600 screen: the window could not shrink below 1024
 * pixels, ran off the right edge, and the catalog's screenshot of RigMatch was
 * a first-run dialog cut in half. The layout itself holds down to 320 pixels
 * (it is checked at 400% zoom), so only the window was ever the problem.
 *
 * Minimums apply to the content, and the window manager adds its frame on top:
 * measured on a Jetson, a 1280x820 minimum became a 1308x886 window. The
 * allowance below keeps room for that frame, so the smallest legal window
 * still fits inside the work area.
 */
const FRAME_ALLOWANCE = { width: 32, height: 72 };

const WANT = { width: 1800, height: 1020, minWidth: 1024, minHeight: 640 };

/**
 * @param {{ width: number, height: number }} area the display's work area, in DIPs
 * @param {typeof WANT} [want]
 */
function fitWindowToScreen(area, want = WANT) {
  const minWidth = Math.max(1, Math.min(want.minWidth, area.width - FRAME_ALLOWANCE.width));
  const minHeight = Math.max(1, Math.min(want.minHeight, area.height - FRAME_ALLOWANCE.height));
  return {
    width: Math.max(minWidth, Math.min(want.width, area.width)),
    height: Math.max(minHeight, Math.min(want.height, area.height)),
    minWidth,
    minHeight,
  };
}

module.exports = { fitWindowToScreen, FRAME_ALLOWANCE, WANT };
