const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const os = require('node:os');
const dns = require('node:dns').promises;
const net = require('node:net');
const fs = require('node:fs/promises');
const http = require('node:http');
const { execFile, spawn } = require('node:child_process');
const fsSync = require('node:fs');
const { promisify } = require('node:util');
const si = require('systeminformation');
const { buildBenchmarkPromptPlan, normalizeBenchmarkQuestionCount } = require('./benchmarkSuite.cjs');

const OLLAMA_LOCAL_URL = 'http://127.0.0.1:11434';
const OLLAMA_LIBRARY_URL = 'https://ollama.com/library';
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
const RIGMATCH_REPOSITORY_URL = app.isPackaged
  ? 'https://github.com/daveeuson/RigMatch.AI'
  : (process.env.RIGMATCH_REPOSITORY_URL || 'https://github.com/daveeuson/RigMatch.AI');
const RIGMATCH_RELEASES_URL = app.isPackaged
  ? `${RIGMATCH_REPOSITORY_URL}/releases`
  : (process.env.RIGMATCH_RELEASES_URL || `${RIGMATCH_REPOSITORY_URL}/releases`);
const RIGMATCH_RELEASES_API_URL = app.isPackaged
  ? 'https://api.github.com/repos/daveeuson/RigMatch.AI/releases'
  : (process.env.RIGMATCH_RELEASES_API_URL || 'https://api.github.com/repos/daveeuson/RigMatch.AI/releases');
const CUDA_TOOLKIT_URL = 'https://developer.nvidia.com/cuda-toolkit';
const CUDA_TOOLKIT_ARCHIVE_URL = 'https://developer.nvidia.com/cuda-toolkit-archive';
const CUDA_REDIST_INDEX_URL = 'https://developer.download.nvidia.com/compute/cuda/redist/';
const execFileAsync = promisify(execFile);

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'ollama.com',
  'www.ollama.com',
  'github.com',
  'www.github.com',
  'api.github.com',
  'buymeacoffee.com',
  'www.buymeacoffee.com',
  'developer.nvidia.com',
  'www.developer.nvidia.com',
]);

function openExternalSafe(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  if (parsed.protocol !== 'https:') return;
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_EXTERNAL_HOSTS.has(host)) return;
  shell.openExternal(url);
}
let latestCudaCache = null;
let latestCudaCacheAt = 0;
const APP_USER_AGENT = 'RigMatchAI/0.1';
const SCORES_SERVER_PORT = 11435;
const BENCHMARK_REPEATS = 1;
const COMPUTER_PROBE_PORTS = [11434, 22, 445, 3389, 80, 443];
const LOG_LIMIT = 250;
const OLLAMA_CATALOG_CACHE_MS = 1000 * 60 * 10;
const OLLAMA_LIBRARY_FAMILY_LIMIT = 96;
const OLLAMA_LIBRARY_DETAIL_LIMIT = 56;
const OLLAMA_LIBRARY_MODEL_LIMIT = 260;
const OLLAMA_FAMILY_TAG_LIMIT = 18;
const OLLAMA_DETAIL_CONCURRENCY = 8;
const CPU_LOAD_SAMPLE_MS = 750;
let ollamaCatalogCache = null;
let ollamaCatalogCacheAt = 0;

const curatedCatalog = [
  { name: 'llama3.2', tag: '1b', sizeGb: 1.3, params: '1B', pack: 'Lightweight' },
  { name: 'llama3.2', tag: '3b', sizeGb: 2.0, params: '3B', pack: 'Balanced' },
  { name: 'qwen2.5', tag: '1.5b', sizeGb: 1.0, params: '1.5B', pack: 'Lightweight' },
  { name: 'qwen2.5', tag: '3b', sizeGb: 2.2, params: '3B', pack: 'Balanced' },
  { name: 'qwen2.5', tag: '7b', sizeGb: 4.7, params: '7B', pack: 'Quality' },
  { name: 'mistral', tag: '7b', sizeGb: 4.1, params: '7B', pack: 'Quality' },
  { name: 'gemma3', tag: '1b', sizeGb: 0.8, params: '1B', pack: 'Lightweight' },
  { name: 'gemma3', tag: '4b', sizeGb: 3.3, params: '4B', pack: 'Balanced' },
  { name: 'phi3', tag: 'mini', sizeGb: 2.3, params: '3.8B', pack: 'Balanced' },
  { name: 'deepseek-r1', tag: '7b', sizeGb: 4.7, params: '7B', pack: 'Reasoning' },
];

function isDev() {
  return !app.isPackaged && process.env.RIGMATCH_FORCE_BUILT_RENDERER !== '1';
}

if (process.platform === 'linux' && isDev() && process.env.RIGMATCH_ENABLE_GPU !== '1') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.disableHardwareAcceleration();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: '#080b0d',
    title: 'RigMatch.AI',
    icon: getWindowIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  if (isDev()) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  setupAutoUpdater(win);
}

