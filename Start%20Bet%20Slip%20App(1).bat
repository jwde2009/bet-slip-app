@echo off
setlocal
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
  echo ERROR: npm was not found.
  echo Make sure Node.js is installed and then try again.
  pause
  exit /b 1
)

if not exist package.json (
  echo ERROR: package.json was not found.
  echo Put this .bat file inside the bet-slip-app folder.
  pause
  exit /b 1
)

if not exist node_modules (
  echo node_modules was not found.
  echo Installing dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo Opening the app in your browser shortly...
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:3000"

echo.
echo Starting Next.js development server...
echo Leave this window open while using the app.
echo Press Ctrl+C to stop the app.
echo.

call npm run dev

set "APP_EXIT=%errorlevel%"
echo.
if not "%APP_EXIT%"=="0" (
  echo The Bet Slip App stopped with an error.
) else (
  echo The Bet Slip App has stopped.
)

pause
exit /b %APP_EXIT%
