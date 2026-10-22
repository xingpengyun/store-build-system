@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8765

echo Starting local server on http://127.0.0.1:%PORT% ...
echo Keep this window open. Press Ctrl+C to stop.
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:%PORT%/
  python -m http.server %PORT%
  exit /b
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:%PORT%/
  py -m http.server %PORT%
  exit /b
)

echo [!] Python not found. Opening index.html directly...
echo [!] If data cannot be saved, install Python and run this file again.
start "" "index.html"
