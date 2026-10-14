<#
.SYNOPSIS
    Idempotent dev setup: .env, Python venv, backend and frontend dependencies.
    Safe to run any time; it only does work when something is missing or changed.
    dev.ps1 and test.ps1 call it automatically.
#>
. "$PSScriptRoot\_common.ps1"

function New-DbPassword {
    $bytes = New-Object byte[] 18
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $hex = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    # Hex gives lower case and digits; the suffix adds upper case and a symbol for SQL Server's complexity policy.
    return "$hex-Aa1"
}

function Find-FreePort {
    param([int]$Preferred)
    $port = $Preferred
    while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { $port++ }
    return $port
}

function Get-FilesHash {
    param([string[]]$Paths)
    $text = ($Paths | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash }) -join ''
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $digest = $sha.ComputeHash([System.Text.Encoding]::ASCII.GetBytes($text)) } finally { $sha.Dispose() }
    return ($digest | ForEach-Object { $_.ToString('x2') }) -join ''
}

# --- .env ---------------------------------------------------------------
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Host 'Creating .env from .env.example with a generated database password...'
    $password = New-DbPassword
    $apiPort = Find-FreePort 8000
    $webPort = Find-FreePort 5173
    $lines = Get-Content -LiteralPath (Join-Path $RepoRoot '.env.example') -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^(MSSQL_SA_PASSWORD|DB_PASSWORD)=') { "$($Matches[1])=$password" }
        elseif ($_ -match '^API_PORT=') { "API_PORT=$apiPort" }
        elseif ($_ -match '^WEB_PORT=') { "WEB_PORT=$webPort" }
        else { $_ }
    }
    # UTF-8 without BOM: docker compose and python-dotenv both choke on a BOM.
    [System.IO.File]::WriteAllLines($EnvFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding $false))
    if ($apiPort -ne 8000) { Write-Host "  Port 8000 is busy; API_PORT set to $apiPort." }
    if ($webPort -ne 5173) { Write-Host "  Port 5173 is busy; WEB_PORT set to $webPort." }
}

# --- Backend venv -------------------------------------------------------
if (-not (Test-Path -LiteralPath $VenvPython)) {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw 'Python launcher (py) not found. Install Python 3.12.' }
    Write-Host 'Creating Python 3.12 virtual environment in backend\.venv...'
    Invoke-Native py @('-3.12', '-m', 'venv', (Join-Path $BackendDir '.venv'))
}

$requirements = @((Join-Path $BackendDir 'requirements.txt'), (Join-Path $BackendDir 'requirements-dev.txt'))
$pipStamp = Join-Path $BackendDir '.venv\.requirements.sha256'
$pipHash = Get-FilesHash $requirements
if (-not (Test-Path -LiteralPath $pipStamp) -or (Get-Content -LiteralPath $pipStamp) -ne $pipHash) {
    Write-Host 'Installing backend dependencies...'
    Push-Location $BackendDir
    try { Invoke-Native $VenvPython @('-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', 'requirements-dev.txt') }
    finally { Pop-Location }
    Set-Content -LiteralPath $pipStamp -Value $pipHash -Encoding ASCII
}

# --- Frontend node_modules ---------------------------------------------
$lockFile = Join-Path $FrontendDir 'package-lock.json'
$npmStamp = Join-Path $FrontendDir 'node_modules\.setup.sha256'
$npmHash = Get-FilesHash @($lockFile)
if (-not (Test-Path -LiteralPath $npmStamp) -or (Get-Content -LiteralPath $npmStamp) -ne $npmHash) {
    Write-Host 'Installing frontend dependencies (npm ci)...'
    Push-Location $FrontendDir
    try { Invoke-Native npm.cmd @('ci', '--no-audit', '--no-fund') }
    finally { Pop-Location }
    Set-Content -LiteralPath $npmStamp -Value $npmHash -Encoding ASCII
}
