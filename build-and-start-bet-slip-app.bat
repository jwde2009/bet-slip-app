@echo off
setlocal

cd /d "%~dp0"

echo.
echo ========================================
echo Building Bet Slip App...
echo ========================================
echo.

call npm run build

if errorlevel 1 (
    echo.
    echo ========================================
    echo BUILD FAILED
    echo Fix the error above, then run this file again.
    echo ========================================
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build succeeded. Starting app...
echo Open http://localhost:3000
echo Press Ctrl+C to stop the server.
echo ========================================
echo.

call npm start

endlocal
