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
$Output=& taskkill.exe /PID $Id /T /F 2>&1
$Code=$LASTEXITCODE
if ($Code -ne 0) { throw ('Failed to terminate VGate process tree: ' + ($Output | Out-String)) }
Start-Sleep -Milliseconds 500
Remove-Item -LiteralPath $State -Force -ErrorAction SilentlyContinue
Write-Host "VGate process tree stopped (root PID $Id)."
