const { app, BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('path');
const http = require('http');
const { getConfig, saveConfig } = require('./config');
const { streamChat } = require('./openrouter');

// 桌宠的人设（发给 AI 的系统提示）
const SYSTEM_PROMPT = '你是一只名叫 Zoro 的桌面宠物，性格活泼友好。用简短、口语化的中文回复，别太长。';
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324';   // 没填模型时用这个（实测可用、中文好）

const WIN_SIZE = 160;

// ===== 可调参数 =====
const WALK_SPEED = 3;       // 每一步移动多少像素（越大走越快）
const STEP_MS = 20;         // 多久走一步（毫秒）
const IDLE_MIN_MS = 20000;  // 待机最短时间（默认基本不动，偶尔才走）
const IDLE_MAX_MS = 60000;  // 待机最长时间
const WALK_MIN_DIST = 80;   // 单次走动最短距离
const WALK_MAX_DIST = 220;  // 单次走动最长距离

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
let chatWin = null;
let settingsWin = null;
let chatAbort = null;

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

// ——— 偶尔走动一下：走到附近一个随机位置就停下，不再走回去 ———
function startWalk() {
  const dir = Math.random() < 0.5 ? -1 : 1;   // -1 左, +1 右
  const dist = randInt(WALK_MIN_DIST, WALK_MAX_DIST);
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - WIN_SIZE;
  const target = clamp(startX + dir * dist, minX, maxX);
  walkTo(target, () => {
    startX = target;   // 新位置当作新的待机点，停在这儿
    goIdle();
  });
}

// ——— 走到某个 x，到达后执行 done ———
function walkTo(targetX, done) {
  const [curX] = win.getPosition();
  const dir = targetX >= curX ? 1 : -1;
  sendAnim('walk', 'right');   // 正面角色，始终正着走，不做镜像翻转

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

function setBubbleText(text) {
  if (!bubbleWin || bubbleWin.isDestroyed()) return;
  bubbleWin.webContents
    .executeJavaScript(`window.setBubble && window.setBubble(${JSON.stringify(text)})`)
    .catch(() => {});
}

// 显示气泡；autoHideMs 为 null 则一直显示，直到状态变化
function showBubble(text, autoHideMs) {
  if (!bubbleWin) return;
  setBubbleText(text);
  positionBubble();
  bubbleWin.showInactive();

  if (bubbleFollowTimer) clearInterval(bubbleFollowTimer);
  bubbleFollowTimer = setInterval(positionBubble, 16);   // 跟随桌宠

  if (bubbleHideTimer) { clearTimeout(bubbleHideTimer); bubbleHideTimer = null; }
  if (autoHideMs) bubbleHideTimer = setTimeout(hideBubble, autoHideMs);
}

function hideBubble() {
  if (bubbleHideTimer) { clearTimeout(bubbleHideTimer); bubbleHideTimer = null; }
  if (bubbleFollowTimer) { clearInterval(bubbleFollowTimer); bubbleFollowTimer = null; }
  if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.hide();
}

// ——— 打招呼：气泡出现 2.5 秒 ———
function greet() {
  showBubble('你好呀', 2500);
}

// ===== 感知 Claude Code 工作状态 =====
let doneTimer = null;

function handleState(state) {
  if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
  switch (state) {
    case 'working':
      showBubble('工作中…', null);       // 一直显示，直到状态变化
      break;
    case 'waiting':
      showBubble('等你操作', null);
      break;
    case 'done':
      celebrateDone();
      break;
    case 'clear':
    default:
      hideBubble();
      break;
  }
}

// 完成：弹「搞定了」+ 播一段欢呼动画，然后回到待机
function celebrateDone() {
  if (paused) { showBubble('搞定了！', 4000); return; }
  stopAuto();
  showBubble('搞定了！', 4000);
  sendAnim('cheer', 'right');
  doneTimer = setTimeout(() => {
    doneTimer = null;
    if (!paused) goIdle();        // 欢呼完回到待机
  }, 2600);
}

// 本地小服务器：Claude Code 的 hook 会 curl 它来报告状态
const STATE_PORT = 38473;
function startStateServer() {
  const server = http.createServer((req, res) => {
    let state = '';
    try { state = new URL(req.url, 'http://localhost').searchParams.get('s') || ''; } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    if (state) handleState(state);
  });
  server.on('error', (e) => console.log('[状态服务器]', e.message));   // 端口占用等，不致命
  server.listen(STATE_PORT, '127.0.0.1');
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

// ——— 聊天窗口 ———
function openChat() {
  if (chatWin && !chatWin.isDestroyed()) {   // 已开就聚焦，不重复开
    chatWin.show();
    chatWin.focus();
    return;
  }
  chatWin = new BrowserWindow({
    width: 360,
    height: 540,
    minWidth: 300,
    minHeight: 400,
    title: '和 Zoro 聊天',
    titleBarStyle: 'hiddenInset',   // 保留原生红绿灯按钮，隐藏标题栏，自定义内容
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  chatWin.loadFile('chat.html');
  chatWin.on('closed', () => {
    if (chatAbort) { chatAbort.abort(); chatAbort = null; }   // 关窗就取消进行中的请求
    chatWin = null;
  });
}

// ——— 设置窗口 ———
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 420,
    height: 320,
    resizable: false,
    title: '设置',
    titleBarStyle: 'hiddenInset',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  settingsWin.loadFile('settings.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ——— 把消息发给聊天窗口 ———
function sendToChat(channel, payload) {
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send(channel, payload);
}

// ——— 请求 OpenRouter，流式把回复转发给聊天窗口 ———
async function handleChatSend(userMessages) {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    sendToChat('chat:error', { code: 'NO_KEY', message: '还没有配置 API Key' });
    return;
  }

  if (chatAbort) chatAbort.abort();          // 取消上一条还没结束的请求
  chatAbort = new AbortController();

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...userMessages];
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';

  try {
    await streamChat({
      url,
      apiKey: cfg.apiKey,
      model: cfg.model || DEFAULT_MODEL,   // 没填就用默认模型
      messages,
      signal: chatAbort.signal,
      onDelta: (delta) => sendToChat('chat:delta', delta),
    });
    sendToChat('chat:done');
  } catch (e) {
    if (e.name === 'AbortError') return;       // 主动取消，不报错
    if (e.status) {
      sendToChat('chat:error', { message: `请求失败（${e.status}）：${String(e.detail).slice(0, 300)}` });
    } else {
      sendToChat('chat:error', { message: '网络错误：' + e.message });
    }
  }
}

// ——— 原生右键菜单 ———
function showContextMenu() {
  const template = [
    { label: '聊天', click: () => openChat() },
    { label: '打招呼', click: () => greet() },
    { label: paused ? '继续' : '暂停', click: () => setPaused(!paused) },
    { type: 'separator' },
    { label: '设置…', click: () => openSettings() },
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

  // 设置
  ipcMain.on('open-settings', () => openSettings());
  ipcMain.handle('settings:get', () => getConfig());
  ipcMain.handle('settings:save', (_e, cfg) => {
    saveConfig(cfg);
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('config-updated');
    return true;
  });

  // 聊天
  ipcMain.handle('chat:has-key', () => !!getConfig().apiKey);
  ipcMain.on('chat:send', (_e, messages) => handleChatSend(messages));
}

app.whenReady().then(() => {
  registerIpc();
  startStateServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
