<#
.SYNOPSIS
    Starts the dev environment: SQL Server container (with backend/sql applied), then the backend
    (uvicorn --reload) and the frontend (vite) each in its own window.
#>
. "$PSScriptRoot\_common.ps1"

# Setup, start the database and apply backend/sql (idempotent).
& "$PSScriptRoot\db-init.ps1"
$envValues = Read-DotEnv
$apiPort = Get-EnvValue $envValues 'API_PORT' '8000'
$webPort = Get-EnvValue $envValues 'WEB_PORT' '5173'

# Don't start a second copy if one is already running (a stale server would keep answering on the port).
if (Test-PortListening $apiPort) {
    Write-Warning "Port $apiPort is already in use (backend already running?). Not starting another backend."
}
else {
    Start-InNewWindow -Title "backend :$apiPort" -Command @"
Remove-Item Env:PYTHONHOME -ErrorAction SilentlyContinue
Set-Location -LiteralPath '$BackendDir'
& '$VenvPython' -m uvicorn --factory app.main:create_app --reload --reload-dir app --host 127.0.0.1 --port $apiPort
"@
}

if (Test-PortListening $webPort) {
    Write-Warning "Port $webPort is already in use (frontend already running?). Not starting another frontend."
}
else {
    Start-InNewWindow -Title "frontend :$webPort" -Command @"
Set-Location -LiteralPath '$FrontendDir'
npm.cmd run dev
"@
}

Write-Host ''
Write-Host "App:     http://localhost:$webPort"
Write-Host "API:     http://localhost:$apiPort/api/v1/health"
Write-Host "API docs: http://localhost:$apiPort/docs"
Write-Host 'Close the two windows to stop. The database keeps running: docker compose -f docker-compose.dev.yml stop'
