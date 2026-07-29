@echo off
setlocal
echo.
echo Tip: Prefer Docker?  Run:  docker compose up -d --build
echo      Then open http://localhost:3847
echo.

set "PATH=%LOCALAPPDATA%\Temp\opencode\node\node-v22.14.0-win-x64;%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found.
  echo Install Node from https://nodejs.org/  OR  use Docker: docker compose up -d --build
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

echo Building frontend...
pushd client
call npm.cmd run build
popd

echo.
echo Starting MTG Collector (production)...
echo Open on this PC or phone using the Network URL printed below.
echo.

pushd server
call npm.cmd start
popd
