@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ---------- locate git (PATH may not have it) ----------
set "GIT="
where git >nul 2>nul
if not errorlevel 1 set "GIT=git"
if not defined GIT if exist "C:\Program Files\Git\cmd\git.exe" set "GIT=C:\Program Files\Git\cmd\git.exe"
if not defined GIT if exist "C:\Program Files (x86)\Git\cmd\git.exe" set "GIT=C:\Program Files (x86)\Git\cmd\git.exe"
if not defined GIT (
  for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\PortableGit\versions\*") do (
    if exist "%%d\mingw64\bin\git.exe" set "GIT=%%d\mingw64\bin\git.exe"
  )
)
if not defined GIT (
  echo [x] git not found.
  echo     Install Git for Windows: https://git-scm.com/download/win
  pause
  exit /b 1
)

echo ============================================================
echo   Push this project to GitHub
echo ============================================================
echo.
echo   Create an EMPTY repo on github.com first (no README, no .gitignore).
echo   Then paste its URL below.
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

"%GIT%" rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [i] Initializing repo...
  "%GIT%" init -b main
  "%GIT%" add -A
  "%GIT%" commit -m "feat: initial commit"
)

"%GIT%" branch -M main
"%GIT%" remote remove origin >nul 2>nul
"%GIT%" remote add origin "%REPO%"

echo.
echo [i] Pushing... a browser window may pop up for GitHub login.
echo.
"%GIT%" push -u origin main

if errorlevel 1 (
  echo.
  echo [x] Push failed.
  echo     - Wrong URL, or repo not empty
  echo     - Or login was not completed, run this file again
  pause
  exit /b 1
)

echo.
echo [v] Done. Your code is on GitHub.
echo.
echo Next: repo page - Settings - Pages - Source "Deploy from a branch"
echo       - Branch main / root - Save.
echo.
pause
