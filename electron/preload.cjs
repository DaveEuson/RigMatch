const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getSystemProfile: () => ipcRenderer.invoke('system:getProfile'),
  getOllamaStatus: (baseUrl) => ipcRenderer.invoke('ollama:getStatus', baseUrl),
  getOllamaCatalog: () => ipcRenderer.invoke('ollama:getCatalog'),
  openOllamaDownload: () => ipcRenderer.invoke('ollama:openDownload'),
  scanLan: () => ipcRenderer.invoke('network:scanLan'),
  addHostByAddress: (address) => ipcRenderer.invoke('network:addHostByAddress', address),
  pullModel: (request) => ipcRenderer.invoke('ollama:pullModel', request),
  deleteModel: (request) => ipcRenderer.invoke('ollama:deleteModel', request),
  runBenchmark: (request) => ipcRenderer.invoke('benchmark:run', request),
  sendChat: (request) => ipcRenderer.invoke('chat:send', request),
  getLogs: (limit) => ipcRenderer.invoke('logs:list', limit),
  appendLog: (entry) => ipcRenderer.invoke('logs:append', entry),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  openLogsFolder: () => ipcRenderer.invoke('logs:openFolder'),
};

contextBridge.exposeInMainWorld('agentArcade', api);
