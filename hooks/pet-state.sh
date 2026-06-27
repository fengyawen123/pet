#!/bin/bash
# 把 Claude Code 的工作状态报告给桌宠（桌宠开的本地小服务器）。
# 用法：pet-state.sh working|waiting|done|clear
# 桌宠没开着 / 端口没通也没关系，失败静默，绝不影响 Claude Code 本身。
curl -s --max-time 1 "http://127.0.0.1:38473/state?s=$1" >/dev/null 2>&1 || true
