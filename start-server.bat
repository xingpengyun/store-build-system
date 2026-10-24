@echo off
cd /d "%~dp0"
chcp 65001 >nul 2>nul
title Store Build System - local server
set PORT=8765

rem pass "nobrowser" as the first argument to skip opening a browser window
set BROWSER=-NoBrowser
if /i not "%~1"=="nobrowser" set BROWSER=

echo.
echo  ==================================================
echo   Store Build System  ^|  local server
echo  ==================================================
echo.

rem ---------- 1) python ----------
where python >nul 2>nul
if not errorlevel 1 (
  echo  [1/4] python found - starting HTTP server on port %PORT%
  start "" "http://127.0.0.1:%PORT%/"
  python -m http.server %PORT% --bind 127.0.0.1
  goto finish
)

rem ---------- 2) py launcher ----------
where py >nul 2>nul
if not errorlevel 1 (
  echo  [2/4] py launcher found - starting HTTP server on port %PORT%
  start "" "http://127.0.0.1:%PORT%/"
  py -m http.server %PORT% --bind 127.0.0.1
  goto finish
)

rem ---------- 3) node ----------
where node >nul 2>nul
if not errorlevel 1 (
  echo  [3/4] node found - starting HTTP server on port %PORT%
  start "" "http://127.0.0.1:%PORT%/"
  node -e "const h=require('http'),f=require('fs'),p=require('path'),u=require('url');const t={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};h.createServer((q,s)=>{let r=decodeURIComponent(u.parse(q.url).pathname);if(r==='/'||r==='')r='/index.html';const fp=p.join(process.cwd(),r);f.readFile(fp,(e,d)=>{if(e){s.writeHead(404,{'Content-Type':'text/plain'});return s.end('404')}s.writeHead(200,{'Content-Type':t[p.extname(fp).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});s.end(d)})}).listen(%PORT%,'127.0.0.1',()=>console.log('listening on http://127.0.0.1:%PORT%/'))"
  goto finish
)

rem ---------- 4) built-in PowerShell server (no dependency at all) ----------
echo  [4/4] python / node not found - using built-in PowerShell server
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port %PORT% %BROWSER%
if errorlevel 2 (
  echo.
  echo  [X] The local server could not start on this machine.
  echo      Opening index.html directly instead.
  echo      It still works - data is saved in this browser.
  start "" "%~dp0index.html"
)

:finish
echo.
echo  Server stopped.
pause
