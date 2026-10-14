<#
.SYNOPSIS
    Runs every check: backend tests (pytest, needs the dev database), frontend type check (tsc) and tests (vitest).
    Exits 1 if anything fails.
#>
. "$PSScriptRoot\_common.ps1"

& "$PSScriptRoot\setup.ps1"
Start-Database

$failed = New-Object System.Collections.Generic.List[string]

function Invoke-Check {
    param([string]$Name, [string]$Directory, [string]$FilePath, [string[]]$Arguments)
    Write-Host ''
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    Push-Location -LiteralPath $Directory
    try {
        $ErrorActionPreference = 'Continue'
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) { $failed.Add($Name) }
    }
    finally { Pop-Location }
}

Invoke-Check 'backend: pytest' $BackendDir $VenvPython @('-m', 'pytest')
Invoke-Check 'frontend: tsc --noEmit' $FrontendDir 'npm.cmd' @('run', 'typecheck')
Invoke-Check 'frontend: vitest' $FrontendDir 'npm.cmd' @('test')

Write-Host ''
if ($failed.Count -gt 0) {
    Write-Host "FAILED: $($failed -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host 'All checks passed.' -ForegroundColor Green
