const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'companions');
const platform = process.platform;

const candidates = platform === 'win32'
  ? [
      path.join(root, 'rigmatch-chat', 'src-tauri', 'target', 'release', 'rigmatch-chat.exe'),
      path.join(root, 'rigmatch-chat', 'src-tauri', 'target', 'debug', 'rigmatch-chat.exe'),
    ]
  : [
      path.join(root, 'rigmatch-chat', 'src-tauri', 'target', 'release', 'rigmatch-chat'),
      path.join(root, 'rigmatch-chat', 'src-tauri', 'target', 'debug', 'rigmatch-chat'),
    ];

const source = candidates.find((candidate) => fs.existsSync(candidate));

if (!source) {
  console.warn('[prepare-companions] RigMatch Chat binary not found.');
  console.warn('[prepare-companions] Build it first with: npm --prefix rigmatch-chat run tauri:build');
  process.exitCode = 1;
  return;
}

fs.mkdirSync(outDir, { recursive: true });

const targetName = platform === 'win32' ? 'rigmatch-chat.exe' : 'rigmatch-chat';
const target = path.join(outDir, targetName);
fs.copyFileSync(source, target);

if (platform !== 'win32') {
  fs.chmodSync(target, 0o755);
}

console.log(`[prepare-companions] Copied ${path.relative(root, source)} -> ${path.relative(root, target)}`);