function setupAutoUpdater(win) {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  const send = (payload) => {
    if (!win.isDestroyed()) win.webContents.send('updater:status', payload);
  };
  autoUpdater.on('checking-for-update', () => send({ phase: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ phase: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => send({ phase: 'not-available' }));
  autoUpdater.on('download-progress', (p) => send({ phase: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send({ phase: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => send({ phase: 'error', error: err.message }));
}

function getWindowIconPath() {
  return isDev()
    ? path.join(__dirname, '..', 'public', 'rigmatch-brand-icon.png')
    : path.join(__dirname, '..', 'dist', 'rigmatch-brand-icon.png');
}

// ── Scores bridge server ──────────────────────────────────────────────────────
// Serves scores + chosen model as JSON on localhost:11435 so RigMatch Chat
// can read them without requiring a shared filesystem or IPC protocol.

// Only the Tauri WebView origins may read the bridge — blocks any browser tab
// from fetching this endpoint via a wildcard CORS grant.
const BRIDGE_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:1420',  // Tauri dev server
  'tauri://localhost',        // Tauri production WebView
]);

const SCORES_MAX_ENTRIES = 500;   // N-07: reject oversized payloads from renderer
let benchmarkRunning = false;     // N-06: single-benchmark mutex
let lastLogClearAt = 0;           // N-03: rate-limit log clearing
let activePullController = null;  // abortable by ollama:abortPull IPC
let catalogFetchPromise = null;   // dedup concurrent catalog fetches
let ollamaInstallController = null;

let latestScores = {};
let latestChosen = null;

const scoresServer = http.createServer((req, res) => {
  // Only GET is valid — reject other methods before touching CORS
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return;
  }

  const origin = req.headers.origin;
  if (origin) {
    if (!BRIDGE_ALLOWED_ORIGINS.has(origin)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ scores: latestScores, chosen: latestChosen }));
});

scoresServer.listen(SCORES_SERVER_PORT, '127.0.0.1', () => {
  console.log(`RigMatch scores bridge listening on port ${SCORES_SERVER_PORT}`);
});

scoresServer.on('error', () => {
  // Port in use — scores bridging unavailable, non-fatal
});

app.whenReady().then(() => {
  registerHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerHandlers() {
  handleLogged('system:getProfile', 'system', () => getSystemProfile());
  handleLogged('ollama:getStatus', 'ollama', (_event, baseUrl) => getOllamaStatus(baseUrl || OLLAMA_LOCAL_URL));
  handleLogged('ollama:getCatalog', 'catalog', (_event, options) => getOllamaCatalog(options));
  handleLogged('ollama:openDownload', 'ollama', () => openOllamaDownload());
  handleLogged('ollama:pullModel', 'ollama', (event, request) => pullModel(request, event.sender));
  ipcMain.handle('ollama:abortPull', () => { activePullController?.abort(); });
  handleLogged('ollama:deleteModel', 'ollama', (_event, request) => deleteModel(request));
  handleLogged('network:scanLan', 'network', () => scanLanForOllama());
  handleLogged('network:addHostByAddress', 'network', (_event, address) => addHostByAddress(address));
  handleLogged('benchmark:run', 'benchmark', (event, request) => runBenchmark(request, event.sender));
  handleLogged('chat:send', 'chat', (_event, request) => sendChat(request));
  handleLogged('logs:list', 'logs', (_event, limit) => readAppLogs(limit));
  handleLogged('logs:append', 'logs', (_event, entry) => appendAppLog(entry));
  handleLogged('logs:clear', 'logs', () => clearAppLogs());
  handleLogged('logs:openFolder', 'logs', () => openAppLogsFolder());
  handleLogged('app:checkForUpdates', 'updates', (_event, channel) => checkForRigmatchUpdates(channel));
  handleLogged('app:openUpdatePage', 'updates', (_event, channel) => openRigmatchUpdatePage(channel));
  ipcMain.handle('app:checkAutoUpdate', async () => {
    if (!app.isPackaged) return { phase: 'not-available' };
    try { await autoUpdater.checkForUpdates(); } catch (err) { return { phase: 'error', error: err.message }; }
  });
  ipcMain.handle('app:downloadUpdate', async () => {
    try { await autoUpdater.downloadUpdate(); } catch (err) { return { phase: 'error', error: err.message }; }
  });
  ipcMain.handle('app:installUpdate', () => { autoUpdater.quitAndInstall(); });
  ipcMain.handle('ollama:startInstall', (event) => startOllamaInstall(event.sender));
  ipcMain.handle('ollama:launchInstaller', (_event, installerPath) => {
    if (typeof installerPath !== 'string' || !installerPath) return;
    return shell.openPath(installerPath);
  });
  ipcMain.handle('scores:sync', (_event, data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;

    const rawScores = 'scores' in data ? (data.scores ?? {}) : data;
    const chosen = 'scores' in data ? (data.chosen ?? null) : null;

    if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores)) return;

    const keys = Object.keys(rawScores);
    if (keys.length > SCORES_MAX_ENTRIES) return;

    const validated = {};
    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 200) continue;
      const val = rawScores[key];
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      const serialized = JSON.stringify(val);
      if (!serialized || serialized.length > 4096) continue;
      validated[key] = val;
    }

    latestScores = validated;
    latestChosen = typeof chosen === 'string' && chosen.length <= 200 ? chosen : null;
  });
  ipcMain.handle('app:openChatApp', async () => {
    const platform = process.platform;
    const isWin = platform === 'win32';
    const isMac = platform === 'darwin';
    const execDir = path.dirname(process.execPath);

    // Check if already running (skip second launch — shared data dir causes blank window)
    try {
      if (isWin) {
        const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq rigmatch-chat.exe', '/NH'], { timeout: 2000 });
        if (stdout.toLowerCase().includes('rigmatch-chat.exe')) return { ok: true, reason: 'already running' };
      } else {
        const { stdout } = await execFileAsync('pgrep', ['-x', 'rigmatch-chat'], { timeout: 2000 });
        if (stdout.trim()) return { ok: true, reason: 'already running' };
      }
    } catch { /* process check unavailable — proceed */ }

    const candidates = isWin ? [
      // Packaged: extraFiles land next to the .exe in the install dir
      path.join(execDir, 'companions', 'rigmatch-chat.exe'),
      // Dev
      path.join(__dirname, '..', 'rigmatch-chat', 'src-tauri', 'target', 'release', 'rigmatch-chat.exe'),
      path.join(__dirname, '..', 'rigmatch-chat', 'src-tauri', 'target', 'debug', 'rigmatch-chat.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'RigMatch Chat', 'RigMatch Chat.exe'),
    ] : isMac ? [
      // Installed standalone: user dragged Chat.app from DMG to Applications
      '/Applications/RigMatch Chat.app/Contents/MacOS/rigmatch-chat',
      path.join(os.homedir(), 'Applications', 'RigMatch Chat.app', 'Contents', 'MacOS', 'rigmatch-chat'),
      // Packaged fallback: extraFiles land at Contents/companions/ inside the .app bundle
      path.join(execDir, '..', 'companions', 'rigmatch-chat'),
      // Dev
      path.join(__dirname, '..', 'rigmatch-chat', 'src-tauri', 'target', 'release', 'rigmatch-chat'),
      path.join(__dirname, '..', 'rigmatch-chat', 'src-tauri', 'target', 'debug', 'rigmatch-chat'),
    ] : [
      // Linux: installed AppImage or standalone binary
      path.join(os.homedir(), '.local', 'bin', 'rigmatch-chat'),
      path.join(os.homedir(), 'Applications', 'rigmatch-chat.AppImage'),
      // Packaged fallback: extraFiles land next to the binary
      path.join(execDir, 'companions', 'rigmatch-chat'),
      // Dev
      path.join(__dirname, '..', 'rigmatch-chat', 'src-tauri', 'target', 'release', 'rigmatch-chat'),
    ];

    // Strip env vars that can poison child processes launched from Electron
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) =>
        !k.startsWith('ELECTRON_') &&
        !k.startsWith('WEBVIEW2_') &&
        !k.startsWith('CHROME_') &&
        k !== 'NODE_OPTIONS' &&
        k !== 'NODE_PATH'
      )
    );

    for (const candidate of candidates) {
      if (!fsSync.existsSync(candidate)) continue;
      try {
        const stat = fsSync.statSync(candidate);
        // Reject if world-writable (mode & 0o002) — prevents binary replacement attacks
        if (stat.mode & 0o002) continue;
      } catch {
        continue;
      }
      const child = spawn(candidate, [], {
        cwd: path.dirname(candidate),
        env: cleanEnv,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      return { ok: true };
    }
    return { ok: false, reason: 'not-found' };
  });
}

function handleLogged(channel, source, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    // U-02: reject IPC from any frame that isn't one of our BrowserWindows
    if (!BrowserWindow.fromWebContents(event.sender)) {
      throw new Error('Unauthorized IPC sender');
    }
    try {
      return await handler(event, ...args);
    } catch (error) {
      await appendAppLog({
        level: 'error',
        source,
        message: `${channel} failed: ${getLogErrorMessage(error)}`,
        details: {
          channel,
          args: sanitizeLogValue(args),
          error: serializeError(error),
        },
      });
      throw error;
    }
  });
}

function getLogFilePath() {
  return path.join(app.getPath('userData'), 'rigmatch-log.jsonl');
}

const LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — rotate when exceeded

async function rotateLogIfNeeded(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size < LOG_MAX_BYTES) return;
    const rotated = `${filePath}.1`;
    try { await fs.unlink(rotated); } catch { /* no previous backup */ }
    await fs.rename(filePath, rotated);
  } catch { /* file doesn't exist yet, nothing to rotate */ }
}

async function appendAppLog(entry = {}) {
  const logEntry = normalizeLogEntry(entry);
  const filePath = getLogFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await rotateLogIfNeeded(filePath);
  await fs.appendFile(filePath, `${JSON.stringify(logEntry)}\n`, 'utf8');
  return logEntry;
}

async function readAppLogs(limit = LOG_LIMIT) {
  const filePath = getLogFilePath();
  const normalizedLimit = Math.max(1, Math.min(1000, Number(limit) || LOG_LIMIT));

  try {
    const text = await fs.readFile(filePath, 'utf8');
    const entries = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-normalizedLimit)
      .reverse();

    return { entries, logPath: filePath };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { entries: [], logPath: filePath };
    }

    throw error;
  }
}

async function clearAppLogs() {
  const now = Date.now();
  const LOG_CLEAR_MIN_INTERVAL_MS = 60_000;
  if (now - lastLogClearAt < LOG_CLEAR_MIN_INTERVAL_MS) {
    throw new Error('Log clear is rate-limited. Please wait before clearing again.');
  }
  lastLogClearAt = now;
  const filePath = getLogFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '', 'utf8');
  return { entries: [], logPath: filePath };
}

async function openAppLogsFolder() {
  const filePath = getLogFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, '', 'utf8');
  shell.showItemInFolder(filePath);
  return { logPath: filePath };
}

function normalizeLogEntry(entry) {
  const level = ['info', 'warn', 'error'].includes(entry.level) ? entry.level : 'info';
  return {
    id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    level,
    source: String(entry.source || 'app').slice(0, 80),
    message: String(entry.message || '').slice(0, 1200),
    details: sanitizeLogValue(entry.details || null),
  };
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: getLogErrorMessage(error),
    stack: typeof error?.stack === 'string' ? error.stack.slice(0, 4000) : null,
  };
}

function getLogErrorMessage(error) {
  return error?.message || String(error || 'Unknown error');
}

function sanitizeLogValue(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value == null) return value;
  if (typeof value === 'string') return redactSecrets(value).slice(0, 4000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeLogValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 80).map(([key, item]) => [
        key,
        /pass(word)?|token|secret|key|credential/i.test(key)
          ? '[redacted]'
          : sanitizeLogValue(item, depth + 1),
      ]),
    );
  }

  return String(value);
}

function redactSecrets(value) {
  return String(value)
    .replace(/(pass(word)?|token|secret|key|credential)(\s*[:=]\s*)[^\s,;]+/gi, '$1$3[redacted]')
    .replace(/:\/\/([^:/\s]+):([^@/\s]+)@/g, '://$1:[redacted]@');
}

async function openOllamaDownload() {
  openExternalSafe(OLLAMA_DOWNLOAD_URL);
}

const OLLAMA_INSTALLER_URLS = {
  win32: 'https://ollama.com/download/OllamaSetup.exe',
  darwin: 'https://ollama.com/download/Ollama-darwin.zip',
};
const OLLAMA_INSTALLER_MAX_BYTES = 300 * 1024 * 1024; // 300 MB cap

