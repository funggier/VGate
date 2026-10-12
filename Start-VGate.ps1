[CmdletBinding()]
param([string]$ApiKey,[string]$OrganizationId,[switch]$NonInteractive)
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$Client=Join-Path $Root 'tunnel-client.exe'
$Profile=Join-Path $Root 'mcp-conf.yaml'
$Runtime=Join-Path $Root 'runtime'
$Logs=Join-Path $Root 'logs'
$State=Join-Path $Runtime 'launcher.pid'
$CredentialHelper=Join-Path $Root 'scripts\TunnelCredential.ps1'
if (-not (Test-Path -LiteralPath $Client)) { throw "Missing tunnel-client.exe" }
if (-not (Test-Path -LiteralPath $Profile)) { throw "Missing mcp-conf.yaml" }
if (-not (Test-Path -LiteralPath $CredentialHelper)) { throw "Missing $CredentialHelper" }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'dist\server-stdio.js'))) { throw 'Missing dist\server-stdio.js. Run npm run build first.' }
. $CredentialHelper
New-Item -ItemType Directory -Force -Path $Runtime,$Logs | Out-Null
if (Test-Path -LiteralPath $State) {
  $ExistingId=(Get-Content -LiteralPath $State -Raw).Trim()
  $Existing=Get-Process -Id $ExistingId -ErrorAction SilentlyContinue
  if ($Existing) { Write-Host "VGate is already running (PID $ExistingId)."; exit 0 }
  Remove-Item -LiteralPath $State -Force
}
$Version=(& $Client --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to query tunnel-client version.' }
Write-Host "Tunnel client: $Version"
$Resolved=Resolve-VGateCredential -Root $Root -ApiKey $ApiKey -OrganizationId $OrganizationId -NonInteractive:$NonInteractive
$OldKey=[Environment]::GetEnvironmentVariable('CONTROL_PLANE_API_KEY','Process')
$OldOrg=[Environment]::GetEnvironmentVariable('CONTROL_PLANE_ORGANIZATION_ID','Process')
try {
  $env:CONTROL_PLANE_API_KEY=$Resolved.RuntimeApiKey
  $env:CONTROL_PLANE_ORGANIZATION_ID=$Resolved.OrganizationId
  Push-Location -LiteralPath $Root
  try {
    & $Client doctor --profile-file $Profile --control-plane.organization-id $Resolved.OrganizationId --pid.file (Join-Path $Runtime 'tunnel-client.pid') 2>&1 | Tee-Object -FilePath (Join-Path $Logs 'doctor-latest.log')
    if ($LASTEXITCODE -ne 0) { throw 'VGate tunnel doctor failed. See logs\doctor-latest.log.' }
  } finally { Pop-Location }
  $Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  $Args=@('run','--profile-file',$Profile,'--control-plane.organization-id',$Resolved.OrganizationId,'--pid.file',(Join-Path $Runtime 'tunnel-client.pid'))
  $Process=Start-Process -FilePath $Client -WorkingDirectory $Root -ArgumentList $Args -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Logs "tunnel-$Stamp.out.log") -RedirectStandardError (Join-Path $Logs "tunnel-$Stamp.err.log")
  Set-Content -LiteralPath $State -Value $Process.Id -NoNewline
} finally {
  if ($null -eq $OldKey) { Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue } else { $env:CONTROL_PLANE_API_KEY=$OldKey }
  if ($null -eq $OldOrg) { Remove-Item Env:CONTROL_PLANE_ORGANIZATION_ID -ErrorAction SilentlyContinue } else { $env:CONTROL_PLANE_ORGANIZATION_ID=$OldOrg }
  Remove-Variable Resolved,ApiKey,OrganizationId -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
if (-not (Get-Process -Id $Process.Id -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath $State -Force -ErrorAction SilentlyContinue; throw 'VGate tunnel exited during startup.' }
Write-Host "VGate started (PID $($Process.Id))."
