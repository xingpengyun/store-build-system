@echo off
rem ============================================================
rem  本地预览（禁缓存）—— 双击就能开网页
rem  端口 8766；按 python(托管) → python → py → node 的顺序找运行时
rem  关掉这个黑窗口 = 服务停止
rem  加参数 nobrowser 可以不自动开浏览器：serve-preview.bat nobrowser
rem ============================================================
cd /d "%~dp0"
chcp 65001 >nul 2>nul
title Store Build System - preview 8766
set PORT=8766
set OPEN=1
if /i "%~1"=="nobrowser" set OPEN=0

set "MPY=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if exist "%MPY%" (
  echo  [1/4] managed python
  if "%OPEN%"=="1" start "" "http://127.0.0.1:%PORT%/index.html"
  "%MPY%" ".workbuddy\serve-nocache.py" %PORT%
  goto finish
)

where python >nul 2>nul
if not errorlevel 1 (
  echo  [2/4] python
  if "%OPEN%"=="1" start "" "http://127.0.0.1:%PORT%/index.html"
  python ".workbuddy\serve-nocache.py" %PORT%
  goto finish
)

where py >nul 2>nul
if not errorlevel 1 (
  echo  [3/4] py launcher
  if "%OPEN%"=="1" start "" "http://127.0.0.1:%PORT%/index.html"
  py ".workbuddy\serve-nocache.py" %PORT%
  goto finish
)

where node >nul 2>nul
if not errorlevel 1 (
  echo  [4/4] node  ^(no-store^)
  if "%OPEN%"=="1" start "" "http://127.0.0.1:%PORT%/index.html"
  node -e "const h=require('http'),f=require('fs'),p=require('path'),u=require('url');const t={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};h.createServer((q,s)=>{let r=decodeURIComponent(u.parse(q.url).pathname);if(r==='/'||r==='')r='/index.html';const fp=p.join(process.cwd(),r);f.readFile(fp,(e,d)=>{if(e){s.writeHead(404,{'Content-Type':'text/plain'});return s.end('404')}s.writeHead(200,{'Content-Type':t[p.extname(fp).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});s.end(d)})}).listen(%PORT%,'127.0.0.1',()=>console.log('http://127.0.0.1:%PORT%/'))"
  goto finish
)

echo  [X] python / py / node 都没找到，只能直接开文件
if "%OPEN%"=="1" start "" "index.html"

:finish
echo  Server stopped.
pause
