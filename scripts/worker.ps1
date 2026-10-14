# Start the background import/export worker and durable SQL dispatcher.
. "$PSScriptRoot\_common.ps1"
Push-Location -LiteralPath $BackendDir
try { Invoke-Native $VenvPython @('-m', 'app.cli.worker') }
finally { Pop-Location }
