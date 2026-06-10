// Runs after electron-builder packs the main app, before creating the DMG.
// On Mac: copies RigMatch Chat.app into the DMG staging area so users can
// drag both apps to Applications from a single disk image.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const chatApp = path.join(
    __dirname, '..', 'rigmatch-chat', 'src-tauri',
    'target', 'release', 'bundle', 'macos', 'RigMatch Chat.app'
  );

  if (!fs.existsSync(chatApp)) {
    console.warn('[afterPack] RigMatch Chat.app not found — skipping DMG bundling');
    return;
  }

  const dest = path.join(context.appOutDir, 'RigMatch Chat.app');
  execSync(`cp -r "${chatApp}" "${dest}"`);
  console.log('[afterPack] Bundled RigMatch Chat.app into DMG staging area');
};
