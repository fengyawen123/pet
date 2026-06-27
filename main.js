const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

const WIN_SIZE = 160;

// ===== 可调参数 =====
const WALK_SPEED = 3;       // 每一步移动多少像素（越大走越快）
const STEP_MS = 20;         // 多久走一步（毫秒）
const IDLE_MIN_MS = 3000;   // 待机最短时间
const IDLE_MAX_MS = 8000;   // 待机最长时间
const WALK_MIN_DIST = 120;  // 单次外出最短距离
const WALK_MAX_DIST = 350;  // 单次外出最长距离

let win;
let startX = 0, startY = 0;   // 起始位置（待机点）
let workArea;                 // 屏幕可用区域

let idleTimer = null;
let moveTimer = null;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function sendAnim(action, facing) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('anim', { action, facing });
  }
}

// ——— 待机 ———
function goIdle() {
  if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
  sendAnim('scratch', null);            // 待机播 scratch，朝向保持不变
  const delay = randInt(IDLE_MIN_MS, IDLE_MAX_MS);
  idleTimer = setTimeout(startWalk, delay);
}

// ——— 决定外出 ———
function startWalk() {
  const dir = Math.random() < 0.5 ? -1 : 1;   // -1 左, +1 右
  const dist = randInt(WALK_MIN_DIST, WALK_MAX_DIST);
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - WIN_SIZE;
  const target = clamp(startX + dir * dist, minX, maxX);
  // 先走到外面，到了再走回起点
  walkTo(target, () => walkTo(startX, goIdle));
}

// ——— 走到某个 x，到达后执行 done ———
function walkTo(targetX, done) {
  const [curX] = win.getPosition();
  const dir = targetX >= curX ? 1 : -1;
  sendAnim('walk', dir === 1 ? 'right' : 'left');

  if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
  moveTimer = setInterval(() => {
    const [x, y] = win.getPosition();
    if (Math.abs(targetX - x) <= WALK_SPEED) {
      win.setPosition(targetX, y);
      clearInterval(moveTimer); moveTimer = null;
      done();
    } else {
      win.setPosition(x + dir * WALK_SPEED, y);
    }
  }, STEP_MS);
}

function createWindow() {
  workArea = screen.getPrimaryDisplay().workArea;
  // 起始位置：水平居中，靠近屏幕底部
  startX = Math.round(workArea.x + workArea.width / 2 - WIN_SIZE / 2);
  startY = Math.round(workArea.y + workArea.height - WIN_SIZE - 40);

  win = new BrowserWindow({
    width: WIN_SIZE,
    height: WIN_SIZE,
    x: startX,
    y: startY,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');

  // 页面加载完再启动状态机，确保能收到动画消息
  win.webContents.once('did-finish-load', () => {
    goIdle();
  });
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