async function startOllamaInstall(sender) {
  const send = (payload) => {
    if (!sender.isDestroyed()) sender.send('ollama:installProgress', payload);
  };

  const platform = process.platform;

  if (platform === 'linux') {
    send({ phase: 'script', command: 'curl -fsSL https://ollama.com/install.sh | sh' });
    return;
  }

  const url = OLLAMA_INSTALLER_URLS[platform];
  if (!url) {
    send({ phase: 'error', error: `No installer available for platform: ${platform}` });
    return;
  }

  const filename = platform === 'win32' ? 'OllamaSetup.exe' : 'Ollama-darwin.zip';
  const dest = path.join(app.getPath('temp'), filename);

  ollamaInstallController = new AbortController();
  try {
    send({ phase: 'downloading', percent: 0, receivedBytes: 0, totalBytes: 0 });
    const response = await fetch(url, {
      signal: ollamaInstallController.signal,
      headers: { 'User-Agent': APP_USER_AGENT },
    });
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    const total = parseInt(response.headers.get('content-length') || '0', 10);
    let received = 0;
    const fileStream = fsSync.createWriteStream(dest);
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.length > OLLAMA_INSTALLER_MAX_BYTES) throw new Error('Installer download too large');
      fileStream.write(Buffer.from(value));
      received += value.length;
      send({ phase: 'downloading', percent: total ? Math.round((received / total) * 100) : 0, receivedBytes: received, totalBytes: total });
    }
    await new Promise((resolve, reject) => fileStream.end((err) => (err ? reject(err) : resolve())));
    send({ phase: 'ready', installerPath: dest });
  } catch (err) {
    if (err.name !== 'AbortError') send({ phase: 'error', error: err.message || 'Download failed' });
  } finally {
    ollamaInstallController = null;
  }
}

async function checkForRigmatchUpdates(channel = 'release') {
  const normalizedChannel = normalizeUpdateChannel(channel);
  const currentVersion = getAppVersion();
  const checkedAt = new Date().toISOString();

  try {
    const releases = await fetchRemoteJson(RIGMATCH_RELEASES_API_URL, {}, 7000);
    const latest = pickLatestRigmatchRelease(Array.isArray(releases) ? releases : [], normalizedChannel);

    if (!latest) {
      return {
        channel: normalizedChannel,
        currentVersion,
        checkedAt,
        latestVersion: null,
        latestName: null,
        latestDate: null,
        releaseUrl: RIGMATCH_RELEASES_URL,
        downloadUrl: RIGMATCH_RELEASES_URL,
        releaseNotes: null,
        hasUpdate: false,
        status: 'unknown',
        error: normalizedChannel === 'nightly'
          ? 'No nightly or prerelease builds were found yet.'
          : 'No published releases were found yet.',
      };
    }

    const latestVersion = normalizeReleaseVersion(latest.tag_name || latest.name);
    const hasUpdate = hasNewerRigmatchRelease({
      currentVersion,
      latestVersion,
      currentTag: `v${currentVersion}`,
      latestTag: latest.tag_name,
      channel: normalizedChannel,
      isPrerelease: Boolean(latest.prerelease),
    });
    const releaseUrl = latest.html_url || RIGMATCH_RELEASES_URL;
    const downloadUrl = pickRigmatchDownloadUrl(latest) || releaseUrl;

    return {
      channel: normalizedChannel,
      currentVersion,
      checkedAt,
      latestVersion,
      latestName: latest.name || latest.tag_name || 'RigMatch.AI release',
      latestDate: latest.published_at || latest.created_at || null,
      releaseUrl,
      downloadUrl,
      releaseNotes: summarizeReleaseNotes(latest.body),
      hasUpdate,
      status: hasUpdate ? 'available' : 'current',
      error: null,
    };
  } catch (error) {
    return {
      channel: normalizedChannel,
      currentVersion,
      checkedAt,
      latestVersion: null,
      latestName: null,
      latestDate: null,
      releaseUrl: RIGMATCH_RELEASES_URL,
      downloadUrl: RIGMATCH_RELEASES_URL,
      releaseNotes: null,
      hasUpdate: false,
      status: 'unknown',
      error: error.message || 'Could not check RigMatch.AI releases.',
    };
  }
}

async function openRigmatchUpdatePage(channel = 'release') {
  const normalizedChannel = normalizeUpdateChannel(channel);
  const url = normalizedChannel === 'nightly'
    ? `${RIGMATCH_RELEASES_URL}?channel=nightly`
    : RIGMATCH_RELEASES_URL;
  openExternalSafe(url);
  return { url };
}

async function fetchJson(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const detail = extractResponseDetail(await response.text());
      throw new Error(`${response.status} ${response.statusText} from ${getUrlLabel(url)}${detail ? `: ${detail}` : ''}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Timed out reaching Ollama at ${getUrlOrigin(url)} after ${timeoutMs} ms.`);
    }

    if (error?.message === 'fetch failed' || error?.name === 'TypeError') {
      throw new Error(`Cannot reach local Ollama at ${getUrlOrigin(url)}. Make sure the Ollama app is installed and running on this computer.`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRemoteJson(url, options = {}, timeoutMs = 5000) {
  const text = await fetchText(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      ...(options.headers || {}),
    },
  }, timeoutMs);

  return text ? JSON.parse(text) : {};
}

function getUrlOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return String(url);
  }
}

function getUrlLabel(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url);
  }
}

function extractResponseDetail(text) {
  if (!text) return '';

  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || '';
  } catch {
    return text.slice(0, 240);
  }
}

async function fetchText(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': APP_USER_AGENT,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function bytesToGb(bytes) {
  if (!Number.isFinite(bytes)) return 0;
  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
}

function mbToGb(mb) {
  if (!Number.isFinite(mb)) return 0;
  return Math.round((mb / 1024) * 10) / 10;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getCpuTimesSnapshot() {
  return os.cpus().map((cpu) => {
    const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
    return {
      idle: cpu.times.idle,
      total,
    };
  });
}

function calculateCpuLoadPercent(startSnapshot, endSnapshot) {
  const sampleCount = Math.min(startSnapshot.length, endSnapshot.length);
  let idleDelta = 0;
  let totalDelta = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    idleDelta += Math.max(0, endSnapshot[index].idle - startSnapshot[index].idle);
    totalDelta += Math.max(0, endSnapshot[index].total - startSnapshot[index].total);
  }

  if (totalDelta <= 0) return null;
  return clampPercent((1 - idleDelta / totalDelta) * 100);
}

async function getCpuLoadPercent() {
  const startSnapshot = getCpuTimesSnapshot();
  await delay(CPU_LOAD_SAMPLE_MS);
  const sampledLoad = calculateCpuLoadPercent(startSnapshot, getCpuTimesSnapshot());

  if (sampledLoad !== null) {
    return sampledLoad;
  }

  try {
    const load = await si.currentLoad();
    return clampPercent(load.currentLoad) ?? 0;
  } catch {
    return 0;
  }
}

async function getSystemProfile() {
  const [cpu, mem, graphics, osInfo, fsSize, battery] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.graphics(),
    si.osInfo(),
    si.fsSize(),
    si.battery().catch(() => ({ hasBattery: false })),
  ]);

  const gpus = (graphics.controllers || [])
    .filter((gpu) => gpu && gpu.model && !/microsoft basic/i.test(gpu.model))
    .sort((a, b) => (b.vram || 0) - (a.vram || 0));

  const primaryGpu = gpus[0] || {};
  const primaryFs = (fsSize || []).sort((a, b) => (b.size || 0) - (a.size || 0))[0] || {};
  const networks = getPrivateNetworkAddresses();
  const cuda = await getCudaStatus(primaryGpu);
  const cpuLoadPercent = await getCpuLoadPercent();

  const isMac = process.platform === 'darwin';
  const isAppleSilicon = isMac && os.arch() === 'arm64';

  // On Apple Silicon, GPU memory is unified with RAM — no separate VRAM pool.
  // systeminformation returns 0/null for vram on macOS; use total RAM as the pool size.
  const vramGb = primaryGpu.vram
    ? mbToGb(primaryGpu.vram)
    : isAppleSilicon
      ? bytesToGb(mem.total)
      : 0;

  // macOS uses Metal; Windows exposes actual driver version strings.
  const driverVersion = primaryGpu.driverVersion ||
    (isMac ? 'Apple Metal' : 'Unknown');

  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: os.arch(),
    os: {
      distro: osInfo.distro,
      release: osInfo.release,
      codename: osInfo.codename,
    },
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      physicalCores: cpu.physicalCores,
      cores: cpu.cores,
      loadPercent: cpuLoadPercent,
    },
    memory: {
      totalGb: bytesToGb(mem.total),
      availableGb: bytesToGb(mem.available),
      usedGb: bytesToGb(mem.used),
    },
    gpu: {
      vendor: primaryGpu.vendor || (isMac ? 'Apple' : 'Unknown'),
      model: primaryGpu.model || (isAppleSilicon ? 'Apple Silicon GPU' : 'Unknown GPU'),
      vramGb,
      vramUsedGb: primaryGpu.memoryUsed ? mbToGb(primaryGpu.memoryUsed) : null,
      gpuLoadPercent: primaryGpu.utilizationGpu ?? null,
      driverVersion,
      bus: primaryGpu.bus || (isMac ? 'Built-in' : 'Unknown'),
      isUnifiedMemory: isAppleSilicon,
    },
    storage: {
      sizeGb: bytesToGb(primaryFs.size),
      availableGb: bytesToGb(primaryFs.available),
      mount: primaryFs.mount || '',
    },
    battery: {
      hasBattery: Boolean(battery.hasBattery),
      percent: battery.percent || null,
      isCharging: Boolean(battery.isCharging),
      acConnected: battery.acConnected ?? null,
    },
    cuda,
    networks,
  };
}

