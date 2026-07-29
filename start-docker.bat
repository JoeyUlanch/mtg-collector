@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker is not installed or not on PATH.
  echo Install Docker Desktop: https://docs.docker.com/get-docker/
  pause
  exit /b 1
)

echo Building and starting MTG Collector...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo Failed to start. Is Docker Desktop running?
  pause
  exit /b 1
)

echo.
echo MTG Collector is up.
echo   This PC:  http://localhost:3847
echo   Phone:    http://YOUR-PC-IP:3847  (same Wi-Fi)
echo.
echo Logs:    docker compose logs -f
echo Stop:    docker compose down
echo Guide:   docs\DOCKER.md
echo.
pause
