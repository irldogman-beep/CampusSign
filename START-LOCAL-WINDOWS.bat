@echo off
setlocal
cd /d "%~dp0"
title CampusSign - Local Development

echo ==========================================
echo          CampusSign Local Setup
echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 LTS or newer from https://nodejs.org/
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 20) process.exit(1)"
if errorlevel 1 (
  echo CampusSign requires Node.js 20 or newer. Please update Node.js.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm included.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo Installing project dependencies. An internet connection is required...
  call npm install
  if errorlevel 1 goto failed
)
echo.
echo Starting CampusSign. Keep this window open while using the local site.
echo Press Ctrl+C to stop the local development server.
echo.
call npm run dev
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Setup failed. Check the error above and read USB-SETUP-GUIDE.md.
pause
exit /b 1
