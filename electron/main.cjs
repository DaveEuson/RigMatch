const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const os = require('node:os');
const dns = require('node:dns').promises;
const net = require('node:net');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const si = require('systeminformation');
const { buildBenchmarkPromptPlan, normalizeBenchmarkQuestionCount } = require('./benchmarkSuite.cjs');

const OLLAMA_LOCAL_URL = 'http://127.0.0.1:11434';
const OLLAMA_LIBRARY_URL = 'https://ollama.com/library';
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
const CUDA_TOOLKIT_URL = 'https://developer.nvidia.com/cuda-toolkit';
const CUDA_TOOLKIT_ARCHIVE_URL = 'https://developer.nvidia.com/cuda-toolkit-archive';
const CUDA_REDIST_INDEX_URL = 'https://developer.download.nvidia.com/compute/cuda/redist/';
const execFileAsync = promisify(execFile);
let latestCudaCache = null;
let latestCudaCacheAt = 0;
const APP_USER_AGENT = 'RigMatchAI/0.1';
const BENCHMARK_REPEATS = 1;
const COMPUTER_PROBE_PORTS = [11434, 22, 445, 3389, 80, 443];
const LOG_LIMIT = 250;

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: '#080b0d',
    title: 'RigMatch.AI',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev()) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

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
  handleLogged('ollama:getCatalog', 'catalog', () => getOllamaCatalog());
  handleLogged('ollama:openDownload', 'ollama', () => openOllamaDownload());
  handleLogged('ollama:pullModel', 'ollama', (_event, request) => pullModel(request));
  handleLogged('ollama:deleteModel', 'ollama', (_event, request) => deleteModel(request));
  handleLogged('network:scanLan', 'network', () => scanLanForOllama());
  handleLogged('network:addHostByAddress', 'network', (_event, address) => addHostByAddress(address));
  handleLogged('benchmark:run', 'benchmark', (_event, request) => runBenchmark(request));
  handleLogged('chat:send', 'chat', (_event, request) => sendChat(request));
  handleLogged('logs:list', 'logs', (_event, limit) => readAppLogs(limit));
  handleLogged('logs:append', 'logs', (_event, entry) => appendAppLog(entry));
  handleLogged('logs:clear', 'logs', () => clearAppLogs());
  handleLogged('logs:openFolder', 'logs', () => openAppLogsFolder());
}

