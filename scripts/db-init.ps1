<#
.SYNOPSIS
    Creates or updates the database: runs backend/sql/*.sql in order (idempotent, safe to re-run).
    Starts the dev SQL Server container first. dev.ps1 and test.ps1 call this automatically.
#>
. "$PSScriptRoot\_common.ps1"

& "$PSScriptRoot\setup.ps1"
Start-Database

Push-Location -LiteralPath $BackendDir
try { Invoke-Native $VenvPython @('-m', 'app.cli.db_init') }
finally { Pop-Location }
