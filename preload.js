const { contextBridge, ipcRenderer } = require('electron');

// 把主进程发来的「该播哪个动画」消息，安全地暴露给网页
contextBridge.exposeInMainWorld('pet', {
  onAnim: (callback) => {
    ipcRenderer.on('anim', (_event, data) => callback(data));
  },
});