async function getCudaStatus(primaryGpu = {}) {
  const gpuLabel = `${primaryGpu.vendor || ''} ${primaryGpu.model || ''}`;
  if (!/nvidia/i.test(gpuLabel)) {
    return {
      detected: false,
      status: 'not-nvidia',
      driverVersion: null,
      driverCudaVersion: null,
      toolkitVersion: null,
      latestToolkitVersion: null,
      source: 'GPU scan',
      error: 'No NVIDIA GPU detected.',
    };
  }

  const [smi, nvcc, latest] = await Promise.all([
    getNvidiaSmiInfo(),
    getNvccInfo(),
    getLatestCudaToolkitVersion(),
  ]);
  const latestToolkitVersion = latest.version;
  const detected = Boolean(smi.driverVersion || smi.driverCudaVersion || nvcc.toolkitVersion);
  const status = getCudaStatusValue({
    detected,
    toolkitVersion: nvcc.toolkitVersion,
    driverCudaVersion: smi.driverCudaVersion,
    latestToolkitVersion,
  });
  const errors = [
    smi.error,
    nvcc.error && !nvcc.toolkitVersion ? 'CUDA Toolkit compiler not found in PATH.' : null,
    latest.error,
  ].filter(Boolean);

  return {
    detected,
    status,
    driverVersion: smi.driverVersion || primaryGpu.driverVersion || null,
    driverCudaVersion: smi.driverCudaVersion,
    toolkitVersion: nvcc.toolkitVersion,
    latestToolkitVersion,
    source: latestToolkitVersion ? 'nvidia-smi, nvcc, NVIDIA CUDA Toolkit pages' : 'nvidia-smi, nvcc',
    error: errors.length > 0 ? Array.from(new Set(errors)).join(' ') : null,
  };
}

async function getNvidiaSmiInfo() {
  const result = await runCommand('nvidia-smi', [], 3500);
  if (result.error && !result.output) {
    return {
      driverVersion: null,
      driverCudaVersion: null,
      error: 'nvidia-smi was not found or did not answer.',
    };
  }

  return {
    driverVersion: extractFirstVersion(result.output, /Driver Version:\s*([\d.]+)/i),
    driverCudaVersion: extractFirstVersion(result.output, /CUDA Version:\s*([\d.]+)/i),
    error: result.error || null,
  };
}

async function getNvccInfo() {
  const result = await runCommand('nvcc', ['--version'], 3500);
  if (result.error && !result.output) {
    return {
      toolkitVersion: null,
      error: result.error,
    };
  }

  return {
    toolkitVersion:
      extractFirstVersion(result.output, /release\s+([\d.]+)/i) ||
      extractFirstVersion(result.output, /V([\d.]+)/i),
    error: result.error || null,
  };
}

async function getLatestCudaToolkitVersion() {
  const now = Date.now();
  const cacheTtl = 1000 * 60 * 60 * 12;
  if (latestCudaCache?.version && now - latestCudaCacheAt < cacheTtl) {
    return latestCudaCache;
  }

  try {
    const [redistIndex, toolkitPage, archivePage] = await Promise.all([
      fetchText(CUDA_REDIST_INDEX_URL, {}, 9000).catch(() => ''),
      fetchText(CUDA_TOOLKIT_URL, {}, 9000).catch(() => ''),
      fetchText(CUDA_TOOLKIT_ARCHIVE_URL, {}, 9000).catch(() => ''),
    ]);
    const version = getHighestVersion([
      ...extractCudaRedistVersions(redistIndex),
      ...extractCudaToolkitVersions(toolkitPage),
      ...extractCudaToolkitVersions(archivePage),
    ]);

    latestCudaCache = {
      version,
      error: version ? null : 'Could not parse latest CUDA Toolkit version from NVIDIA pages.',
    };
  } catch (error) {
    latestCudaCache = {
      version: null,
      error: error.message || 'Could not check NVIDIA CUDA Toolkit latest version.',
    };
  }

  latestCudaCacheAt = now;
  return latestCudaCache;
}

async function runCommand(command, args = [], timeoutMs = 2500) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    return {
      output: `${stdout || ''}\n${stderr || ''}`.trim(),
      error: null,
    };
  } catch (error) {
    return {
      output: `${error.stdout || ''}\n${error.stderr || ''}`.trim(),
      error: error.message || `Could not run ${command}`,
    };
  }
}

function getCudaStatusValue({ detected, toolkitVersion, driverCudaVersion, latestToolkitVersion }) {
  if (!detected) return 'unknown';
  if (!latestToolkitVersion) return 'unknown';
  if (toolkitVersion) {
    return compareVersions(toolkitVersion, latestToolkitVersion) >= 0 ? 'current' : 'behind';
  }
  if (driverCudaVersion) {
    return 'toolkit-missing';
  }
  return 'unknown';
}

function extractFirstVersion(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? match[1] : null;
}

function extractCudaToolkitVersions(html) {
  return [
    ...Array.from(String(html || '').matchAll(/CUDA Toolkit\s+(\d+(?:\.\d+){1,2})/gi)),
    ...Array.from(String(html || '').matchAll(/cuda[-_/]?(?:toolkit[-_/]?)?(\d+)[-_.](\d+)(?:[-_.](\d+))?/gi))
      .map((match) => [match[0], [match[1], match[2], match[3]].filter(Boolean).join('.')]),
  ]
    .map((match) => match[1])
    .filter(Boolean);
}

function extractCudaRedistVersions(html) {
  return Array.from(String(html || '').matchAll(/redistrib_(\d+(?:\.\d+){1,2})\.json/gi))
    .map((match) => match[1])
    .filter(Boolean);
}

function getHighestVersion(versions) {
  return Array.from(new Set(versions)).sort(compareVersions).pop() || null;
}

function compareVersions(a, b) {
  const left = String(a || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b || '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta;
  }

  return 0;
}

function getAppVersion() {
  try {
    return app.getVersion();
  } catch {
    return '0.1.0';
  }
}

function normalizeUpdateChannel(channel) {
  return channel === 'nightly' ? 'nightly' : 'release';
}

function pickLatestRigmatchRelease(releases, channel) {
  const published = releases
    .filter((release) => release && !release.draft)
    .sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));

  if (channel === 'nightly') {
    return published.find(isNightlyRelease) || published.find((release) => release.prerelease) || published[0] || null;
  }

  return published.find((release) => !release.prerelease && !isNightlyRelease(release)) || null;
}

function isNightlyRelease(release) {
  return /nightly|alpha|beta|canary|preview/i.test(`${release?.tag_name || ''} ${release?.name || ''}`);
}

function normalizeReleaseVersion(value) {
  const match = String(value || '').match(/v?(\d+(?:\.\d+){1,3})/i);
  return match ? match[1] : null;
}

function hasNewerRigmatchRelease({ currentVersion, latestVersion, currentTag, latestTag, channel, isPrerelease }) {
  if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) return true;
  if (channel === 'nightly' && isPrerelease && latestTag && latestTag !== currentTag) return true;
  return false;
}

function pickRigmatchDownloadUrl(release) {
  const assets = release?.assets || [];
  if (!assets.length) return null;

  const platformTerms = getReleaseAssetTerms();
  const rankedAssets = assets
    .map((asset) => ({
      asset,
      score: scoreReleaseAsset(asset?.name || '', platformTerms),
    }))
    .sort((a, b) => b.score - a.score);

  return rankedAssets[0]?.asset?.browser_download_url || null;
}

