@echo off
chcp 65001 >nul
cd /d "%~dp0"

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [x] This folder is not a git repo.
  pause
  exit /b 1
)

echo ============================================================
echo   Sync to GitHub
echo ============================================================
echo.

git status --short
echo.

git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo [i] Nothing new to commit.
  goto :dopush
)

set "MSG="
set /p MSG="What did you change? (press Enter to skip): "
if "%MSG%"=="" set "MSG=update"

git commit -m "%MSG%"

:dopush
echo.
echo [i] Pushing...
git push
echo.

if errorlevel 1 (
  echo [x] Push failed. Check network or login.
) else (
  echo [v] Synced to GitHub.
)
echo.
pause
