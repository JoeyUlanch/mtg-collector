@echo off
setlocal
set "PATH=%LOCALAPPDATA%\Temp\opencode\node\node-v22.14.0-win-x64;%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install from https://nodejs.org/ then re-run this script.
  pause
  exit /b 1
)

cd /d "%~dp0"

if not exist "node_modules\" call npm.cmd install
if not exist "server\node_modules\" (
  pushd server
  call npm.cmd install
  popd
)
if not exist "client\node_modules\" (
  pushd client
  call npm.cmd install
  popd
)

echo.
echo Starting MTG Collector...
echo   PC:    http://localhost:5173
echo   Phone: use your PC's Wi-Fi IP on port 5173 (shown below / in Settings)
echo.

call npm.cmd run dev