function getReleaseAssetTerms() {
  const arch = process.arch === 'x64' ? ['x64', 'amd64'] : [process.arch];

  if (process.platform === 'linux') {
    return ['linux', 'appimage', 'deb', ...arch];
  }

  if (process.platform === 'win32') {
    return ['win', 'windows', 'exe', 'nsis', 'zip', ...arch];
  }

  if (process.platform === 'darwin') {
    return ['mac', 'macos', 'darwin', 'dmg', 'zip', process.arch === 'arm64' ? 'arm64' : 'x64'];
  }

  return arch;
}

function scoreReleaseAsset(name, terms) {
  const lower = String(name).toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function summarizeReleaseNotes(body) {
  const text = String(body || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\r/g, '')
    .trim();

  if (!text) return null;
  return text.length > 1400 ? `${text.slice(0, 1400).trim()}...` : text;
}

function getPrivateNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.entries(interfaces).forEach(([name, values]) => {
    (values || []).forEach((entry) => {
      if (entry.family !== 'IPv4' || entry.internal) return;
      if (!isPrivateIp(entry.address)) return;
      addresses.push({
        name,
        address: entry.address,
        subnet: entry.address.split('.').slice(0, 3).join('.'),
        isVirtual: isLikelyVirtualInterface(name),
      });
    });
  });

  return addresses.sort(compareNetworkAddresses);
}

function compareNetworkAddresses(a, b) {
  const priorityDelta = getNetworkScanPriority(a) - getNetworkScanPriority(b);
  if (priorityDelta !== 0) return priorityDelta;

  return a.address.localeCompare(b.address, undefined, { numeric: true });
}

function getNetworkScanPriority(network) {
  if (network.isVirtual) return 30;
  if (/ethernet|wi-?fi|wlan|wireless|lan/i.test(network.name)) return 0;
  if (/^192\.168\./.test(network.address)) return 5;
  if (/^10\./.test(network.address)) return 10;
  return 15;
}

function isLikelyVirtualInterface(name) {
  return /vmware|virtualbox|hyper-v|default switch|wsl|loopback|vethernet|docker|tailscale|zerotier|npcap|tunnel|bridge/i.test(
    name,
  );
}

function isPrivateIp(ip) {
  return (
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

// ID-03: Validate that a baseUrl is localhost-only before using it in fetch calls.
function assertLocalhostUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error(`Invalid Ollama URL: ${url}`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Ollama URL must use http(s)');
  const host = parsed.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') throw new Error('Ollama URL must point to localhost');
}

async function getOllamaStatus(baseUrl = OLLAMA_LOCAL_URL) {
  assertLocalhostUrl(baseUrl);
  try {
    const startedAt = Date.now();
    const [version, tags] = await Promise.all([
      fetchJson(`${baseUrl}/api/version`, {}, 2000),
      fetchJson(`${baseUrl}/api/tags`, {}, 2500),
    ]);

    const models = (tags.models || []).map((model) => ({
      name: model.name || model.model,
      model: model.model || model.name,
      sizeGb: bytesToGb(model.size),
      modifiedAt: model.modified_at,
      family: model.details?.family,
      parameterSize: model.details?.parameter_size,
      quantization: model.details?.quantization_level,
    }));

    return {
      ready: true,
      baseUrl,
      version: version.version || 'Unknown',
      pingMs: Date.now() - startedAt,
      models,
      error: null,
    };
  } catch (error) {
    return {
      ready: false,
      baseUrl,
      version: null,
      pingMs: null,
      models: [],
      error: error.message || 'Ollama is not reachable',
    };
  }
}

async function getOllamaCatalog(options = {}) {
  const fallback = curatedCatalog.map((entry) => ({
    ...entry,
    id: `${entry.name}:${entry.tag}`,
    source: 'Curated fallback',
    live: false,
  }));
  const now = Date.now();

  if (!options?.force && ollamaCatalogCache?.models?.length && now - ollamaCatalogCacheAt < OLLAMA_CATALOG_CACHE_MS) {
    return {
      ...ollamaCatalogCache,
      syncedAt: new Date(ollamaCatalogCacheAt).toISOString(),
    };
  }

  if (catalogFetchPromise) return catalogFetchPromise;

  catalogFetchPromise = (async () => {
  try {
    const libraryPages = await getOllamaLibraryPages();
    const libraryModels = libraryPages.flatMap((html) => extractOllamaLibraryModels(html));
    const pullsMap = new Map();
    const seenNames = new Set();
    for (const { name, pulls } of libraryModels) {
      if (!seenNames.has(name)) {
        seenNames.add(name);
        pullsMap.set(name, pulls);
      }
    }
    const uniqueNames = Array.from(seenNames).slice(0, OLLAMA_LIBRARY_FAMILY_LIMIT);
    const detailedNames = uniqueNames.slice(0, OLLAMA_LIBRARY_DETAIL_LIMIT);
    const detailedCatalogs = await mapWithConcurrency(
      detailedNames,
      OLLAMA_DETAIL_CONCURRENCY,
      (name) => getOllamaFamilyCatalog(name).catch(() => []),
    );
    const detailedCatalog = detailedCatalogs.flat().map((entry) => ({
      ...entry,
      pulls: pullsMap.get(entry.name) ?? null,
    }));
    const detailedCatalogNames = new Set(detailedCatalog.map((entry) => entry.name));
    const familyOnlyCatalog = uniqueNames
      .filter((name) => !detailedCatalogNames.has(name))
      .map((name) => ({
        id: `${name}:latest`,
        name,
        tag: 'latest',
        params: 'Unknown',
        sizeGb: null,
        pack: 'Live Family',
        source: 'Ollama library',
        live: true,
        pulls: pullsMap.get(name) ?? null,
      }));
    const liveCatalog = [...detailedCatalog, ...familyOnlyCatalog].slice(0, OLLAMA_LIBRARY_MODEL_LIMIT);

    const result = {
      syncedAt: new Date().toISOString(),
      source: 'Ollama library live scan',
      models: mergeCatalogs(liveCatalog, fallback),
      error: null,
    };
    ollamaCatalogCache = result;
    ollamaCatalogCacheAt = Date.now();
    return result;
  } catch (error) {
    if (ollamaCatalogCache?.models?.length) {
      return {
        ...ollamaCatalogCache,
        syncedAt: new Date(ollamaCatalogCacheAt).toISOString(),
        error: `Live sync failed; showing cached Ollama library: ${error.message || 'Could not sync Ollama library'}`,
      };
    }

    return {
      syncedAt: new Date().toISOString(),
      source: 'Curated fallback',
      models: fallback,
      error: error.message || 'Could not sync Ollama library',
    };
  } finally {
    catalogFetchPromise = null;
  }
  })();

  return catalogFetchPromise;
}

function mergeCatalogs(liveCatalog, fallback) {
  const map = new Map();
  fallback.forEach((entry) => map.set(`${entry.name}:${entry.tag}`, entry));
  liveCatalog.forEach((entry) => {
    map.set(`${entry.name}:${entry.tag}`, entry);
  });
  return Array.from(map.values());
}

const OLLAMA_LIBRARY_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per page

async function fetchOllamaHtml(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': APP_USER_AGENT },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error(`Unexpected content-type from Ollama library: ${contentType}`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > OLLAMA_LIBRARY_MAX_BYTES) {
      throw new Error(`Ollama library response too large: ${buffer.byteLength} bytes`);
    }
    return new TextDecoder().decode(buffer);
  } finally {
    clearTimeout(timer);
  }
}

async function getOllamaLibraryPages() {
  const urls = [
    `${OLLAMA_LIBRARY_URL}?sort=newest`,
    OLLAMA_LIBRARY_URL,
    `${OLLAMA_LIBRARY_URL}?sort=popular`,
  ];
  const pages = await Promise.all(
    urls.map((url) => fetchOllamaHtml(url, 7000).catch(() => '')),
  );
  const usablePages = pages.filter(Boolean);

  if (usablePages.length === 0) {
    throw new Error('Could not reach the Ollama model library.');
  }

  return usablePages;
}

