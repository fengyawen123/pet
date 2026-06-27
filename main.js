const { app, BrowserWindow, screen, ipcMain, Menu } = require('electron');
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
let dragTimer = null;
let dragging = false;
let paused = false;

let bubbleWin = null;
let bubbleFollowTimer = null;
let bubbleHideTimer = null;

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

// ——— 停掉所有自动行为（待机计时 + 走动）———
function stopAuto() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (moveTimer) { clearInterval(moveTimer); moveTimer = null; }
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

// ——— 拖动：按住身体时窗口持续跟随光标 ———
let dragOffset = { x: 0, y: 0 };

function startDrag() {
  dragging = true;
  stopAuto();                          // 拖动时暂停自动走动
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragOffset = { x: cursor.x - wx, y: cursor.y - wy };
  sendAnim('scratch', null);           // 拖动时定住一个动作

  if (dragTimer) clearInterval(dragTimer);
  dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    win.setPosition(p.x - dragOffset.x, p.y - dragOffset.y);
  }, 16);
}

function endDrag() {
  if (!dragging) return;
  dragging = false;
  if (dragTimer) { clearInterval(dragTimer); dragTimer = null; }
  // 把松手处设为新的待机点
  const [wx, wy] = win.getPosition();
  startX = wx;
  startY = wy;
  if (!paused) goIdle();   // 暂停状态下拖完仍保持冻结
}

// ===== 说话气泡（独立小窗口，显示在桌宠上方）=====
const BUBBLE_W = 180;
const BUBBLE_H = 70;

function createBubbleWindow() {
  bubbleWin = new BrowserWindow({
    width: BUBBLE_W,
    height: BUBBLE_H,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
  });
  bubbleWin.setIgnoreMouseEvents(true);   // 纯展示，鼠标穿透
  bubbleWin.loadFile('bubble.html');
}

function positionBubble() {
  if (!win || !bubbleWin) return;
  const [px, py] = win.getPosition();
  const bx = Math.round(px + WIN_SIZE / 2 - BUBBLE_W / 2);
  const by = Math.round(py - BUBBLE_H + 20);   // 在桌宠正上方，略微重叠让尖角对准
  bubbleWin.setPosition(bx, by);
}

// ——— 打招呼：气泡出现 2.5 秒，其间跟随桌宠 ———
function greet() {
  if (!bubbleWin) return;
  positionBubble();
  bubbleWin.showInactive();

  if (bubbleFollowTimer) clearInterval(bubbleFollowTimer);
  bubbleFollowTimer = setInterval(positionBubble, 16);

  if (bubbleHideTimer) clearTimeout(bubbleHideTimer);
  bubbleHideTimer = setTimeout(() => {
    if (bubbleFollowTimer) { clearInterval(bubbleFollowTimer); bubbleFollowTimer = null; }
    if (bubbleWin) bubbleWin.hide();
  }, 2500);
}

// ——— 暂停 / 继续 ———
function setPaused(p) {
  paused = p;
  if (win && !win.isDestroyed()) win.webContents.send('set-paused', p);
  if (p) {
    stopAuto();        // 冻结走动
  } else {
    goIdle();          // 恢复自动行为
  }
}

// ——— 原生右键菜单 ———
function showContextMenu() {
  const template = [
    { label: '打招呼', click: () => greet() },
    { label: paused ? '继续' : '暂停', click: () => setPaused(!paused) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ];
  Menu.buildFromTemplate(template).popup({ window: win });
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
  createBubbleWindow();

  // 默认让鼠标穿透到桌面；forward:true 让渲染层仍能收到移动事件做命中检测
  win.setIgnoreMouseEvents(true, { forward: true });

  // 页面加载完再启动状态机，确保能收到动画消息
  win.webContents.once('did-finish-load', () => {
    goIdle();
  });
}

// ——— 来自渲染层的消息 ———
function registerIpc() {
  // 光标是否压在身体上：在身体上就关掉穿透（可点可拖），离开就恢复穿透
  ipcMain.on('set-interactive', (_e, interactive) => {
    if (win && !win.isDestroyed() && !dragging) {
      win.setIgnoreMouseEvents(!interactive, { forward: true });
    }
  });
  ipcMain.on('drag-start', () => startDrag());
  ipcMain.on('drag-end', () => endDrag());
  ipcMain.on('show-context-menu', () => showContextMenu());
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
