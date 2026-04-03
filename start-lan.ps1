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

$serverRunningOnLan = $false
try {
    $serverRunningOnLan = [bool](netstat -ano | Select-String "0\.0\.0\.0:3000\s+.*LISTENING")
} catch {
    $serverRunningOnLan = $false
}

if (-not $serverRunningOnLan) {
    $serverCommand = "`$env:BENJOJI_DATA_DIR='$targetDataDir'; `$env:HOST='0.0.0.0'; Set-Location -LiteralPath '$PSScriptRoot'; & '$nodeCommand' server.js"
    Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $serverCommand | Out-Null
    Start-Sleep -Seconds 2
}

$ipv4Addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
    } |
    Select-Object -ExpandProperty IPAddress -Unique

Write-Host ""
Write-Host "Benjoji Business Suite LAN preview is ready." -ForegroundColor Green
Write-Host "Open from this PC: http://127.0.0.1:3000"
foreach ($ip in $ipv4Addresses) {
    Write-Host "Open from phones or tablets on the same Wi-Fi: http://$ip`:3000"
}
Write-Host ""

Start-Process "http://127.0.0.1:3000"