function parsePullCount(text) {
  if (!text) return null;
  const m = String(text).trim().match(/^([\d.]+)\s*([KMBkmb]?)$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const mul = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[m[2].toLowerCase()] || 1;
  return Math.round(num * mul);
}

function extractOllamaLibraryModels(html) {
  const source = String(html || '');
  const results = [];
  const seen = new Set();
  // Each model card is a <li> element on the library list page
  for (const section of source.split(/<li[\s>]/i)) {
    const nameMatch = section.match(/href=["']\/library\/([a-zA-Z0-9._-]+)["']/i);
    if (!nameMatch) continue;
    const name = decodeURIComponentSafe(nameMatch[1]);
    if (!isValidOllamaName(name) || seen.has(name)) continue;
    seen.add(name);
    // Try x-test-pull-count attr (old Alpine.js site), then "1.2M Pulls" text pattern (Next.js site)
    const pullMatch = section.match(/x-test-pull-count[^>]*>([^<]+)<\/span>/i)
      || section.match(/([\d.]+[KMBkmb])\s+Pulls/i)
      || section.match(/"pullCount"\s*:\s*(\d+)/i);
    results.push({ name, pulls: pullMatch ? parsePullCount(pullMatch[1]) : null });
  }
  return results;
}

function extractOllamaLibraryNames(html) {
  return extractOllamaLibraryModels(html).map((m) => m.name);
}

async function getOllamaFamilyCatalog(name) {
  const html = await fetchOllamaHtml(`${OLLAMA_LIBRARY_URL}/${name}`, 6500);
  const rows = parseOllamaFamilyRows(name, html);

  if (rows.length === 0) {
    return [{
      id: `${name}:latest`,
      name,
      tag: 'latest',
      params: 'Unknown',
      sizeGb: null,
      pack: 'Live Family',
      source: 'Ollama library',
      live: true,
    }];
  }

  return rows;
}

function parseOllamaFamilyRows(name, html) {
  const rows = [];
  const seen = new Set();
  const source = String(html || '');
  const rowPattern = new RegExp(`href=["']/library/${escapeRegExp(name)}:([^"'#?/<>\\s]+)["']`, 'gi');

  for (const match of source.matchAll(rowPattern)) {
    const tag = decodeURIComponentSafe(decodeHtml(match[1]));
    if (!isValidOllamaTag(tag)) continue;
    const start = Math.max(0, (match.index || 0) - 220);
    const end = Math.min(source.length, (match.index || 0) + 1400);
    const detail = getPlainText(source.slice(start, end));
    const sizeGb = parseSizeToGb(detail);
    const key = `${name}:${tag}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      id: key,
      name,
      tag,
      params: inferParamsFromTag(tag),
      sizeGb,
      pack: tag === 'latest' ? 'Live Latest' : 'Live Tag',
      source: 'Ollama library',
      live: true,
    });
  }

  return sortOllamaFamilyRows(rows).slice(0, OLLAMA_FAMILY_TAG_LIMIT);
}

function sortOllamaFamilyRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.tag === 'latest') return -1;
    if (b.tag === 'latest') return 1;
    if (Boolean(a.sizeGb) !== Boolean(b.sizeGb)) return a.sizeGb ? -1 : 1;
    const sizeDelta = (a.sizeGb || Number.POSITIVE_INFINITY) - (b.sizeGb || Number.POSITIVE_INFINITY);
    if (sizeDelta !== 0) return sizeDelta;
    return a.tag.localeCompare(b.tag);
  });
}

function parseSizeToGb(detail) {
  const match = String(detail || '').match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase() === 'mb'
    ? Math.round((value / 1024) * 10) / 10
    : Math.round(value * 10) / 10;
}

function inferParamsFromTag(tag) {
  const match = String(tag || '').match(/(\d+(?:\.\d+)?)(m|b)/i);
  if (!match) return tag === 'latest' ? 'Latest' : 'Unknown';
  return `${match[1]}${match[2].toUpperCase()}`;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function getPlainText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '));
}

function isValidOllamaName(name) {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(String(name || ''));
}

function isValidOllamaTag(tag) {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(String(tag || ''));
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function scanLanForOllama() {
  const startedAt = Date.now();
  const networks = getPrivateNetworkAddresses();
  const local = await getOllamaStatus();
  const hosts = local.ready
    ? [{
      id: 'localhost',
      hostname: `${os.hostname()} (Localhost)`,
      ip: '127.0.0.1',
      provider: 'Ollama',
      models: local.models.length,
      status: 'Ready',
      pingMs: local.pingMs,
      baseUrl: OLLAMA_LOCAL_URL,
      isLocal: true,
    }]
    : [];

  return {
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    checkedHosts: 1,
    subnets: [],
    networks,
    hosts,
  };
}

async function addHostByAddress() {
  throw new Error('Remote Ollama hosts are disabled for v1. Remote runners are planned for RigMatch 2.0.');
}

function normalizeOllamaAddress(address) {
  const raw = String(address || '').trim();
  if (!raw) throw new Error('Enter an IP address or Ollama URL');

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);

  if (!url.port) {
    url.port = '11434';
  }

  url.pathname = '';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}

async function probeOllamaHost(ip, isLocal, explicitBaseUrl) {
  const baseUrl = explicitBaseUrl || `http://${ip}:11434`;
  const startedAt = Date.now();

  try {
    const version = await fetchJson(`${baseUrl}/api/version`, {}, 1100);
    const tags = await fetchJson(`${baseUrl}/api/tags`, {}, 3500).catch(() => ({ models: null }));
    const modelCount = Array.isArray(tags.models) ? tags.models.length : 0;

    return {
      id: ip,
      hostname: isLocal ? `${os.hostname()} (This Machine)` : ip,
      ip,
      provider: 'Ollama',
      discovery: 'ollama',
      version: version.version || 'Unknown',
      models: modelCount,
      status: Array.isArray(tags.models) ? 'Ready' : 'API Ready',
      pingMs: Date.now() - startedAt,
      baseUrl,
      isLocal,
    };
  } catch {
    return null;
  }
}

async function probeComputerHost(ip, isLocal) {
  if (isLocal) return null;

  const startedAt = Date.now();
  const probes = await Promise.all(COMPUTER_PROBE_PORTS.map((port) => probeTcpPort(ip, port)));
  const openPorts = probes.filter((probe) => probe.state === 'open').map((probe) => probe.port);
  const ollamaProbe = probes.find((probe) => probe.port === 11434);
  const ollamaRefused = ollamaProbe?.state === 'refused';

  if (openPorts.length === 0 && !ollamaRefused) return null;

  return {
    id: `computer-${ip}`,
    hostname: await resolveHostName(ip),
    ip,
    provider: openPorts.includes(22) ? 'Computer / SSH' : 'Computer',
    discovery: 'computer',
    models: 0,
    status: ollamaRefused ? 'Remote disabled for v1' : 'Computer found',
    pingMs: Date.now() - startedAt,
    baseUrl: `http://${ip}:11434`,
    isLocal: false,
    openPorts,
    setupHint: 'Remote systems are disabled for RigMatch v1. Use local Ollama on this computer.',
  };
}

function probeTcpPort(ip, port, timeoutMs = 650) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function done(state) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ port, state });
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done('open'));
    socket.once('timeout', () => done('timeout'));
    socket.once('error', (error) => {
      done(error.code === 'ECONNREFUSED' ? 'refused' : 'closed');
    });
    socket.connect(port, ip);
  });
}

async function resolveHostName(ip) {
  try {
    const names = await dns.reverse(ip);
    return names[0] || ip;
  } catch {
    return ip;
  }
}

function sortDiscoveredHosts(a, b) {
  const aRank = a.discovery === 'computer' ? 1 : 0;
  const bRank = b.discovery === 'computer' ? 1 : 0;
  if (aRank !== bRank) return aRank - bRank;
  return (a.pingMs || 9999) - (b.pingMs || 9999);
}

