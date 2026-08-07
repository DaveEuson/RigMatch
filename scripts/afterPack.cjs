// Runs after electron-builder packs the main app, before creating the DMG.
// On Mac: copies RigMatch Chat.app into the DMG staging area so users can
// drag both apps to Applications from a single disk image, then ad-hoc signs
// both bundles.
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

  const chatApp = path.join(
    __dirname, '..', 'rigmatch-chat', 'src-tauri',
    'target', 'release', 'bundle', 'macos', 'RigMatch Chat.app'
  );

  if (!fs.existsSync(chatApp)) {
    console.warn('[afterPack] RigMatch Chat.app not found — skipping DMG bundling');
  } else {
    const dest = path.join(context.appOutDir, 'RigMatch Chat.app');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(chatApp, dest, { recursive: true });
    console.log('[afterPack] Bundled RigMatch Chat.app into DMG staging area');
    adhocSign(dest, 'RigMatch Chat.app');
  }

  // Signed last, and only after every modification above — signing first and
  // then touching the bundle is how a signature silently goes stale.
  const productFilename = context.packager.appInfo.productFilename;
  const mainApp = path.join(context.appOutDir, `${productFilename}.app`);
  if (!fs.existsSync(mainApp)) {
    throw new Error(`[afterPack] expected app bundle not found: ${mainApp}`);
  }
  adhocSign(mainApp, `${productFilename}.app`);
};
