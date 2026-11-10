@echo off
setlocal
cd /d "%~dp0"
title CampusSign - Production Build

echo ==========================================
echo       CampusSign Production Build
echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20 or newer from https://nodejs.org/
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)"
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo Installing dependencies. An internet connection is required...
  call npm install
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
echo.
echo Build complete. Production files are in the dist folder.
pause
exit /b 0
:failed
echo.
echo Build failed. Check the error above.
pause
exit /b 1
