<#
.SYNOPSIS
    Starts the dev environment: SQL Server container, then the backend (uvicorn --reload)
    and the frontend (vite) each in its own window.
#>
. "$PSScriptRoot\_common.ps1"

& "$PSScriptRoot\setup.ps1"
$envValues = Read-DotEnv
$apiPort = Get-EnvValue $envValues 'API_PORT' '8000'
$webPort = Get-EnvValue $envValues 'WEB_PORT' '5173'

Start-Database

Start-InNewWindow -Title "backend :$apiPort" -Command @"
Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
Set-Location -LiteralPath '$BackendDir'
& '$VenvPython' -m uvicorn --factory app.main:create_app --reload --reload-dir app --host 127.0.0.1 --port $apiPort
"@

Start-InNewWindow -Title "frontend :$webPort" -Command @"
Set-Location -LiteralPath '$FrontendDir'
npm.cmd run dev
"@

Write-Host ''
Write-Host "App:     http://localhost:$webPort"
Write-Host "API:     http://localhost:$apiPort/api/v1/health"
Write-Host "API docs: http://localhost:$apiPort/docs"
Write-Host 'Close the two windows to stop. The database keeps running: docker compose -f docker-compose.dev.yml stop'