async function pullModel(request = {}, sender) {
  const model = request.model;
  const baseUrl = request.baseUrl || OLLAMA_LOCAL_URL;
  assertLocalhostUrl(baseUrl);
  const progressId = request.progressId || `pull-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!model) {
    throw new Error('No model selected to pull');
  }

  const emit = createPullProgressEmitter(sender, {
    id: progressId,
    model,
    baseUrl,
  });
  const controller = new AbortController();
  activePullController = controller;
  const timeoutMs = 1000 * 60 * 45;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let lastStatus = 'Pulled';

  emit({
    phase: 'started',
    status: 'Starting download',
    percent: null,
    completedBytes: null,
    totalBytes: null,
    speedBps: null,
  }, true);

  try {
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
      }),
    });

    if (!response.ok) {
      const detail = extractResponseDetail(await response.text());
      throw new Error(`${response.status} ${response.statusText} from ${getUrlLabel(`${baseUrl}/api/pull`)}${detail ? `: ${detail}` : ''}`);
    }

    if (!response.body) {
      emit({
        phase: 'pulling',
        status: 'Ollama did not stream progress, waiting for completion',
        percent: null,
        completedBytes: null,
        totalBytes: null,
        speedBps: null,
      }, true);
      emit({
        phase: 'complete',
        status: 'Download complete',
        percent: 100,
        completedBytes: null,
        totalBytes: null,
        speedBps: 0,
      }, true);
      return {
        model,
        baseUrl,
        status: 'Pulled',
        completedAt: new Date().toISOString(),
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const tracker = createPullProgressTracker();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
      }

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const update = normalizePullProgressLine(line, tracker);
        if (!update) continue;
        if (update.error) throw new Error(update.error);
        lastStatus = update.status || lastStatus;
        emit(update, update.phase !== 'pulling');
      }

      if (done) break;
    }

    const finalUpdate = normalizePullProgressLine(buffer, tracker);
    if (finalUpdate?.error) throw new Error(finalUpdate.error);
    if (finalUpdate) {
      lastStatus = finalUpdate.status || lastStatus;
      emit(finalUpdate, finalUpdate.phase !== 'pulling');
    }

    emit({
      phase: 'complete',
      status: lastStatus === 'success' ? 'Download complete' : lastStatus,
      percent: 100,
      completedBytes: tracker.lastCompletedBytes,
      totalBytes: tracker.lastTotalBytes,
      speedBps: 0,
      digest: tracker.lastDigest,
    }, true);
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `Timed out downloading ${model} from ${getUrlOrigin(baseUrl)} after ${timeoutMs} ms.`
      : getLogErrorMessage(error);
    emit({
      phase: 'failed',
      status: 'Download failed',
      percent: null,
      completedBytes: null,
      totalBytes: null,
      speedBps: 0,
      error: message,
    }, true);

    if (error?.name === 'AbortError') {
      throw new Error(message);
    }

    if (error?.message === 'fetch failed' || error?.name === 'TypeError') {
      throw new Error(`Cannot reach local Ollama at ${getUrlOrigin(baseUrl)}. Make sure the Ollama app is installed and running on this computer.`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
    if (activePullController === controller) activePullController = null;
  }

  return {
    model,
    baseUrl,
    status: lastStatus,
    completedAt: new Date().toISOString(),
  };
}

function createPullProgressEmitter(sender, baseUpdate) {
  let lastEmitAt = 0;
  let lastPercent = null;

  return (partial, force = false) => {
    const now = Date.now();
    const update = {
      ...baseUpdate,
      phase: partial.phase || 'pulling',
      status: partial.status || 'Downloading',
      percent: typeof partial.percent === 'number' ? Math.max(0, Math.min(100, Math.round(partial.percent))) : null,
      completedBytes: normalizeByteCount(partial.completedBytes),
      totalBytes: normalizeByteCount(partial.totalBytes),
      speedBps: normalizeByteCount(partial.speedBps),
      digest: partial.digest || null,
      error: partial.error || null,
      updatedAt: new Date(now).toISOString(),
    };
    const percentChanged = update.percent !== lastPercent;

    if (!force && update.phase === 'pulling' && now - lastEmitAt < 250 && !percentChanged) {
      return;
    }

    lastEmitAt = now;
    lastPercent = update.percent;

    if (sender && !sender.isDestroyed()) {
      sender.send('ollama:pullProgress', update);
    }
  };
}

function createPullProgressTracker() {
  return {
    lastDigest: null,
    lastCompletedBytes: null,
    lastTotalBytes: null,
    lastSampleBytes: null,
    lastSampleAt: 0,
    lastSpeedBps: null,
  };
}

function normalizePullProgressLine(line, tracker) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;

  let chunk;
  try {
    chunk = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const status = String(chunk.status || 'Downloading');
  const statusLower = status.toLowerCase();
  const completedBytes = normalizeByteCount(chunk.completed);
  const totalBytes = normalizeByteCount(chunk.total);
  const digest = chunk.digest || tracker.lastDigest || null;
  const now = Date.now();

  if (digest !== tracker.lastDigest || (completedBytes !== null && tracker.lastSampleBytes !== null && completedBytes < tracker.lastSampleBytes)) {
    tracker.lastDigest = digest;
    tracker.lastSampleBytes = completedBytes;
    tracker.lastSampleAt = now;
    tracker.lastSpeedBps = null;
  } else if (completedBytes !== null && tracker.lastSampleBytes !== null && tracker.lastSampleAt > 0) {
    const elapsedSeconds = Math.max(0.001, (now - tracker.lastSampleAt) / 1000);
    const deltaBytes = Math.max(0, completedBytes - tracker.lastSampleBytes);
    tracker.lastSpeedBps = deltaBytes / elapsedSeconds;
    tracker.lastSampleBytes = completedBytes;
    tracker.lastSampleAt = now;
  } else if (completedBytes !== null) {
    tracker.lastSampleBytes = completedBytes;
    tracker.lastSampleAt = now;
  }

  if (completedBytes !== null) tracker.lastCompletedBytes = completedBytes;
  if (totalBytes !== null) tracker.lastTotalBytes = totalBytes;

  const percent = completedBytes !== null && totalBytes !== null && totalBytes > 0
    ? Math.min(statusLower === 'success' ? 100 : 99, Math.round((completedBytes / totalBytes) * 100))
    : statusLower === 'success'
      ? 100
      : null;

  return {
    phase: statusLower === 'success' ? 'complete' : 'pulling',
    status: statusLower === 'success' ? 'Download complete' : status,
    percent,
    completedBytes,
    totalBytes,
    speedBps: tracker.lastSpeedBps,
    digest,
    error: chunk.error ? String(chunk.error) : null,
  };
}

function normalizeByteCount(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

async function deleteModel(request = {}) {
  const model = request.model;
  const baseUrl = request.baseUrl || OLLAMA_LOCAL_URL;
  assertLocalhostUrl(baseUrl);
  if (!model) {
    throw new Error('No model selected to delete');
  }

  await fetchJson(
    `${baseUrl}/api/delete`,
    {
      method: 'DELETE',
      body: JSON.stringify({
        model,
      }),
    },
    120000,
  );

  await appendAppLog({
    level: 'warn',
    source: 'ollama',
    message: `Deleted model: ${model}`,
    details: {
      model,
      baseUrl,
    },
  });

  return {
    model,
    baseUrl,
    status: 'Deleted',
    completedAt: new Date().toISOString(),
  };
}

async function runBenchmark(request = {}, sender) {
  if (benchmarkRunning) {
    throw new Error('A benchmark is already running. Please wait for it to complete.');
  }
  benchmarkRunning = true;
  try {
    return await runBenchmarkInner(request, sender);
  } finally {
    benchmarkRunning = false;
  }
}

async function runBenchmarkInner(request = {}, sender) {
  const model = request.model;
  const baseUrl = request.baseUrl || OLLAMA_LOCAL_URL;
  assertLocalhostUrl(baseUrl);
  const questionCount = normalizeBenchmarkQuestionCount(request.questionCount);
  const benchmarkPrompts = buildBenchmarkPromptPlan(questionCount, request.questions);
  const progressId = typeof request.progressId === 'string' ? request.progressId : null;
  const sendProgress = (update) => {
    if (!progressId || !sender || sender.isDestroyed()) return;
    sender.send('benchmark:progress', {
      id: progressId,
      model,
      promptTotal: benchmarkPrompts.length,
      ...update,
    });
  };

  if (!model) {
    throw new Error('No model selected for benchmark');
  }

  const promptResults = [];
  const startedAt = Date.now();
  const rawRuns = [];

  await appendAppLog({
    level: 'info',
    source: 'benchmark',
    message: `Benchmark started: ${model}`,
    details: {
      model,
      baseUrl,
      questionCount,
      prompts: benchmarkPrompts.map((prompt) => ({
        id: prompt.id,
        label: prompt.label,
        type: prompt.type,
      })),
    },
  });

  sendProgress({
    phase: 'started',
    promptIndex: 0,
    message: `${model} is entering the compatibility round.`,
  });

  for (const [promptIndex, prompt] of benchmarkPrompts.entries()) {
    const runs = [];
    sendProgress({
      phase: 'prompt-start',
      promptIndex,
      promptId: prompt.id,
      promptLabel: prompt.label,
      prompt: prompt.prompt,
      message: `Asking ${prompt.label}.`,
    });

    for (let runIndex = 0; runIndex < BENCHMARK_REPEATS; runIndex += 1) {
      const promptStart = Date.now();
      let responseText = '';
      let evalCount = 0;
      let evalDurationSeconds = 0;
      let firstTokenMs = null;

      try {
        const httpResponse = await fetch(
          `${baseUrl}/api/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt: prompt.prompt,
              stream: true,
              options: {
                temperature: 0.15,
                num_predict: 300,
                num_ctx: 2048,
              },
            }),
            signal: AbortSignal.timeout(120000),
          },
        );

        if (!httpResponse.ok) {
          const detail = extractResponseDetail(await httpResponse.text());
          throw new Error(`${httpResponse.status} ${httpResponse.statusText}${detail ? `: ${detail}` : ''}`);
        }

        const reader = httpResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: !done });

          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              if (chunk.response) {
                if (firstTokenMs === null) firstTokenMs = Date.now() - promptStart;
                responseText += chunk.response;
                sendProgress({
                  phase: 'prompt-token',
                  promptIndex,
                  promptId: prompt.id,
                  promptLabel: prompt.label,
                  tokenCount: responseText.length,
                });
              }
              if (chunk.done) {
                evalCount = chunk.eval_count || estimateTokens(responseText);
                evalDurationSeconds = chunk.eval_duration ? chunk.eval_duration / 1_000_000_000 : (Date.now() - promptStart) / 1000;
              }
            } catch { /* skip malformed chunk */ }
          }

          if (done) break;
        }
      } catch (error) {
        await appendAppLog({
          level: 'error',
          source: 'benchmark',
          message: `Benchmark prompt failed: ${model} / ${prompt.label}`,
          details: {
            model,
            baseUrl,
            questionCount,
            promptId: prompt.id,
            promptLabel: prompt.label,
            promptType: prompt.type,
            runIndex: runIndex + 1,
            error: serializeError(error),
          },
        });
        sendProgress({
          phase: 'failed',
          promptIndex,
          promptId: prompt.id,
          promptLabel: prompt.label,
          prompt: prompt.prompt,
          message: getLogErrorMessage(error),
        });
        throw error;
      }

      const elapsedMs = Date.now() - promptStart;
      const tokensPerSecond = evalDurationSeconds > 0 ? evalCount / evalDurationSeconds : 0;
      const sobrietyScore = scoreSobriety(prompt, responseText);

      runs.push({
        elapsedMs,
        firstTokenMs: firstTokenMs ?? elapsedMs,
        tokensPerSecond,
        sobrietyScore,
        response: responseText,
        doneReason: 'complete',
      });
      rawRuns.push({ prompt, ...runs[runs.length - 1] });
    }

    promptResults.push({
      id: prompt.id,
      label: prompt.label,
      prompt: prompt.prompt,
      elapsedMs: Math.round(average(runs.map((run) => run.elapsedMs))),
      tokensPerSecond: Math.round(average(runs.map((run) => run.tokensPerSecond)) * 10) / 10,
      sobrietyScore: Math.round(average(runs.map((run) => run.sobrietyScore))),
      response: runs[runs.length - 1]?.response || '',
      doneReason: `${runs.length} run average`,
    });
    sendProgress({
      phase: 'prompt-complete',
      promptIndex,
      promptId: prompt.id,
      promptLabel: prompt.label,
      prompt: prompt.prompt,
      elapsedMs: promptResults[promptResults.length - 1].elapsedMs,
      tokensPerSecond: promptResults[promptResults.length - 1].tokensPerSecond,
      sobrietyScore: promptResults[promptResults.length - 1].sobrietyScore,
      message: `${prompt.label} scored ${promptResults[promptResults.length - 1].sobrietyScore}.`,
    });
  }

  const avgTokens = average(promptResults.map((result) => result.tokensPerSecond));
  const avgLatency = average(promptResults.map((result) => result.elapsedMs));
  const avgFirstToken = average(rawRuns.map((r) => r.firstTokenMs).filter(Number.isFinite));
  const avgSobriety = average(promptResults.map((result) => result.sobrietyScore));
  const stabilityScore = Math.round((rawRuns.filter((result) => result.response.trim()).length / rawRuns.length) * 100);
  // Scale: 5 tok/s = 0, 100 tok/s = 100. Latency adds up to 5 bonus points for sub-second first response.
  const speedScore = clamp(Math.round((avgTokens - 5) / 95 * 100 + Math.max(0, 5 - avgLatency / 200)));
  const fitScore = scoreRigFit(model);
  const totalScore = clamp(Math.round(speedScore * 0.32 + avgSobriety * 0.34 + stabilityScore * 0.18 + fitScore * 0.16));
  const elapsedMs = Date.now() - startedAt;
  const result = {
    model,
    baseUrl,
    questionCount,
    completedAt: new Date().toISOString(),
    elapsedMs,
    avgLatencyMs: Math.round(avgLatency),
    avgFirstTokenMs: Math.round(avgFirstToken),
    avgTokensPerSecond: Math.round(avgTokens * 10) / 10,
    prompts: promptResults,
    scores: {
      speed: speedScore,
      sobriety: Math.round(avgSobriety),
      stability: stabilityScore,
      fit: fitScore,
      total: totalScore,
      grade: gradeFor(totalScore),
    },
  };

  await appendAppLog({
    level: 'info',
    source: 'benchmark',
    message: `Benchmark completed: ${model}`,
    details: {
      model,
      baseUrl,
      elapsedMs,
      questionCount,
      scores: result.scores,
      promptCount: promptResults.length,
    },
  });

  sendProgress({
    phase: 'complete',
    promptIndex: benchmarkPrompts.length,
    message: `${model} finished with ${result.scores.total} match score.`,
  });

  return result;
}

