@echo off
setlocal

cd /d "%~dp0"
title Argument Critic

where node >nul 2>nul
if errorlevel 1 goto :missing_node

for /f %%I in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%I
if not defined NODE_MAJOR goto :bad_node
if %NODE_MAJOR% LSS 22 goto :bad_node

call corepack pnpm --version >nul 2>nul
if errorlevel 1 goto :missing_corepack

if not exist "node_modules" goto :missing_install
if not exist "apps\desktop\dist\electron\main.js" goto :missing_install
if not exist "apps\desktop\dist\renderer\index.html" goto :missing_install

echo [1/1] Starting Argument Critic...
echo Leave this window open while the app is running.
echo To stop the app, press Ctrl+C here or use Exit app in the desktop drawer.
echo.
call corepack pnpm start
if errorlevel 1 goto :start_failed
goto :eof

:missing_node
echo Node.js 22 or newer is required to run Argument Critic.
echo Install it from https://nodejs.org/ and then run this file again.
pause
exit /b 1

:bad_node
echo Node.js 22 or newer is required to run Argument Critic.
echo The current version is too old. Install the current LTS release from https://nodejs.org/ and try again.
pause
exit /b 1

:missing_corepack
echo Corepack could not start pnpm from this Node.js installation.
echo Reinstall Node.js 22+ from https://nodejs.org/, reopen this folder, and run this file again.
pause
exit /b 1

:missing_install
echo.
echo Argument Critic has not been installed yet, or the desktop build output is missing.
echo Run Install Argument Critic.cmd once from this folder, then start the app again.
pause
exit /b 1

:start_failed
echo.
echo Argument Critic stopped with an error during startup.
echo Review the messages above, fix the reported issue, and run this file again.
pause
exit /b 1