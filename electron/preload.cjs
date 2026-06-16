const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentBridge', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  selectAiFile: () => ipcRenderer.invoke('dialog:select-ai-file'),
  selectFontFile: () => ipcRenderer.invoke('dialog:select-font-file'),
  getFileInfo: (path) => ipcRenderer.invoke('file:info', path),
  runSystemCheck: () => ipcRenderer.invoke('system:check'),
  verifyLicense: (payload) => ipcRenderer.invoke('license:verify', payload),
  redeemPoints: (payload) => ipcRenderer.invoke('points:redeem', payload),
  consumePoints: (payload) => ipcRenderer.invoke('points:consume', payload),
  refundPoints: (payload) => ipcRenderer.invoke('points:refund', payload),
  runTask: (payload) => ipcRenderer.invoke('task:run', payload),
  onTaskProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('task:progress', listener);
    return () => ipcRenderer.removeListener('task:progress', listener);
  },
  openPath: (path) => ipcRenderer.invoke('shell:open-path', path),
  revealPath: (path) => ipcRenderer.invoke('shell:reveal-path', path),
});
