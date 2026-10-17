$ErrorActionPreference='Stop'
$SourceRoot=Split-Path -Parent $PSScriptRoot
$Helper=Join-Path $SourceRoot 'scripts\TunnelConnectionSettings.ps1'
$TempRoot=Join-Path $env:TEMP ('vgate-connection-settings-smoke-'+[Guid]::NewGuid().ToString('N'))

function Assert-True { param([bool]$Condition,[string]$Message) if(-not $Condition){throw $Message} }

try {
  New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
  Assert-True (Test-Path -LiteralPath $Helper -PathType Leaf) 'TunnelConnectionSettings helper is missing'
  . $Helper

  $Saved=Save-VGateConnectionSettings -Root $TempRoot -TunnelId 'tunnel_vgate_test' -OrganizationId 'org-vgate-test' -HealthPort 18130
  Assert-True $Saved.saved 'save failed'
  $Settings=Get-VGateConnectionSettings -Root $TempRoot
  Assert-True ($Settings.tunnel_id -eq 'tunnel_vgate_test') 'Tunnel ID mismatch'
  Assert-True ($Settings.organization_id -eq 'org-vgate-test') 'Organization mismatch'
  Assert-True ([int]$Settings.health_port -eq 18130) 'port mismatch'

  $Profile=Write-VGateTunnelProfile -Root $TempRoot
  $Yaml=Get-Content -LiteralPath $Profile -Raw
  Assert-True ($Yaml -match 'tunnel_vgate_test') 'profile missing Tunnel ID'
  Assert-True ($Yaml -match 'env:CONTROL_PLANE_API_KEY') 'profile missing API key env indirection'
  Assert-True ($Yaml -match '127\.0\.0\.1:18130') 'profile missing port'
  Assert-True ($Yaml -match 'dist/server-stdio\.js') 'profile missing VGate stdio entrypoint'
  Assert-True ($Yaml -notmatch 'org-vgate-test') 'Organization must not be written to profile'
  Write-Host 'connection settings/profile round-trip: PASS'

  $Removed=Remove-VGateConnectionSettings -Root $TempRoot
  Assert-True $Removed.settings_removed 'settings not removed'
  Assert-True $Removed.profile_removed 'profile not removed'
  Write-Host 'connection settings clear: PASS'
}
finally {
  Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
