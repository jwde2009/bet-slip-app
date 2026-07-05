@echo off
cd /d "%~dp0"
title Bet Slip App

echo ==========================================
echo Starting Bet Slip App
echo Folder: %cd%
echo URL: http://localhost:3000
echo ==========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found. Make sure Node.js is installed.
  pause
  exit /b 1
)

if not exist package.json (
  echo ERROR: package.json was not found.
  echo Make sure this .bat file is inside the bet-slip-app folder.
  pause
  exit /b 1
)

if not exist node_modules (
  echo node_modules folder not found. Installing dependencies first...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Opening app in browser shortly...
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:3000"

echo Starting Next.js dev server...
echo Leave this window open while using the app.
echo Press Ctrl+C to stop the app.
echo.

call npm run dev

pause
