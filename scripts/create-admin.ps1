<#
.SYNOPSIS
    Creates the first admin user with every permission and prints a generated password (shown once).
.PARAMETER Username
    Login name. Default: admin
.PARAMETER Reset
    If the user exists: reactivate it, set a new password and grant every permission again.
#>
param(
    [string]$Username = 'admin',
    [switch]$Reset
)

. "$PSScriptRoot\_common.ps1"

& "$PSScriptRoot\db-init.ps1"

$arguments = @('-m', 'app.cli.create_admin', '--username', $Username)
if ($Reset) { $arguments += '--reset' }

Push-Location -LiteralPath $BackendDir
try { Invoke-Native $VenvPython $arguments }
finally { Pop-Location }
