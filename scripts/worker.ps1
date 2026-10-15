# Run supervised import/export workers and the durable SQL dispatcher. Ctrl+C stops both.
. "$PSScriptRoot\_common.ps1"
Push-Location -LiteralPath $BackendDir
try { Invoke-Native $VenvPython @('-m', 'app.cli.worker_supervisor') }
finally { Pop-Location }
