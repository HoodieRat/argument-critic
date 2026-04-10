@echo off
setlocal

cd /d "%~dp0"
title Argument Critic Install

call :resolve_node
if not defined NODE_EXE goto :install_node

call :read_node_major
if not defined NODE_MAJOR goto :node_version_failed
if %NODE_MAJOR% LSS 22 goto :upgrade_node
goto :after_node

:install_node
echo Node.js 22 or newer was not found.
echo Installing Node.js LTS with winget...
call :ensure_winget
if errorlevel 1 exit /b 1
call winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent
if errorlevel 1 goto :node_install_failed
call :refresh_node_path
call :resolve_node
if not defined NODE_EXE goto :node_install_failed
call :read_node_major
if not defined NODE_MAJOR goto :node_version_failed
if %NODE_MAJOR% LSS 22 goto :node_version_failed
goto :after_node

:upgrade_node
echo Node.js %NODE_MAJOR% was detected.
echo Upgrading to Node.js LTS with winget...
call :ensure_winget
if errorlevel 1 exit /b 1
call winget upgrade --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent
if errorlevel 1 goto :node_version_failed
call :refresh_node_path
call :resolve_node
call :read_node_major
if not defined NODE_MAJOR goto :node_version_failed
if %NODE_MAJOR% LSS 22 goto :node_version_failed

:after_node
echo [1/4] Enabling Corepack...
call corepack enable >nul 2>nul
call corepack pnpm --version >nul 2>nul
if errorlevel 1 goto :corepack_failed

echo [2/4] Installing project dependencies...
call corepack pnpm install
if errorlevel 1 goto :install_failed

echo [3/4] Preparing local project folders...
call corepack pnpm run app:setup
if errorlevel 1 goto :setup_failed

echo [4/4] Prebuilding the app for fast starts...
call corepack pnpm build
if errorlevel 1 goto :build_failed

echo.
echo Argument Critic is installed and ready.
echo Open Start Argument Critic.cmd whenever you want to run the app.
echo Open Settings in the app and choose Sign in with GitHub after startup.
pause
exit /b 0

:resolve_node
set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if defined NODE_EXE goto :eof
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if defined NODE_EXE goto :eof
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
goto :eof

:refresh_node_path
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
goto :eof

:read_node_major
set "NODE_MAJOR="
if not defined NODE_EXE goto :eof
for %%I in ("%NODE_EXE%") do set "PATH=%%~dpI;%PATH%"
for /f %%I in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%I
goto :eof

:ensure_winget
where winget >nul 2>nul
if errorlevel 1 (
  echo winget is not available, so Node.js could not be installed automatically.
  echo Install Node.js LTS from https://nodejs.org/ and then run this file again.
  pause
  exit /b 1
)
goto :eof

:node_install_failed
echo Automatic Node.js installation failed.
echo Install Node.js LTS from https://nodejs.org/ and then run this file again.
pause
exit /b 1

:node_version_failed
echo Node.js 22 or newer is required.
echo Update Node.js to the current LTS release and then run this file again.
pause
exit /b 1

:corepack_failed
echo Corepack could not start pnpm from this Node.js installation.
echo Reinstall or repair Node.js 22+, then run this file again.
pause
exit /b 1

:install_failed
echo.
echo Dependency installation failed.
echo Fix the error shown above, then run this file again.
pause
exit /b 1

:setup_failed
echo.
echo Project setup failed.
echo Fix the error shown above, then run this file again.
pause
exit /b 1

:build_failed
echo.
echo The app build failed.
echo Fix the error shown above, then run this file again.
pause
exit /b 1