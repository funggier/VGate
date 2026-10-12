[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$State=Join-Path $Root 'runtime\launcher.pid'
$Expected=Join-Path $Root 'tunnel-client.exe'
if (-not (Test-Path -LiteralPath $State)) { Write-Host 'VGate is not running.'; exit 0 }
$Id=(Get-Content -LiteralPath $State -Raw).Trim()
$Process=Get-Process -Id $Id -ErrorAction SilentlyContinue
if (-not $Process) { Remove-Item -LiteralPath $State -Force; Write-Host 'Removed stale VGate PID file.'; exit 0 }
if ($Process.Path -ne $Expected) { throw "Refusing to stop PID $Id because it is not this VGate tunnel-client." }
Stop-Process -Id $Id
Start-Sleep -Milliseconds 500
Remove-Item -LiteralPath $State -Force -ErrorAction SilentlyContinue
Write-Host "VGate stopped (PID $Id)."
