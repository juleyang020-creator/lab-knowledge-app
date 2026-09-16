#!/bin/bash
# Finder does not inherit the interactive shell's PATH.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd -- "$(dirname -- "${BASH_SOURCE[0]}")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  printf '\n未找到 Node.js。请先安装 Node.js 22.x（不低于22.23.1），然后重新双击。\n'
  printf '下载：https://nodejs.org/download/release/latest-v22.x/\n'
  printf '详细说明在本文件夹的“打开软件说明.md”。\n'
  if [ -t 0 ]; then read -r -p '按回车关闭窗口…'; fi
  exit 1
fi

node scripts/launch.mjs "$@"
result=$?
if [ "$result" -ne 0 ] && [ -t 0 ]; then
  read -r -p '启动未完成。请查看上方提示；按回车关闭窗口…'
fi
exit "$result"
