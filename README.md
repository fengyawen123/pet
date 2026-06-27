# 桌面宠物 · Desktop Pet

一只悬浮在 macOS 桌面上的像素小宠物：透明背景、可拖动、会自己走动，能接入大模型和你聊天，还能感知 Claude Code 的工作状态并在头顶实时提示。

基于 **Electron** 构建，纯原生 HTML/CSS/JS，无前端框架。

---

## ✨ 功能特性

- 🪟 **透明悬浮窗** — 无边框、置顶、背景透明，像素画质锐利不模糊
- 🚶 **自主行为** — 默认安静定格，偶尔走动一小段或做个小动作（挠痒 / 挥手）
- 🖱️ **拖拽交互** — 按住身体拖到任意位置；点击透明区域会穿透到桌面，不挡操作
- 💬 **AI 聊天** — iMessage 风格聊天窗口，接入 OpenRouter（兼容 OpenAI 接口），流式回复 + 打字机逐字效果
- 🎛️ **原生右键菜单** — 聊天 / 打招呼 / 暂停继续 / 设置 / 退出
- 🤖 **感知 Claude Code 状态** — 通过 Claude Code hooks，在桌宠头顶实时显示「工作中 / 等你操作 / 搞定了」并播放完成动画
- 🎭 **多角色素材** — 内置 8 套像素角色（皮卡丘、索隆、路飞、高达等），可一键切换

## 🧱 技术栈

| 层面 | 选型 |
| --- | --- |
| 桌面框架 | [Electron](https://www.electronjs.org/) 31 |
| 运行时 | Node.js（主进程）|
| 界面 | 原生 HTML / CSS / JavaScript，无框架 |
| 进程通信 | Electron IPC（`preload.js` + `contextBridge`）|
| AI 接口 | [OpenRouter](https://openrouter.ai/)（OpenAI 兼容的流式 Chat Completions）|
| 工作状态联动 | Claude Code Hooks → 本地 HTTP 服务（端口 `38473`）|

动画基于逐帧 PNG 序列（每个动作一组帧），主进程负责行为状态机与窗口移动，渲染层负责播放动画与命中检测。

## 🚀 安装与运行

> 需要本机已安装 [Node.js](https://nodejs.org/)（含 npm）。

```bash
# 1. 克隆
git clone https://github.com/fengyawen123/pet.git
cd pet

# 2. 安装依赖（会下载 Electron）
npm install

# 3. 启动
npm start
```

启动后桌宠会出现在屏幕底部中央。**右键点它的身体**即可打开菜单。

## ⚙️ 配置 AI 聊天

聊天功能需要一个 [OpenRouter](https://openrouter.ai/) 的 API Key。

1. 右键桌宠 → **设置…**
2. 填写：
   - **API Key** — OpenRouter 的密钥（`sk-or-...`）
   - **模型名称** — 默认 `deepseek/deepseek-chat-v3-0324`，可改成任意 OpenRouter 支持的模型
   - **接口地址** — 默认 `https://openrouter.ai/api/v1`
3. 保存后即可在聊天窗口对话。

配置保存在系统用户目录，**不会进入代码仓库**：

```
~/Library/Application Support/desktop-pet/config.json
```

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `apiKey` | OpenRouter API Key | （空，必填）|
| `model` | 模型名称 | `deepseek/deepseek-chat-v3-0324` |
| `baseUrl` | OpenAI 兼容接口地址 | `https://openrouter.ai/api/v1` |

> 想换成 OpenAI、Anthropic 等其它模型，改 `model` 即可；如遇 403，多为该模型在你的 OpenRouter 账号下的访问策略限制。

## 🔌 接入 Claude Code 状态感知（可选）

让桌宠在你使用 [Claude Code](https://claude.com/claude-code) 时自动显示工作状态。

仓库内置了 [`.claude/settings.json`](.claude/settings.json) 与 [`hooks/pet-state.sh`](hooks/pet-state.sh)，通过 Claude Code 的 hooks 在不同阶段通知桌宠：

| Claude Code Hook | 桌宠头顶显示 |
| --- | --- |
| `UserPromptSubmit` | 工作中… |
| `Notification` | 等你操作 |
| `Stop` | 搞定了！（播放欢呼动画）|

原理：hook 触发时运行 `pet-state.sh`，`curl` 桌宠主进程开启的本地服务（`127.0.0.1:38473`）。桌宠未运行时静默失败，不影响 Claude Code。

> 若把 `hooks` 配置移动到 `~/.claude/settings.json`，则对所有项目全局生效。修改 hooks 后需重启 Claude Code 会话。

## 📁 项目结构

```
pet/
├── main.js              # Electron 主进程：窗口、行为状态机、拖拽、菜单、AI 请求、状态服务器
├── preload.js           # 安全暴露给渲染层的 IPC 接口（contextBridge）
├── index.html           # 桌宠本体：逐帧动画播放 + 像素级命中检测
├── chat.html            # 聊天窗口：iMessage 风格 UI + 流式打字机
├── settings.html        # 设置窗口：API Key / 模型 / 接口地址
├── bubble.html          # 头顶气泡（打招呼 / 工作状态提示）
├── config.js            # 本地配置读写（userData/config.json）
├── openrouter.js        # OpenRouter 流式请求与 SSE 解析
├── hooks/
│   └── pet-state.sh     # Claude Code hook 脚本：上报工作状态
├── .claude/
│   └── settings.json    # Claude Code hooks 配置
├── assets/              # 8 套角色的逐帧动画素材（walk/scratch/wave/cheer/roll/...）
│   └── <role>/
│       ├── pet.json
│       ├── spritesheet.webp
│       └── frames/<action>/NN.png
└── package.json
```

## 🎭 切换角色

内置角色：`capvolt`（皮卡丘）、`gardevoir`、`giratina`、`hema-pet`、`little-mao-puppy`、`luffy-2-pet`、`rx-78-2-gundam`、`zoro`。

默认角色为 `zoro`。切换时修改 [`index.html`](index.html) 与 [`chat.html`](chat.html) 顶部的 `character` 常量即可。

## 📐 架构说明

```
┌────────────── 主进程 (main.js) ──────────────┐
│  行为状态机（待机/走动/完成）                  │
│  窗口移动 · 拖拽跟随 · 鼠标穿透切换            │
│  右键原生菜单                                 │
│  OpenRouter 流式请求 (openrouter.js)         │
│  本地状态服务 :38473  ←── Claude Code hooks   │
└───────────────────┬───────────────────────────┘
        IPC (preload.js / contextBridge)
┌───────────────────┴───────────────────────────┐
│  渲染层                                        │
│  index.html  逐帧动画 + 透明像素命中检测        │
│  chat.html   流式打字机聊天                     │
│  settings.html / bubble.html                   │
└────────────────────────────────────────────────┘
```

- **像素级命中检测**：渲染层把当前帧画到离屏 canvas，读取光标处像素透明度，判断是否压在身体上 → 主进程据此切换窗口的鼠标穿透。
- **打字机效果**：主进程流式转发 AI 分块，渲染层用逐字队列按固定间隔吐字。

## 📝 License

MIT
