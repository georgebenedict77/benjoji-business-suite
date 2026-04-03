$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$preferredDataDir = Join-Path $env:LOCALAPPDATA "Benjoji Business Suite"
$legacyDataDir = Join-Path $env:LOCALAPPDATA "BENJOJI Payment Handling"
$targetDataDir = if ((Test-Path (Join-Path $legacyDataDir "workspaces")) -or (Test-Path (Join-Path $legacyDataDir "benjoji.sqlite"))) {
    $legacyDataDir
} else {
    $preferredDataDir
}
$env:BENJOJI_DATA_DIR = $targetDataDir

$serverRunning = $false
try {
    $serverRunning = [bool](netstat -ano | Select-String "127.0.0.1:3000\s+.*LISTENING")
} catch {
    $serverRunning = $false
}

if (-not $serverRunning) {
    $serverCommand = "`$env:BENJOJI_DATA_DIR='$targetDataDir'; Set-Location -LiteralPath '$PSScriptRoot'; node server.js"
    Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $serverCommand | Out-Null
    Start-Sleep -Seconds 2
}

Start-Process "http://127.0.0.1:3000"
