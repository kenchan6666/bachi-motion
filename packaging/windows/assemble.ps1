# Builds dist/bachi-motion-<version>-windows-x64.zip
# The zip's entry point is bachi-motion.exe (Electron). Chromium and ffmpeg are inside the zip.
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

$pkg = Get-Content -Raw -Encoding utf8 (Join-Path $root "package.json") | ConvertFrom-Json
$version = [string]$pkg.version
if ($version -ne "0.2.3") {
  Write-Host "package.json version is $version"
}

$electronVersion = "45.4.1"
# Pinned autobuild, not the floating "latest" tag. This zip's ffmpeg.exe is
# N-129150-g7ddf7bc8a4 and contains h264_nvenc, h264_amf, h264_qsv, and libx264.
$ffmpegUrl = "https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/autobuild-2026-11-20-12-40/ffmpeg-N-129150-g7ddf7bc8a4-win64-gpl.zip"
$electronUrl = "https://github.com/electron/electron/releases/download/v$electronVersion/electron-v$electronVersion-win32-x64.zip"

$dist = Join-Path $root "dist"
$cache = Join-Path $dist "cache"
$stage = Join-Path $dist "bachi-motion-$version-windows-x64"
New-Item -ItemType Directory -Force -Path $cache | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

function Get-Zip($url, $name) {
  $dest = Join-Path $cache $name
  if (-not (Test-Path $dest) -or (Get-Item $dest).Length -lt 1000000) {
    Write-Host "download $url"
    Invoke-WebRequest -Uri $url -OutFile $dest
  }
  return $dest
}

function Expand-To($zip, $dest) {
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Expand-Archive -Path $zip -DestinationPath $dest
}

$electronZip = Get-Zip $electronUrl "electron-v$electronVersion-win32-x64.zip"
$ffmpegZip = Get-Zip $ffmpegUrl "ffmpeg-win64-gpl.zip"
$electronExtract = Join-Path $cache "electron-v$electronVersion"
$ffmpegExtract = Join-Path $cache "ffmpeg-gpl"
Expand-To $electronZip $electronExtract
Expand-To $ffmpegZip $ffmpegExtract

$electronRoot = $electronExtract
if (-not (Test-Path (Join-Path $electronRoot "electron.exe"))) {
  $nested = Get-ChildItem $electronExtract -Directory | Select-Object -First 1
  if (-not $nested) { throw "electron zip has no electron.exe" }
  $electronRoot = $nested.FullName
}
Copy-Item -Path (Join-Path $electronRoot "*") -Destination $stage -Recurse -Force
Rename-Item -Path (Join-Path $stage "electron.exe") -NewName "bachi-motion.exe"
$defaultAsar = Join-Path $stage "resources\default_app.asar"
if (Test-Path $defaultAsar) { Remove-Item -Force $defaultAsar }

$app = Join-Path $stage "resources\app"
New-Item -ItemType Directory -Force -Path $app | Out-Null
$include = @(
  "package.json",
  "package-lock.json",
  "index.html",
  "desktop",
  "js",
  "assets",
  "samples",
  "出片说明.md"
)
foreach ($item in $include) {
  Copy-Item -Recurse -Force (Join-Path $root $item) (Join-Path $app $item)
}

$ffmpegExe = Get-ChildItem -Path $ffmpegExtract -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $ffmpegExe) { throw "ffmpeg zip has no ffmpeg.exe" }
$ffmpegDir = Join-Path $stage "resources\ffmpeg"
New-Item -ItemType Directory -Force -Path $ffmpegDir | Out-Null
Copy-Item -Force $ffmpegExe.FullName (Join-Path $ffmpegDir "ffmpeg.exe")
Get-ChildItem $ffmpegExtract -Recurse -File | Where-Object {
  $_.Name -match '^(LICENSE|COPYING)'
} | Select-Object -First 3 | ForEach-Object {
  Copy-Item -Force $_.FullName (Join-Path $ffmpegDir $_.Name)
}

$ffmpegBin = Join-Path $ffmpegDir "ffmpeg.exe"
# ffmpeg -encoders prints one encoder per line. PowerShell's -notmatch on that
# array returns the non-matching lines, which is still truthy, so the check
# must run against one string.
$encoderText = (& $ffmpegBin -hide_banner -encoders 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($encoderText)) {
  throw "ffmpeg -encoders failed (exit $LASTEXITCODE)"
}
foreach ($name in @("h264_nvenc", "h264_amf", "h264_qsv", "libx264")) {
  if ($encoderText -notmatch [regex]::Escape($name)) {
    throw "bundled ffmpeg is missing encoder $name"
  }
}
Write-Host "bundled ffmpeg has h264_nvenc, h264_amf, h264_qsv, and libx264"

Copy-Item -Force (Join-Path $root "出片说明.md") (Join-Path $stage "出片说明.md")

$zipOut = Join-Path $dist "bachi-motion-$version-windows-x64.zip"
if (Test-Path $zipOut) { Remove-Item -Force $zipOut }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipOut -CompressionLevel Optimal
Write-Host "wrote $zipOut"
