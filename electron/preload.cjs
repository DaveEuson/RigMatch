const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getSystemProfile: () => ipcRenderer.invoke('system:getProfile'),
  getOllamaStatus: (baseUrl) => ipcRenderer.invoke('ollama:getStatus', baseUrl),
  getLmStudioStatus: (baseUrl) => ipcRenderer.invoke('lmstudio:getStatus', baseUrl),
  getOllamaCatalog: (options) => ipcRenderer.invoke('ollama:getCatalog', options),
  openOllamaDownload: () => ipcRenderer.invoke('ollama:openDownload'),
  scanLan: () => ipcRenderer.invoke('network:scanLan'),
  addHostByAddress: (address) => ipcRenderer.invoke('network:addHostByAddress', address),
  pullModel: (request) => ipcRenderer.invoke('ollama:pullModel', request),
  abortPull: (progressId, reason) => ipcRenderer.invoke('ollama:abortPull', progressId, reason),
  deleteModel: (request) => ipcRenderer.invoke('ollama:deleteModel', request),
  runAdvancedGenerate: (request) => ipcRenderer.invoke('ollama:advancedGenerate', request),
  runBenchmark: (request) => ipcRenderer.invoke('benchmark:run', request),
  onBenchmarkProgress: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('benchmark:progress', listener);
    return () => ipcRenderer.removeListener('benchmark:progress', listener);
  },
  onPullProgress: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('ollama:pullProgress', listener);
    return () => ipcRenderer.removeListener('ollama:pullProgress', listener);
  },
  sendChat: (request) => ipcRenderer.invoke('chat:send', request),
  getLogs: (limit) => ipcRenderer.invoke('logs:list', limit),
  appendLog: (entry) => ipcRenderer.invoke('logs:append', entry),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  openLogsFolder: () => ipcRenderer.invoke('logs:openFolder'),
  checkForUpdates: (channel) => ipcRenderer.invoke('app:checkForUpdates', channel),
  openUpdatePage: (channel, url) => ipcRenderer.invoke('app:openUpdatePage', channel, url),
  closeApp: () => ipcRenderer.invoke('app:closeReady'),
  cancelCloseApp: () => ipcRenderer.invoke('app:closeCanceled'),
  onAppCloseRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:closeRequested', listener);
    return () => ipcRenderer.removeListener('app:closeRequested', listener);
  },
  syncScores: (scores) => ipcRenderer.invoke('scores:sync', scores),
  openChatApp: () => ipcRenderer.invoke('app:openChatApp'),
  checkAutoUpdate: () => ipcRenderer.invoke('app:checkAutoUpdate'),
  downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
  onUpdaterStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('updater:status', listener);
    return () => ipcRenderer.removeListener('updater:status', listener);
  },
  startOllamaInstall: () => ipcRenderer.invoke('ollama:startInstall'),
  launchOllamaInstaller: (installerPath) => ipcRenderer.invoke('ollama:launchInstaller', installerPath),
  onOllamaInstallProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('ollama:installProgress', listener);
    return () => ipcRenderer.removeListener('ollama:installProgress', listener);
  },
};

contextBridge.exposeInMainWorld('agentArcade', api);