async function sendChat(request = {}) {
  const model = request.model;
  const message = request.message;
  const baseUrl = request.baseUrl || OLLAMA_LOCAL_URL;
  assertLocalhostUrl(baseUrl);
  if (!model || !message) {
    throw new Error('Model and message are required');
  }

  // U-01: strip control chars so user input cannot inject additional "Assistant:" turns
  const safeMessage = String(message).replace(/[\x00-\x1F\x7F]+/g, ' ').slice(0, 4000).trim();
  if (!safeMessage) throw new Error('Message is empty after sanitization');

  const response = await fetchJson(
    `${baseUrl}/api/generate`,
    {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt: `You are the selected local RigMatch.AI assistant. Be warm, concise, and honest about limits.\n\nUser: ${safeMessage}\nAssistant:`,
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 220,
        },
      }),
    },
    120000,
  );

  return {
    model,
    message: response.response || '',
    completedAt: new Date().toISOString(),
  };
}

function scoreSobriety(prompt, response) {
  const text = response.trim();
  if (!text) return 0;

  if (prompt.type === 'json') {
    // Strip markdown code fences if model wrapped the JSON
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(jsonText);
      const keys = Object.keys(parsed).length;
      if (keys >= 4) return 92;
      if (keys >= 3) return 82;
      if (keys >= 2) return 70;
      return 52;
    } catch {
      return jsonText.includes('{') && jsonText.includes('}') ? 42 : 22;
    }
  }

  if (prompt.type === 'truth') {
    // Model should admit it doesn't know — catch all common refusal/uncertainty phrasings
    const admits = /cannot|can't|can not|not provided|not enough|don't know|do not know|unknown|unable|not able|no information|not aware|no way to|outside my|beyond my|do not have|i have no|don't have access|do not have access|not available|isn't available|is not available|lack(?:s)? (?:the )?(?:access|ability|information|context)|without (?:access|knowing|that information)|not (?:been )?(?:given|provided|told)/i.test(text);
    return admits ? 96 : 38;
  }

  if (prompt.type === 'format') {
    // Count both bullet lines (-, *, •) and numbered lines (1. 1) a. etc.)
    const lines = text.split('\n');
    const bulletLines = lines.filter((line) => /^\s*[-*•]\s/.test(line)).length;
    const numberedLines = lines.filter((line) => /^\s*(?:\d+|[a-z])[.)]\s/i.test(line)).length;
    const listLines = bulletLines + numberedLines;
    if (listLines >= 2 && listLines <= 5) return 92;
    if (listLines === 1) return 65;
    if (listLines > 5) return 75; // gave too many but tried
    return 48;
  }

  if (prompt.type === 'coding') {
    const hasFunction = /function\s+clampScore|const\s+clampScore|clampScore\s*[=(]|=>/.test(text);
    const hasClamping = /Math\.min|Math\.max/.test(text);
    if (hasFunction && hasClamping) return 92;
    if (hasClamping) return 72;
    if (/function|const|=>/.test(text)) return 58;
    return 38;
  }

  return clamp(78 + Math.min(14, Math.floor(text.length / 80)));
}

function scoreRigFit(model) {
  const lower = String(model || '').toLowerCase();
  if (/(0\.5b|1b|1\.5b|2b|3b|mini|270m|nano)/.test(lower)) return 96;
  if (/(4b|6b|7b|8b|9b)/.test(lower)) return 88;
  if (/(10b|11b|12b|13b|14b)/.test(lower)) return 74;
  if (/(22b|24b|27b|30b|32b|34b)/.test(lower)) return 58;
  if (/(70b|72b|90b|110b|123b|235b|405b)/.test(lower)) return 38;
  return 82;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function estimateTokens(text) {
  return Math.max(1, Math.round(text.split(/\s+/).length * 1.3));
}

function clamp(value) {
  return Math.min(100, Math.max(0, value));
}

function gradeFor(score) {
  if (score >= 95) return 'S';
  if (score >= 88) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 72) return 'B';
  if (score >= 64) return 'C';
  return 'D';
}
