// 本地配置读写：存在 userData 目录，天然在 Git 仓库之外，不会被提交。
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = {
  apiKey: '',
  model: 'deepseek/deepseek-chat-v3-0324',
  baseUrl: 'https://openrouter.ai/api/v1',
};

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function getConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULTS };   // 没有文件 / 读不动就用默认
  }
}

function saveConfig(patch) {
  const merged = { ...getConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = { getConfig, saveConfig, configPath, DEFAULTS };
