$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Resolve-NodeCommand {
    $bundledNode = Join-Path $PSScriptRoot "runtime\node.exe"
    if (Test-Path $bundledNode) {
        return $bundledNode
    }

    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        return $nodeCommand.Source
    }

    throw "Node.js was not found. Install Node.js or use the packaged Windows portable build."
}

$nodeCommand = Resolve-NodeCommand

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
    $serverCommand = "`$env:BENJOJI_DATA_DIR='$targetDataDir'; Set-Location -LiteralPath '$PSScriptRoot'; & '$nodeCommand' server.js"
    Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $serverCommand | Out-Null
    Start-Sleep -Seconds 2
}

Start-Process "http://127.0.0.1:3000"
