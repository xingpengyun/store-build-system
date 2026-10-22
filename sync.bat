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

"%GIT%" rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [x] This folder is not a git repo.
  pause
  exit /b 1
)

echo ============================================================
echo   Sync to GitHub
echo ============================================================
echo.

"%GIT%" status --short
echo.

"%GIT%" add -A
"%GIT%" diff --cached --quiet
if not errorlevel 1 (
  echo [i] Nothing new to commit.
  goto :dopush
)

set "MSG="
set /p MSG="What did you change? (press Enter to skip): "
if "%MSG%"=="" set "MSG=update"

"%GIT%" commit -m "%MSG%"

:dopush
echo.
echo [i] Pushing...
"%GIT%" push
echo.

if errorlevel 1 (
  echo [x] Push failed. Check network or login.
  echo     Run push-to-github.bat to re-authorize.
) else (
  echo [v] Synced to GitHub.
)
echo.
pause
