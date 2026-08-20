// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Find where ComfyUI lives, without asking.
 *
 * ComfyUI's API is happy to report its version, its Python, its torch build
 * and the machine's RAM — but never its own location, so RigMatch used to have
 * no choice but to make the user go and find the folder. That is a genuinely
 * bad ask: most people do not know where a portable install unpacked itself,
 * and the download is blocked until they do.
 *
 * But ComfyUI is a running process, and a process has a path. Whatever is
 * listening on the ComfyUI port can be traced back to its executable and
 * command line, and the model folders derived from there:
 *
 *   C:\AI\ComfyUI\ComfyUI_windows_portable\python_embeded\python.exe
 *     -s ComfyUI\main.py --windows-standalone-build
 *   → C:\AI\ComfyUI\ComfyUI_windows_portable\ComfyUI\models\checkpoints
 *
 * What comes back is a CANDIDATE, never a decision. It is handed to
 * verifyComfyFolder to be checked against what the running server actually
 * lists, exactly as a hand-picked folder is — a guess that writes gigabytes
 * into the wrong install is worse than no guess at all.
 */

const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

const run = (file, args) => new Promise((resolve) => {
  execFile(file, args, { timeout: 8000, windowsHide: true }, (error, stdout) => {
    resolve(error ? '' : String(stdout || ''));
  });
});

/** A directory is a ComfyUI root if it holds the folders models live in. */
function looksLikeComfyRoot(dir) {
  try {
    return fs.statSync(path.join(dir, 'models', 'checkpoints')).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk up from a starting directory, trying each ancestor and its ComfyUI
 * subfolder. The portable build puts python in a sibling of the ComfyUI
 * directory, so the answer is usually one level up and one across.
 */
function candidatesFrom(startDir, commandLine = '') {
  const found = [];
  const push = (dir) => {
    if (dir && !found.includes(dir) && looksLikeComfyRoot(dir)) found.push(dir);
  };

  // The command line names the script — "ComfyUI\main.py" — relative to the
  // directory the process was launched from, which is the portable root.
  const scriptMatch = commandLine.match(/([\w.\-\\/]*)main\.py/i);
  const scriptDir = scriptMatch ? path.dirname(scriptMatch[1]) : '';

  let dir = startDir;
  for (let depth = 0; depth < 5 && dir; depth += 1) {
    push(dir);
    push(path.join(dir, 'ComfyUI'));
    if (scriptDir && scriptDir !== '.') push(path.resolve(dir, scriptDir));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

/** The process listening on a port, as {exe, commandLine} — empty when none. */
async function processOnPort(port) {
  if (process.platform === 'win32') {
    const script = `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1;`
      + ' if ($c) { $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)";'
      + ' Write-Output $p.ExecutablePath; Write-Output $p.CommandLine }';
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    const [exe = '', ...rest] = out.split(/\r?\n/).filter(Boolean);
    return { exe: exe.trim(), commandLine: rest.join(' ').trim() };
  }

  // macOS and Linux: lsof names the listener, then the executable path.
  const pid = (await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])).split(/\s+/)[0];
  if (!pid) return { exe: '', commandLine: '' };
  if (process.platform === 'linux') {
    try {
      return {
        exe: fs.readlinkSync(`/proc/${pid}/exe`),
        commandLine: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ').trim(),
      };
    } catch {
      return { exe: '', commandLine: '' };
    }
  }
  const out = await run('ps', ['-p', pid, '-o', 'comm=,args=']);
  const [exe = ''] = out.trim().split(/\s+/);
  return { exe: exe.trim(), commandLine: out.trim() };
}

/**
 * Where ComfyUI probably is, from whatever is serving its port.
 *
 * Returns every plausible root rather than one, so the caller can verify each
 * against the running server and take the first that genuinely matches.
 */
async function locateComfyRoots(baseUrl = 'http://127.0.0.1:8188') {
  let port = 8188;
  try { port = Number(new URL(baseUrl).port) || 8188; } catch { /* keep the default */ }

  const { exe, commandLine } = await processOnPort(port);
  if (!exe) return { roots: [], source: 'none' };

  const roots = candidatesFrom(path.dirname(exe), commandLine);
  return { roots, source: roots.length ? 'process' : 'none', exe, commandLine };
}

module.exports = { locateComfyRoots, looksLikeComfyRoot, candidatesFrom };
