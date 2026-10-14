# Shared helpers for the scripts in this folder. Dot-source it: . "$PSScriptRoot\_common.ps1"
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads UTF-8 files without a BOM.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot 'backend'
$FrontendDir = Join-Path $RepoRoot 'frontend'
$VenvPython = Join-Path $BackendDir '.venv\Scripts\python.exe'
$ComposeFile = Join-Path $RepoRoot 'docker-compose.dev.yml'
$EnvFile = Join-Path $RepoRoot '.env'

# Some software (e.g. ZKBioTime) sets PYTHONHOME machine-wide, which breaks every other Python.
# Clear it for this process and everything it starts.
Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue

function Invoke-Native {
    # Runs a native command and throws if it exits non-zero.
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @()
    )
    # Native tools write progress to stderr; don't let PowerShell 5.1 turn that into terminating errors.
    $ErrorActionPreference = 'Continue'
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "'$FilePath $($Arguments -join ' ')' failed with exit code $LASTEXITCODE"
    }
}

function Read-DotEnv {
    if (-not (Test-Path -LiteralPath $EnvFile)) {
        throw '.env not found. Run scripts\setup.ps1 first.'
    }
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $eq = $trimmed.IndexOf('=')
        if ($eq -lt 1) { continue }
        $values[$trimmed.Substring(0, $eq).Trim()] = $trimmed.Substring($eq + 1).Trim()
    }
    return $values
}

function Get-EnvValue {
    param([hashtable]$Values, [string]$Name, [string]$Default)
    if ($Values.ContainsKey($Name) -and $Values[$Name]) { return $Values[$Name] }
    return $Default
}

function Start-Database {
    Write-Host 'Starting SQL Server and Redis; waiting until both are healthy...'
    Invoke-Native docker @('compose', '-f', $ComposeFile, 'up', '-d', '--wait', '--wait-timeout', '180')
    Write-Host 'SQL Server and Redis are healthy.'
}

function Test-PortListening {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Start-InNewWindow {
    # Background process with local logs. EncodedCommand handles spaces in paths.
    param([Parameter(Mandatory)][string]$Title, [Parameter(Mandatory)][string]$Command)
    $logDir = Join-Path $RepoRoot 'storage\logs'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $name = $Title -replace '[^a-zA-Z0-9_-]', '_'
    $pidFile = Join-Path $logDir "$name.pid"
    if (Test-Path -LiteralPath $pidFile) {
        $saved = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $($saved.pid)"
        if ($existing -and $existing.CommandLine -like "*$($saved.command)*") {
            Write-Host "$Title is already running (PID $($saved.pid))."
            return
        }
    }
    $script = "`$ErrorActionPreference = 'Stop'`r`n$Command"
    $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($script))
    $process = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) -RedirectStandardOutput (Join-Path $logDir "$name.log") -RedirectStandardError (Join-Path $logDir "$name.error.log")
    @{ pid = $process.Id; command = $encoded } | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding ASCII
    Write-Host "$Title started (PID $($process.Id)). Logs: $logDir. Stop: taskkill /PID $($process.Id) /T /F"
}
