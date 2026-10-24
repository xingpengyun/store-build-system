# ==========================================================
#  serve.ps1 - dependency-free local static server (Windows PowerShell 5.1+)
#  Serves this folder on http://127.0.0.1:<port>/
#  Used by start-server.bat when python / node are not installed.
#  Exit codes: 0 normal stop, 2 cannot listen on any port.
# ==========================================================
param(
  [int]$Port = 8765,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
$root = [System.IO.Path]::GetFullPath($root)

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.mjs'  = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.map'  = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
  '.ttf'  = 'font/ttf'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
}

function Test-PortFree([int]$p) {
  $l = $null
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
    $l.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($l) { try { $l.Stop() } catch {} }
  }
}

$chosen = 0
for ($p = $Port; $p -lt ($Port + 20); $p++) {
  if (Test-PortFree $p) { $chosen = $p; break }
}
if ($chosen -eq 0) {
  Write-Host "[X] No free port in range $Port-$($Port + 19)." -ForegroundColor Red
  exit 2
}

$prefix = "http://127.0.0.1:$chosen/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "[X] Cannot listen on $prefix" -ForegroundColor Red
  Write-Host "    $($_.Exception.Message)" -ForegroundColor DarkGray
  exit 2
}

Write-Host ""
Write-Host "  Store Build System is running" -ForegroundColor Green
Write-Host "  ->  $prefix" -ForegroundColor Cyan
Write-Host "  dir $root" -ForegroundColor DarkGray
Write-Host "  Keep this window open. Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) {
  try { Start-Process $prefix } catch {}
}

$utf8 = [System.Text.Encoding]::UTF8

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
      if ([string]::IsNullOrEmpty($rel) -or $rel -eq '/') { $rel = '/index.html' }

      $full = [System.IO.Path]::GetFullPath((Join-Path $root ($rel.TrimStart('/') -replace '/', '\')))
      if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
      } elseif (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $res.StatusCode = 404
        $res.ContentType = 'text/plain; charset=utf-8'
        $b = $utf8.GetBytes("404 Not Found: $rel")
        $res.OutputStream.Write($b, 0, $b.Length)
      } else {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
        else { $res.ContentType = 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store, must-revalidate')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      try { $res.OutputStream.Close() } catch {}
      try { $res.Close() } catch {}
    }
  }
} finally {
  try { $listener.Stop() } catch {}
  try { $listener.Close() } catch {}
}
