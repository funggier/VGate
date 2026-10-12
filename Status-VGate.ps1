[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$Client=Join-Path $Root 'tunnel-client.exe'
$Runtime=Join-Path $Root 'runtime'
$State=Join-Path $Runtime 'launcher.pid'
$PidFile=Join-Path $Runtime 'tunnel-client.pid'
$UrlFile=Join-Path $Runtime 'health-url.txt'
$Exit=0
if (Test-Path -LiteralPath $Client) { Write-Host ('Tunnel client: ' + ((& $Client --version 2>&1 | Out-String).Trim())) } else { Write-Warning 'tunnel-client.exe missing'; exit 3 }
if (-not (Test-Path -LiteralPath $State)) { Write-Host 'Process: stopped'; exit 1 }
$Id=(Get-Content -LiteralPath $State -Raw).Trim()
$Process=Get-Process -Id $Id -ErrorAction SilentlyContinue
if (-not $Process) { Write-Host "Process: stopped (stale PID $Id)"; exit 1 }
Write-Host "Process: running (PID $Id)"
if (-not (Test-Path -LiteralPath $UrlFile)) { Write-Warning 'Health URL unavailable'; exit 2 }
$Base=(Get-Content -LiteralPath $UrlFile -Raw).Trim().TrimEnd('/')
try { $Live=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "$Base/healthz"; Write-Host "Liveness: $($Live.StatusCode) $($Live.Content)" } catch { Write-Warning $_.Exception.Message; $Exit=2 }
try { $Ready=Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "$Base/readyz"; Write-Host "Readiness: $($Ready.StatusCode) $($Ready.Content)" } catch { Write-Warning $_.Exception.Message; $Exit=[Math]::Max($Exit,2) }
try { $Mcp=Invoke-RestMethod -UseBasicParsing -TimeoutSec 5 -Uri "$Base/health/mcp"; Write-Host "MCP observed: status=$($Mcp.status) state=$($Mcp.state) child=$($Mcp.details.child_state) initialize=$($Mcp.details.initialize.ok) tools=$($Mcp.details.tools_list.ok) complete=$($Mcp.details.tools_list.complete)"; if ($Mcp.status -ne 'ok') { $Exit=[Math]::Max($Exit,4) } } catch { $Code=$null; try{$Code=[int]$_.Exception.Response.StatusCode}catch{}; if($Code -eq 404){Write-Host 'MCP component endpoint: unavailable in tunnel-client 0.0.14 (optional).'}else{Write-Warning ('MCP health: '+$_.Exception.Message);$Exit=[Math]::Max($Exit,4)} }
if (Test-Path -LiteralPath $PidFile) { try { $Health=& $Client health --json --url-file $UrlFile --pid-file $PidFile --require-control-plane-poll 2>&1; if ($LASTEXITCODE -eq 0) { Write-Host 'Control-plane health: PASS' } else { Write-Warning ($Health|Out-String); $Exit=[Math]::Max($Exit,2) } } catch { Write-Warning $_.Exception.Message; $Exit=[Math]::Max($Exit,2) } }
exit $Exit
