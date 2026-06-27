const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 160,
    height: 160,
    transparent: true,      // 窗口背景透明
    frame: false,           // 没有标题栏和边框
    resizable: false,
    alwaysOnTop: true,      // 浮在最上层
    hasShadow: false,
    skipTaskbar: true,
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
