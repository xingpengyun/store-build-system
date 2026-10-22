@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Push this project to GitHub
echo ============================================================
echo.
echo   Step 1: create an EMPTY repo on github.com (no README, no .gitignore)
echo   Step 2: copy its URL, then paste it below
echo.
echo   Example: https://github.com/yourname/shop-build-system.git
echo.
set "REPO="
set /p REPO="Repo URL: "

if "%REPO%"=="" (
  echo.
  echo [x] No URL given. Aborted.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [i] Not a git repo yet, initializing...
  git init -b main
  git add -A
  git commit -m "feat: initial commit"
)

git branch -M main
git remote remove origin >nul 2>nul
git remote add origin "%REPO%"

echo.
echo [i] Pushing... a browser window may pop up for GitHub login.
echo.
git push -u origin main

if errorlevel 1 (
  echo.
  echo [x] Push failed.
  echo     - Check the URL is correct and the repo is empty
  echo     - If login failed, run this file again
  pause
  exit /b 1
)

echo.
echo [v] Done. Your code is on GitHub now.
echo.
echo Next: on the repo page, go to Settings - Pages,
echo       Source = "Deploy from a branch", Branch = main / root, then Save.
echo.
pause
