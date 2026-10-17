$ErrorActionPreference='Stop'
$SourceRoot=Split-Path -Parent $PSScriptRoot
$TempRoot=Join-Path $env:TEMP ('vgate-lifecycle-smoke-'+[Guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition,[string]$Message)
    if(-not $Condition){throw $Message}
}

function Get-FreePort {
    $Listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,0)
    $Listener.Start()
    try { return ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port }
    finally { $Listener.Stop() }
}

try {
    New-Item -ItemType Directory -Force -Path (Join-Path $TempRoot 'scripts') | Out-Null
    foreach($Name in @('Setup-VGate.ps1','Clear-VGateSettings.ps1')) {
        Copy-Item -LiteralPath (Join-Path $SourceRoot $Name) -Destination (Join-Path $TempRoot $Name)
    }
    foreach($Name in @('TunnelCredential.ps1','TunnelConnectionSettings.ps1')) {
        Copy-Item -LiteralPath (Join-Path $SourceRoot ('scripts\'+$Name)) -Destination (Join-Path $TempRoot ('scripts\'+$Name))
    }

    . (Join-Path $TempRoot 'scripts\TunnelCredential.ps1')
    . (Join-Path $TempRoot 'scripts\TunnelConnectionSettings.ps1')

    $ApiKey='synthetic-vgate-api-key'
    $OldOrg='org-vgate-legacy'
    Write-VGateStoredCredential -Root $TempRoot -RuntimeApiKey $ApiKey | Out-Null
    $Stored=Read-VGateStoredCredential -Root $TempRoot
    Assert-True ($Stored.RuntimeApiKey -eq $ApiKey) 'API-key-only round-trip failed'
    Assert-True ([string]::IsNullOrWhiteSpace([string]$Stored.OrganizationId)) 'new credential unexpectedly retained Organization ID'
    Write-Host 'API-key-only credential: PASS'

    Write-VGateStoredCredential -Root $TempRoot -RuntimeApiKey $ApiKey -OrganizationId $OldOrg | Out-Null
    $LegacyStatus=Get-VGateCredentialStatus -Root $TempRoot
    Assert-True $LegacyStatus.organization_id_configured 'legacy combined credential was not readable'
    Write-Host 'legacy combined credential compatibility: PASS'

    $Port=Get-FreePort
    Save-VGateConnectionSettings -Root $TempRoot -TunnelId 'tunnel-vgate-clear-test' -OrganizationId $OldOrg -HealthPort $Port | Out-Null
    Write-VGateTunnelProfile -Root $TempRoot | Out-Null
    & (Join-Path $TempRoot 'Clear-VGateSettings.ps1') -Mode connection -Force | Out-Null
    Assert-True ($null -eq (Get-VGateConnectionSettings -Root $TempRoot)) 'connection clear left settings'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $TempRoot 'mcp-conf.yaml'))) 'connection clear left profile'
    $AfterConnectionClear=Read-VGateStoredCredential -Root $TempRoot
    Assert-True ($AfterConnectionClear.RuntimeApiKey -eq $ApiKey) 'connection clear removed API key'
    Assert-True ([string]::IsNullOrWhiteSpace([string]$AfterConnectionClear.OrganizationId)) 'connection clear left legacy Organization in credential'
    Write-Host 'connection clear preserves API key and removes legacy Organization: PASS'

    $Port2=Get-FreePort
    & (Join-Path $TempRoot 'Setup-VGate.ps1') -TunnelId 'tunnel-vgate-setup-test' -ApiKey $ApiKey -OrganizationId 'org-vgate-setup-test' -HealthPort $Port2 -Force | Out-Null
    $Settings=Get-VGateConnectionSettings -Root $TempRoot
    $SetupCredential=Read-VGateStoredCredential -Root $TempRoot
    Assert-True ($Settings.tunnel_id -eq 'tunnel-vgate-setup-test') 'Setup Tunnel ID mismatch'
    Assert-True ($Settings.organization_id -eq 'org-vgate-setup-test') 'Setup Organization mismatch'
    Assert-True ([int]$Settings.health_port -eq $Port2) 'Setup health port mismatch'
    Assert-True ($SetupCredential.RuntimeApiKey -eq $ApiKey) 'Setup API key mismatch'
    Assert-True ([string]::IsNullOrWhiteSpace([string]$SetupCredential.OrganizationId)) 'Setup credential must be API-key-only'
    Assert-True (Test-Path -LiteralPath (Join-Path $TempRoot 'mcp-conf.yaml')) 'Setup did not generate profile'
    Write-Host 'setup separated settings/credential: PASS'

    & (Join-Path $TempRoot 'Clear-VGateSettings.ps1') -Mode credential -Force | Out-Null
    Assert-True (-not (Test-Path -LiteralPath (Get-VGateCredentialFile -Root $TempRoot))) 'credential clear failed'
    Assert-True ($null -ne (Get-VGateConnectionSettings -Root $TempRoot)) 'credential clear removed connection settings'
    Write-Host 'credential clear preserves connection settings: PASS'

    Write-VGateStoredCredential -Root $TempRoot -RuntimeApiKey $ApiKey | Out-Null
    & (Join-Path $TempRoot 'Clear-VGateSettings.ps1') -Mode all -Force | Out-Null
    Assert-True ($null -eq (Get-VGateConnectionSettings -Root $TempRoot)) 'clear all left settings'
    Assert-True (-not (Test-Path -LiteralPath (Get-VGateCredentialFile -Root $TempRoot))) 'clear all left credential'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $TempRoot 'mcp-conf.yaml'))) 'clear all left profile'
    Assert-True (Test-Path -LiteralPath (Join-Path $TempRoot 'runtime') -PathType Container) 'clear all did not recreate runtime'
    Assert-True (Test-Path -LiteralPath (Join-Path $TempRoot 'logs') -PathType Container) 'clear all did not recreate logs'
    Write-Host 'clear all resets only generated tunnel state: PASS'

    $StartText=Get-Content -LiteralPath (Join-Path $SourceRoot 'Start-VGate.ps1') -Raw
    Assert-True ($StartText -match 'Get-VGateConnectionSettings') 'Start does not use separated settings'
    Assert-True ($StartText -match 'Write-VGateTunnelProfile') 'Start does not regenerate profile'
    Assert-True ($StartText -match 'Migrated legacy VGate tunnel profile/credential') 'Start migration path missing'
    Assert-True ($StartText -match 'Setup-VGate\.ps1') 'Start missing FillMissing setup path'

    $RestartText=Get-Content -LiteralPath (Join-Path $SourceRoot 'Restart-VGate.ps1') -Raw
    Assert-True ($RestartText -match 'RESTART_CONNECTION_NOT_CONFIGURED') 'Restart connection preflight missing'
    Assert-True ($RestartText -match 'RESTART_CREDENTIAL_NOT_CONFIGURED') 'Restart credential preflight missing'
    Write-Host 'start/restart wiring: PASS'
}
finally {
    if(Test-Path -LiteralPath $TempRoot){
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
