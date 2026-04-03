$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$targetDataDir = Join-Path $env:LOCALAPPDATA "BENJOJI Payment Handling"
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
