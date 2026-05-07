#requires -version 5.1
# Builds DataBased agent — single binary that runs on Windows 7 through 11.
# Run from the agent/ directory:
#   .\build.ps1
#
# Output: dist\databased-agent\
# Drop your agent.json next to the exe before running.
#
# WHY PYTHON 3.8: Python 3.9+ depends on Win10-only APIs and won't load on
# Windows 7 ('Failed to load python311.dll' / specified module not found).
# Python 3.8 is the last version supporting Win7 AND it runs fine on
# Win10/11 — so one build covers everything.
#
# REQUIREMENTS on the build PC: install Python 3.8 from python.org. The
# Windows `py` launcher (also from python.org) auto-finds it via the
# `-3.8` flag used below; no PATH gymnastics needed.

$ErrorActionPreference = "Stop"

# Verify Python 3.8 is available before doing anything destructive.
$pyVer = & py -3.8 -c "import sys; print(sys.version_info[:2])" 2>$null
if (-not $pyVer) {
  Write-Host "ERROR: Python 3.8 not found. Install it from https://www.python.org/downloads/release/python-3810/" -ForegroundColor Red
  Write-Host "       (Last Win7-compatible Python; required so the same binary runs on Win7-11.)" -ForegroundColor Red
  exit 1
}
Write-Host "==> using Python 3.8 (py -3.8): $pyVer" -ForegroundColor Cyan

Write-Host "==> installing build deps" -ForegroundColor Cyan
py -3.8 -m pip install --quiet --upgrade pip
py -3.8 -m pip install --quiet -r requirements.txt
py -3.8 -m pip install --quiet pyinstaller

Write-Host "==> cleaning previous build" -ForegroundColor Cyan
function Remove-DirSafe($path) {
  if (-not (Test-Path $path -ErrorAction SilentlyContinue)) { return }
  try {
    Remove-Item $path -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Host ("  warn: couldn't fully clean {0} ({1}). PyInstaller will overwrite." -f $path, $_.Exception.Message) -ForegroundColor Yellow
    # Tip: if a file is locked, the most common cause is a still-running
    # databased-agent.exe pointing at dist\. Run 'tasklist | findstr databased'
    # to find it, then kill it before re-running this build.
  }
}
Remove-DirSafe build
Remove-DirSafe dist
# NOTE: do NOT delete *.spec files — databased-agent.spec is now committed
# source that controls how PyInstaller bundles. Removing it here would
# break the build on the next run.

Write-Host "==> building (onedir; takes ~60s)" -ForegroundColor Cyan
# onedir (no --onefile): outputs dist\databased-agent\ with the exe + DLLs
# next to each other. Avoids the %TEMP%\_MEI* unpack that triggers Defender
# false positives ('Failed to load Python DLL python311.dll').
# Use the .spec file — explicit module bundling, more reliable than CLI flags
# when sibling modules need to be collected (startup, config_ui, tray).
py -3.8 -m PyInstaller --noconfirm databased-agent.spec

$exePath = "dist\databased-agent\databased-agent.exe"
if (-not (Test-Path $exePath)) {
  Write-Host "Build failed - see PyInstaller output above." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Built: dist\databased-agent\" -ForegroundColor Green
$folderBytes = (Get-ChildItem "dist\databased-agent" -Recurse | Measure-Object -Property Length -Sum).Sum
Write-Host ("  Folder size: {0} MB" -f [math]::Round($folderBytes / 1MB, 1))
Write-Host ""
Write-Host "Distribution: ship the entire 'databased-agent' folder."
Write-Host "Run: double-click databased-agent\databased-agent.exe (the wizard creates agent.json next to it)."
Write-Host "Logs: %LOCALAPPDATA%\DataBased\agent.log"
