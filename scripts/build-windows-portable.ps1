$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Copy-ReleaseItem {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot
    )

    $sourcePath = Join-Path $repoRoot $Source
    if (-not (Test-Path $sourcePath)) {
        throw "Required release item not found: $Source"
    }

    if ((Get-Item $sourcePath).PSIsContainer) {
        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $DestinationRoot $Source) -Recurse -Force
    } else {
        $targetPath = Join-Path $DestinationRoot $Source
        $targetDir = Split-Path -Parent $targetPath
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
    }
}

$package = Get-Content (Join-Path $repoRoot "package.json") | ConvertFrom-Json
$version = $package.version
$nodeSource = (Get-Command node -ErrorAction Stop).Source
$distRoot = Join-Path $repoRoot "dist"
$packageName = "Benjoji-Business-Suite-Windows-Portable-v$version"
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("benjoji-portable-" + [guid]::NewGuid().ToString("N"))
$packageDir = Join-Path $stagingRoot $packageName
$packageOutputDir = Join-Path $distRoot $packageName
$zipFileName = "$packageName.zip"
$zipPath = Join-Path $distRoot $zipFileName
$hashPath = "$zipPath.sha256"

if (Test-Path $zipPath) {
    try {
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction Stop
    } catch {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $zipFileName = "$packageName-$timestamp.zip"
        $zipPath = Join-Path $distRoot $zipFileName
        $hashPath = "$zipPath.sha256"
        Write-Output "Previous ZIP was busy, so a timestamped release will be created instead."
    }
}
if (Test-Path $hashPath) {
    Remove-Item -LiteralPath $hashPath -Force -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $packageDir "runtime") -Force | Out-Null
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null

$releaseItems = @(
    "public",
    "lib",
    "server.js",
    "package.json",
    "README.md",
    "LICENSE",
    "OPERATIONS_AND_COMPLIANCE.md",
    "PROJECT_SPEC.md",
    "start-app.ps1",
    "start-app.bat",
    "start-lan.ps1",
    "start-lan.bat"
)

foreach ($item in $releaseItems) {
    Copy-ReleaseItem -Source $item -DestinationRoot $packageDir
}

Copy-Item -LiteralPath $nodeSource -Destination (Join-Path $packageDir "runtime\node.exe") -Force

$launcherContent = @"
@echo off
setlocal
call "%~dp0start-app.bat"
endlocal
"@
Set-Content -LiteralPath (Join-Path $packageDir "Benjoji Business Suite.bat") -Value $launcherContent -Encoding ASCII

$installNotes = @"
Benjoji Business Suite - Windows Portable
========================================

1. Double-click "Benjoji Business Suite.bat"
2. The local app server will start
3. Your browser opens the suite automatically

Data is saved in:
%LOCALAPPDATA%\Benjoji Business Suite\

For LAN preview:
- Run start-lan.bat

This portable package includes:
- the full suite code
- a bundled Node.js runtime
- Windows launchers
"@
Set-Content -LiteralPath (Join-Path $packageDir "INSTALL-WINDOWS.txt") -Value $installNotes -Encoding UTF8

Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -Force

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
Set-Content -LiteralPath $hashPath -Value "$hash *$zipFileName" -Encoding ASCII

if (Test-Path $packageOutputDir) {
    try {
        Remove-Item -LiteralPath $packageOutputDir -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Output "Previous extracted package folder was busy, so it will be replaced only by the ZIP release."
    }
}

if (-not (Test-Path $packageOutputDir)) {
    Copy-Item -LiteralPath $packageDir -Destination $packageOutputDir -Recurse -Force
}

Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Output "Windows portable package created:"
Write-Output $zipPath
Write-Output $hashPath
