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

function Write-EnvFile([string[]]$Lines) {
    # UTF-8 without BOM: docker compose and python-dotenv both choke on a BOM.
    [System.IO.File]::WriteAllLines($EnvFile, $Lines, (New-Object System.Text.UTF8Encoding $false))
}

# --- .env ---------------------------------------------------------------
$exampleLines = Get-Content -LiteralPath (Join-Path $RepoRoot '.env.example') -Encoding UTF8
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Host 'Creating .env from .env.example with generated database passwords...'
    $saPassword = New-DbPassword
    $appPassword = New-DbPassword
    $apiPort = Find-FreePort 8000
    $webPort = Find-FreePort 5173
    $lines = $exampleLines | ForEach-Object {
        if ($_ -match '^(MSSQL_SA_PASSWORD|DB_ADMIN_PASSWORD)=') { "$($Matches[1])=$saPassword" }
        elseif ($_ -match '^DB_PASSWORD=') { "DB_PASSWORD=$appPassword" }
        elseif ($_ -match '^API_PORT=') { "API_PORT=$apiPort" }
        elseif ($_ -match '^WEB_PORT=') { "WEB_PORT=$webPort" }
        else { $_ }
    }
    Write-EnvFile ([string[]]$lines)
    if ($apiPort -ne 8000) { Write-Host "  Port 8000 is busy; API_PORT set to $apiPort." }
    if ($webPort -ne 5173) { Write-Host "  Port 5173 is busy; WEB_PORT set to $webPort." }
}
else {
    # Append keys added to .env.example since this .env was created.
    $current = Read-DotEnv
    $missing = @($exampleLines | Where-Object { $_ -match '^([A-Z0-9_]+)=' -and -not $current.ContainsKey($Matches[1]) })
    if ($missing.Count -gt 0) {
        $added = $missing | ForEach-Object {
            $key = ($_ -split '=', 2)[0]
            if ($key -eq 'DB_ADMIN_PASSWORD') { "DB_ADMIN_PASSWORD=$($current['MSSQL_SA_PASSWORD'])" }
            elseif ($key -like '*PASSWORD') { "$key=$(New-DbPassword)" }
            else { $_ }
        }
        Write-Host "Adding new keys to .env: $(($added | ForEach-Object { ($_ -split '=', 2)[0] }) -join ', ')"
        $lines = @(Get-Content -LiteralPath $EnvFile -Encoding UTF8) + @('') + @($added)
        Write-EnvFile ([string[]]$lines)
    }
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
    # npm ci deletes node_modules first, which fails while the Vite dev server has files open (EPERM).
    # Use it only for a fresh checkout; afterwards npm install updates in place from the lockfile.
    $npmCommand = if (Test-Path -LiteralPath (Join-Path $FrontendDir 'node_modules')) { 'install' } else { 'ci' }
    Write-Host "Installing frontend dependencies (npm $npmCommand)..."
    Push-Location $FrontendDir
    try { Invoke-Native npm.cmd @($npmCommand, '--no-audit', '--no-fund') }
    finally { Pop-Location }
    Set-Content -LiteralPath $npmStamp -Value $npmHash -Encoding ASCII
}