function handleLogged(channel, source, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
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

async function appendAppLog(entry = {}) {
  const logEntry = normalizeLogEntry(entry);
  const filePath = getLogFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
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
  await shell.openExternal(OLLAMA_DOWNLOAD_URL);
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
      throw new Error(`Cannot reach Ollama at ${getUrlOrigin(url)}. Make sure Ollama is running on that machine, listening on 0.0.0.0:11434, and the firewall allows TCP 11434.`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
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

async function getSystemProfile() {
  const [cpu, mem, graphics, osInfo, load, fsSize, battery] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.graphics(),
    si.osInfo(),
    si.currentLoad(),
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
      loadPercent: Math.round(load.currentLoad || 0),
    },
    memory: {
      totalGb: bytesToGb(mem.total),
      availableGb: bytesToGb(mem.available),
      usedGb: bytesToGb(mem.used),
    },
    gpu: {
      vendor: primaryGpu.vendor || 'Unknown',
      model: primaryGpu.model || 'Unknown GPU',
      vramGb: mbToGb(primaryGpu.vram),
      driverVersion: primaryGpu.driverVersion || 'Unknown',
      bus: primaryGpu.bus || 'Unknown',
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

async function getOllamaStatus(baseUrl = OLLAMA_LOCAL_URL) {
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

async function getOllamaCatalog() {
  const fallback = curatedCatalog.map((entry) => ({
    ...entry,
    id: `${entry.name}:${entry.tag}`,
    source: 'Curated fallback',
    live: false,
  }));

  try {
    const html = await fetchText(OLLAMA_LIBRARY_URL, {}, 6500);
    const names = Array.from(html.matchAll(/href="\/library\/([a-zA-Z0-9._-]+)"/g))
      .map((match) => decodeURIComponent(match[1]))
      .filter((name) => /^[a-z0-9][a-z0-9._-]*$/i.test(name));

    const uniqueNames = Array.from(new Set(names)).slice(0, 40);
    const detailedCatalogs = await Promise.all(
      uniqueNames.slice(0, 24).map((name) => getOllamaFamilyCatalog(name).catch(() => [])),
    );
    const detailedCatalog = detailedCatalogs.flat();
    const detailedNames = new Set(detailedCatalog.map((entry) => entry.name));
    const familyOnlyCatalog = uniqueNames
      .filter((name) => !detailedNames.has(name))
      .map((name) => ({
        id: `${name}:latest`,
        name,
        tag: 'latest',
        params: 'Unknown',
        sizeGb: null,
        pack: 'Live Family',
        source: 'Ollama library',
        live: true,
      }));
    const liveCatalog = [...detailedCatalog, ...familyOnlyCatalog].slice(0, 120);

    return {
      syncedAt: new Date().toISOString(),
      source: OLLAMA_LIBRARY_URL,
      models: mergeCatalogs(liveCatalog, fallback),
      error: null,
    };
  } catch (error) {
    return {
      syncedAt: new Date().toISOString(),
      source: 'Curated fallback',
      models: fallback,
      error: error.message || 'Could not sync Ollama library',
    };
  }
}

function mergeCatalogs(liveCatalog, fallback) {
  const map = new Map();
  fallback.forEach((entry) => map.set(`${entry.name}:${entry.tag}`, entry));
  liveCatalog.forEach((entry) => {
    map.set(`${entry.name}:${entry.tag}`, entry);
  });
  return Array.from(map.values());
}

async function getOllamaFamilyCatalog(name) {
  const html = await fetchText(`${OLLAMA_LIBRARY_URL}/${name}`, {}, 6500);
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
  const rowPattern = new RegExp(
    `<a href="/library/${escapeRegExp(name)}:([^"#?/]+)" class="sm:hidden[\\s\\S]*?<p class="flex text-neutral-500">([^<]+)</p>`,
    'gi',
  );

  for (const match of html.matchAll(rowPattern)) {
    const tag = decodeHtml(match[1]);
    if (!/^[a-z0-9._-]+$/i.test(tag)) continue;
    const detail = decodeHtml(match[2]);
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

  return rows.slice(0, 10);
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
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function scanLanForOllama() {
  const startedAt = Date.now();
  const networks = getPrivateNetworkAddresses();
  const subnets = Array.from(new Set(networks.map((network) => network.subnet))).slice(0, 8);
  const localAddresses = new Set(networks.map((network) => network.address));
  const candidates = [];

  subnets.forEach((subnet) => {
    for (let i = 1; i <= 254; i += 1) {
      candidates.push(`${subnet}.${i}`);
    }
  });

  const hosts = [];
  const concurrency = 64;
  let index = 0;

  async function worker() {
    while (index < candidates.length) {
      const ip = candidates[index];
      index += 1;
      const isLocal = localAddresses.has(ip);
      const result = await probeOllamaHost(ip, isLocal);
      if (result) {
        hosts.push(result);
        continue;
      }

      const computer = await probeComputerHost(ip, isLocal);
      if (computer) hosts.push(computer);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const local = await getOllamaStatus();
  if (local.ready && !hosts.some((host) => host.ip === '127.0.0.1' || localAddresses.has(host.ip))) {
    hosts.unshift({
      id: 'localhost',
      hostname: `${os.hostname()} (Localhost)`,
      ip: '127.0.0.1',
      provider: 'Ollama',
      models: local.models.length,
      status: 'Ready',
      pingMs: local.pingMs,
      baseUrl: OLLAMA_LOCAL_URL,
      isLocal: true,
    });
  }

  return {
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    checkedHosts: candidates.length,
    subnets,
    networks,
    hosts: hosts.sort(sortDiscoveredHosts),
  };
}

async function addHostByAddress(address) {
  const baseUrl = normalizeOllamaAddress(address);
  const url = new URL(baseUrl);
  const host = await probeOllamaHost(url.hostname, url.hostname === '127.0.0.1' || url.hostname === 'localhost', baseUrl);

  if (!host) {
    const computer = await probeComputerHost(url.hostname, url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    if (computer) return computer;
    throw new Error(`No computer or Ollama service answered at ${baseUrl}`);
  }

  return host;
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
    status: ollamaRefused ? 'Ollama not exposed' : 'Computer found',
    pingMs: Date.now() - startedAt,
    baseUrl: `http://${ip}:11434`,
    isLocal: false,
    openPorts,
    setupHint: 'Ollama API is not reachable from this PC. Set OLLAMA_HOST=0.0.0.0:11434 or install the future RigMatch runner.',
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

async function pullModel(request = {}) {
  const model = request.model;
  const baseUrl = request.baseUrl || OLLAMA_LOCAL_URL;

  if (!model) {
    throw new Error('No model selected to pull');
  }

  const response = await fetchJson(
    `${baseUrl}/api/pull`,
    {
      method: 'POST',
      body: JSON.stringify({
        model,
        stream: false,
      }),
    },
    1000 * 60 * 45,
  );

  return {
    model,
    baseUrl,
    status: response.status || 'Pulled',
    completedAt: new Date().toISOString(),
  };
}

async function deleteModel(request = {}) {
  const model = request.model;
  const baseUrl = request.baseUrl || OLLAMA_LOCAL_URL;

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

async function runBenchmark(request = {}) {
  const model = request.model;
  const baseUrl = request.baseUrl || OLLAMA_LOCAL_URL;
  const questionCount = normalizeBenchmarkQuestionCount(request.questionCount);
  const benchmarkPrompts = buildBenchmarkPromptPlan(questionCount, request.questions);

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

  for (const prompt of benchmarkPrompts) {
    const runs = [];

    for (let runIndex = 0; runIndex < BENCHMARK_REPEATS; runIndex += 1) {
      const promptStart = Date.now();
      let response;

      try {
        response = await fetchJson(
          `${baseUrl}/api/generate`,
          {
            method: 'POST',
            body: JSON.stringify({
              model,
              prompt: prompt.prompt,
              stream: false,
              options: {
                temperature: 0.15,
                num_predict: 180,
              },
            }),
          },
          120000,
        );
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
        throw error;
      }

      const elapsedMs = Date.now() - promptStart;
      const evalCount = response.eval_count || estimateTokens(response.response || '');
      const evalDurationSeconds = response.eval_duration ? response.eval_duration / 1_000_000_000 : elapsedMs / 1000;
      const tokensPerSecond = evalDurationSeconds > 0 ? evalCount / evalDurationSeconds : 0;
      const sobrietyScore = scoreSobriety(prompt, response.response || '');

      runs.push({
        elapsedMs,
        tokensPerSecond,
        sobrietyScore,
        response: response.response || '',
        doneReason: response.done_reason || 'complete',
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
  }

  const avgTokens = average(promptResults.map((result) => result.tokensPerSecond));
  const avgLatency = average(promptResults.map((result) => result.elapsedMs));
  const avgSobriety = average(promptResults.map((result) => result.sobrietyScore));
  const stabilityScore = Math.round((rawRuns.filter((result) => result.response.trim()).length / rawRuns.length) * 100);
  const speedScore = clamp(Math.round(avgTokens * 1.5 + Math.max(0, 30 - avgLatency / 200)));
  const fitScore = scoreRigFit(model);
  const totalScore = clamp(Math.round(speedScore * 0.32 + avgSobriety * 0.34 + stabilityScore * 0.18 + fitScore * 0.16));
  const elapsedMs = Date.now() - startedAt;
  const result = {
    model,
    baseUrl,
    questionCount,
    completedAt: new Date().toISOString(),
    elapsedMs,
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

  return result;
}

async function sendChat(request = {}) {
  const model = request.model;
  const message = request.message;
  const baseUrl = request.baseUrl || OLLAMA_LOCAL_URL;

  if (!model || !message) {
    throw new Error('Model and message are required');
  }

  const response = await fetchJson(
    `${baseUrl}/api/generate`,
    {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt: `You are the selected local RigMatch.AI assistant. Be warm, concise, and honest about limits.\n\nUser: ${message}\nAssistant:`,
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
    try {
      const parsed = JSON.parse(text);
      const required = ['intent', 'action', 'target', 'media'];
      const found = required.filter((key) => Object.prototype.hasOwnProperty.call(parsed, key)).length;
      return clamp(45 + found * 14);
    } catch {
      return text.includes('{') && text.includes('}') ? 42 : 25;
    }
  }

  if (prompt.type === 'truth') {
    return /cannot|can't|not provided|not enough|don't know|unknown/i.test(text) ? 96 : 38;
  }

  if (prompt.type === 'format') {
    const bullets = text.split('\n').filter((line) => /^\s*[-*]/.test(line)).length;
    return bullets === 2 ? 95 : bullets > 0 ? 72 : 48;
  }

  if (prompt.type === 'coding') {
    return /function\s+clampScore|const\s+clampScore|=>/.test(text) && /Math\.min|Math\.max/.test(text) ? 92 : 62;
  }

  return clamp(78 + Math.min(14, Math.floor(text.length / 80)));
}

function scoreRigFit(model) {
  const lower = String(model || '').toLowerCase();
  if (/(0\.5b|1b|1\.5b|3b|mini|270m)/.test(lower)) return 96;
  if (/(4b|7b|8b)/.test(lower)) return 88;
  if (/(13b|14b)/.test(lower)) return 74;
  if (/(30b|32b|34b)/.test(lower)) return 58;
  if (/(70b|72b|90b|405b)/.test(lower)) return 38;
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
