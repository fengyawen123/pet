#!/bin/bash
# 桌宠启动脚本 —— 双击或在终端运行 ./start.sh 即可
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node-v22.14.0-darwin-arm64/bin:$PATH"
unset ELECTRON_RUN_AS_NODE
exec "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" .
