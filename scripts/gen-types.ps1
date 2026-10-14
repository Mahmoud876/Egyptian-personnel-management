<#
.SYNOPSIS
    Regenerates frontend/src/shared/api/schema.d.ts from the FastAPI OpenAPI schema.
    Builds the schema from the app in-process, so neither the backend nor the database needs to be running.
#>
. "$PSScriptRoot\_common.ps1"

& "$PSScriptRoot\setup.ps1"

$openapiFile = Join-Path ([System.IO.Path]::GetTempPath()) 'personnel-openapi.json'
# Single quotes only: Windows PowerShell 5.1 strips embedded double quotes from native arguments.
$exportScript = @'
import json, sys
from app.main import create_app
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(create_app().openapi(), f, ensure_ascii=False, indent=2)
'@

Push-Location -LiteralPath $BackendDir
try { Invoke-Native $VenvPython @('-c', $exportScript, $openapiFile) }
finally { Pop-Location }

Push-Location -LiteralPath $FrontendDir
try { Invoke-Native npm.cmd @('exec', '--no', '--', 'openapi-typescript', $openapiFile, '-o', 'src/shared/api/schema.d.ts') }
finally { Pop-Location }

Remove-Item -LiteralPath $openapiFile -ErrorAction SilentlyContinue
Write-Host 'Updated frontend/src/shared/api/schema.d.ts'
