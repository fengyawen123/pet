const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  // 主进程 -> 渲染层：该播哪个动画
  onAnim: (callback) => {
    ipcRenderer.on('anim', (_event, data) => callback(data));
  },
  // 主进程 -> 渲染层：暂停 / 继续动画
  onSetPaused: (callback) => {
    ipcRenderer.on('set-paused', (_event, paused) => callback(paused));
  },
  // 渲染层 -> 主进程：光标是否压在身体上（true=可交互，false=穿透到桌面）
  setInteractive: (interactive) => ipcRenderer.send('set-interactive', interactive),
  // 渲染层 -> 主进程：开始 / 结束拖动
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  // 渲染层 -> 主进程：在身体上右键，弹出原生菜单
  showMenu: () => ipcRenderer.send('show-context-menu'),
});
