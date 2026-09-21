// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
// Runs after electron-builder packs the main app, before creating the DMG.
// On Mac: ad-hoc signs RigMatch Chat.app where Tauri built it, which is where
// the DMG takes it from, nests a copy inside the main app for the Chat button,
// and ad-hoc signs the main app last.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * Ad-hoc sign a .app bundle.
 *
 * Apple Silicon will not execute an arm64 binary whose signature does not
 * validate — and electron-builder repackages the app (rewrites Info.plist,
 * copies `extraFiles` into Contents/, swaps the icon), which invalidates the
 * signature Electron's prebuilt binary shipped with. Nothing then re-signed it,
 * so the released .app failed validation and macOS reported it as *damaged*.
 *
 * That is a different failure from the familiar "unidentified developer": the
 * damaged case offers no "Open Anyway" button in Privacy & Security, so there
 * was no way for a user to get past it. Ad-hoc signing does not make the app
 * trusted — it still needs the documented right-click → Open on first launch —
 * but it makes it *loadable*, which is the part that was broken.
 *
 * A real Developer ID certificate plus notarization would remove the first-launch
 * prompt entirely; this is the fix that works without one.
 */
function adhocSign(appPath, label) {
  // --deep is deprecated by Apple for distribution signing, but it is the
  // pragmatic way to ad-hoc sign every nested helper and framework in an
  // Electron bundle in one pass. There is no Developer ID here to protect.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  // Verify rather than assume. Shipping a bundle whose signature does not
  // validate is precisely the bug this function exists to prevent, and a silent
  // codesign failure would reproduce it exactly.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log(`[afterPack] ad-hoc signed and verified ${label}`);
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const productFilename = context.packager.appInfo.productFilename;
  const mainApp = path.join(context.appOutDir, `${productFilename}.app`);
  if (!fs.existsSync(mainApp)) {
    throw new Error(`[afterPack] expected app bundle not found: ${mainApp}`);
  }

  const chatApp = path.join(
    __dirname, '..', 'rigmatch-chat', 'src-tauri',
    'target', 'release', 'bundle', 'macos', 'RigMatch Chat.app'
  );

  if (!fs.existsSync(chatApp)) {
    // The DMG reads this path, so without it the DMG build fails later with a
    // copy error that names neither Chat nor the fix.
    throw new Error(`[afterPack] RigMatch Chat.app not found at ${chatApp} — run npm run build:chat first`);
  } else {
    /*
     * The DMG's standalone RigMatch Chat.app is this bundle, read straight from
     * Tauri's output by the third dmg.contents entry in package.json.
     *
     * That entry had no path, and electron-builder fills a missing path with
     * the main app — so every Mac DMG before 0.9.0 carried RigMatch twice, the
     * second copy named "RigMatch Chat": 250 MB where the app zips to 125, and a Mac
     * user who dragged "RigMatch Chat" across got a second RigMatch. The copy
     * this hook staged in appOutDir was never read by the DMG or the update
     * zip. Tauri's output is also the one path that is the same for both Mac
     * architectures, where appOutDir is release/mac or release/mac-arm64.
     *
     * Signed in place, so the copy users drag across loads on Apple silicon.
     */
    adhocSign(chatApp, 'RigMatch Chat.app for the DMG');

    /*
     * The copy RigMatch launches when the user did not drag both apps across.
     *
     * Every other platform can carry a bare executable here: a Windows .exe
     * holds its icon in its own resources, and Linux takes the icon from the
     * .desktop file. macOS keeps both the icon and the name in the .app
     * wrapper, so a bundle-less Mach-O has neither — it arrives in the Dock as
     * a generic executable, which is exactly what shipped, because dragging
     * only RigMatch out of the DMG is the ordinary thing to do.
     *
     * So the fallback is the whole bundle rather than the binary inside it.
     * Same size to within a rounding error: the .app is that binary plus an
     * icon and a plist.
     */
    const nested = path.join(mainApp, 'Contents', 'companions', 'RigMatch Chat.app');
    fs.rmSync(nested, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.cpSync(chatApp, nested, { recursive: true });

    // The bare binary extraFiles used to place here. Left alongside, it is dead
    // weight the launcher would never choose again.
    fs.rmSync(path.join(mainApp, 'Contents', 'companions', 'rigmatch-chat'), { force: true });
    console.log('[afterPack] Nested RigMatch Chat.app inside the app bundle');
    adhocSign(nested, 'nested RigMatch Chat.app');
  }

  // Signed last, and only after every modification above — signing first and
  // then touching the bundle is how a signature silently goes stale.
  adhocSign(mainApp, `${productFilename}.app`);
};
