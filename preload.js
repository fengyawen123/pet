const { contextBridge, ipcRenderer } = require('electron');

// 桌宠窗口用
contextBridge.exposeInMainWorld('pet', {
  onAnim: (callback) => {
    ipcRenderer.on('anim', (_event, data) => callback(data));
  },
  onSetPaused: (callback) => {
    ipcRenderer.on('set-paused', (_event, paused) => callback(paused));
  },
  setInteractive: (interactive) => ipcRenderer.send('set-interactive', interactive),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  showMenu: () => ipcRenderer.send('show-context-menu'),
});

// 聊天窗口用
contextBridge.exposeInMainWorld('chatApi', {
  hasKey: () => ipcRenderer.invoke('chat:has-key'),
  send: (messages) => ipcRenderer.send('chat:send', messages),
  onDelta: (cb) => ipcRenderer.on('chat:delta', (_e, text) => cb(text)),
  onDone: (cb) => ipcRenderer.on('chat:done', () => cb()),
  onError: (cb) => ipcRenderer.on('chat:error', (_e, payload) => cb(payload)),
  onConfigUpdated: (cb) => ipcRenderer.on('config-updated', () => cb()),
  openSettings: () => ipcRenderer.send('open-settings'),
});

// 设置窗口用
contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (cfg) => ipcRenderer.invoke('settings:save', cfg),
});
