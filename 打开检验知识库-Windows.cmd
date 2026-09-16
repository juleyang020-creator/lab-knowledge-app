@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 goto folder_error
where node >nul 2>nul
if errorlevel 1 goto missing_node
node scripts\launch.mjs
set "result=%errorlevel%"
popd
if not "%result%"=="0" goto failed
exit /b 0

:missing_node
echo 未找到 Node.js。请先安装 Node.js 22.x（不低于22.23.1），然后重新双击。
echo 下载：https://nodejs.org/download/release/latest-v22.x/
echo 安装时保留“Add to PATH”，安装后重新打开此入口。
popd
goto failed

:folder_error
echo 无法进入项目文件夹。请将整个项目解压到本机磁盘，再运行入口。

:failed
echo 请查看上方提示及本文件夹中的“打开软件说明.md”。
pause
exit /b 1
