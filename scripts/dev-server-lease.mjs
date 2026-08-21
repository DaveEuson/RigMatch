// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Borrow a dev server: start one if the URL is quiet, and guarantee that
 * anything this module started is dead when stop() runs.
 *
 * This existed as seven copy-pasted spawn/taskkill blocks, and every copy
 * shared the same Windows defect: `taskkill /T` walks the process tree from
 * the shell wrapper the script spawned, but npm re-parents its children, so by
 * teardown time the wrapper is gone, the tree is empty, and npm and Vite are
 * still running. Every crashed or timed-out run leaked a server. The leaks did
 * more than hold port 5173 — a leaked Vite watcher keeps handles under
 * rigmatch-chat/dist, which left that directory delete-pending and failed an
 * unrelated Tauri build with an EPERM that looked nothing like its cause.
 *
 * So teardown here kills by *port*, not by parentage — and only ever when this
 * module started the server. One that was already answering belongs to whoever
 * started it, and stop() will not touch it.
 */
import { spawn, spawnSync } from 'node:child_process';

/**
 * How long a first paint may take on a freshly leased dev server.
 *
 * Playwright defaults navigation to 30 seconds, which is not a cold-start
 * budget for this app: a just-spawned Vite transforms the whole module graph
 * in memory on the first request, measured at 96 seconds on a busy machine.
 * The server answers HTTP in under a second, so the lease resolves and the
 * navigation then times out — a failure that reads as a broken page and is
 * really a stopwatch. Scripts here check layout and copy, not startup speed,
 * so every goto should carry this instead of the default.
 */
export const COLD_START_MS = 180_000;

async function isReachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await isReachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function killPortListeners(port) {
  if (process.platform !== 'win32') return;
  const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
  const pids = new Set();
  for (const line of out.split('\n')) {
    if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
    const pid = line.trim().split(/\s+/).pop();
    if (pid && pid !== '0') pids.add(pid);
  }
  for (const pid of pids) {
    spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'ignore' });
  }
}

/**
 * Ensure a dev server answers at `url`, starting one when needed.
 *
 * Returns { started, stop }. Call stop() on every exit path — it is safe to
 * call twice, and it is a no-op when the server was already running. The
 * process-exit hook is installed here too, so a crash between lease and stop
 * still cleans up.
 */
export async function leaseDevServer(url, { timeoutMs = 30000 } = {}) {
  const port = new URL(url).port || '5173';

  if (await isReachable(url)) {
    return { started: false, stop() {} };
  }

  let child = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1'], {
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stop = () => {
    if (!child) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killPortListeners(port);
    } else {
      child.kill();
    }
    child = null;
  };

  process.on('exit', stop);

  try {
    await waitForUrl(url, timeoutMs);
  } catch (error) {
    stop();
    throw error;
  }

  return { started: true, stop };
}
