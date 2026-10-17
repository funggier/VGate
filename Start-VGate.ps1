[CmdletBinding()]
param(
    [string]$ApiKey,
    [string]$OrganizationId,
    [switch]$NonInteractive
)

$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$Client=Join-Path $Root 'tunnel-client.exe'
$Runtime=Join-Path $Root 'runtime'
$Logs=Join-Path $Root 'logs'
$State=Join-Path $Runtime 'launcher.pid'
$CredentialHelper=Join-Path $Root 'scripts\TunnelCredential.ps1'
$ConnectionHelper=Join-Path $Root 'scripts\TunnelConnectionSettings.ps1'
$SetupScript=Join-Path $Root 'Setup-VGate.ps1'

foreach ($Required in @($CredentialHelper,$ConnectionHelper,$SetupScript)) {
    if (-not (Test-Path -LiteralPath $Required -PathType Leaf)) {
        throw "Missing VGate helper: $Required"
    }
}
. $CredentialHelper
. $ConnectionHelper

if (-not (Test-Path -LiteralPath $Client -PathType Leaf)) { throw 'Missing tunnel-client.exe' }
if (-not (Test-Path -LiteralPath (Join-Path $Root 'dist\server-stdio.js') -PathType Leaf)) {
    throw 'Missing dist\server-stdio.js. Run npm run build first.'
}

New-Item -ItemType Directory -Force -Path $Runtime,$Logs | Out-Null

if (Test-Path -LiteralPath $State) {
    $ExistingId=(Get-Content -LiteralPath $State -Raw).Trim()
    $Existing=Get-Process -Id $ExistingId -ErrorAction SilentlyContinue
    if ($Existing) {
        Write-Host "VGate is already running (PID $ExistingId)."
        exit 0
    }
    Remove-Item -LiteralPath $State -Force
}

$Version=(& $Client --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to query tunnel-client version.' }
Write-Host "Tunnel client: $Version"

$ConnectionSettings=Get-VGateConnectionSettings -Root $Root

# One-time compatibility migration for pre-VG-011 installs. Tunnel ID and port
# come from the existing local profile; Organization ID comes only from the old
# combined VGate/LConnect credential. Persistent credential storage is rewritten
# to API-key-only after connection settings are saved.
if (-not $ConnectionSettings) {
    $LegacyProfile=Read-VGateLegacyProfileConnection -Root $Root
    $LegacyCredential=$null
    $CredentialStatus=Get-VGateCredentialStatus -Root $Root

    if ($LegacyProfile -and $CredentialStatus.exists -and $CredentialStatus.decrypt_pass -and $CredentialStatus.organization_id_configured) {
        $LegacyCredential=Read-VGateStoredCredential -Root $Root
    }
    elseif ($LegacyProfile -and $CredentialStatus.legacy_exists) {
        try {
            $LegacyCredential=Read-VGateCredentialEnvelope -Path (Join-Path $Root 'local-secrets\credentials.json.enc') -ExpectedFormat 'lconnect-secure-credential' -EntropyText 'LConnect|SecureCredential|v1'
        } catch {}
    }

    if ($LegacyProfile -and $LegacyCredential -and
        -not [string]::IsNullOrWhiteSpace([string]$LegacyCredential.OrganizationId)) {
        Save-VGateConnectionSettings -Root $Root -TunnelId ([string]$LegacyProfile.tunnel_id) -OrganizationId ([string]$LegacyCredential.OrganizationId) -HealthPort ([int]$LegacyProfile.health_port) | Out-Null
        Write-VGateStoredCredential -Root $Root -RuntimeApiKey ([string]$LegacyCredential.RuntimeApiKey) | Out-Null
        $ConnectionSettings=Get-VGateConnectionSettings -Root $Root
        Write-Host 'Migrated legacy VGate tunnel profile/credential into separated local connection settings.'
    }

    Remove-Variable LegacyProfile,LegacyCredential -ErrorAction SilentlyContinue
}

if (-not $ConnectionSettings) {
    if ($NonInteractive) {
        throw 'CONNECTION_SETTINGS_NOT_CONFIGURED: Tunnel ID, Organization ID, and health port are unavailable. Run Setup-VGate.cmd first.'
    }

    Write-Host 'One or more VGate connection values are missing.'
    Write-Host 'Only missing values will be requested; saved values will be reused.'
    $SetupArgs=@{ FillMissing=$true }
    if (-not [string]::IsNullOrWhiteSpace($ApiKey)) { $SetupArgs.ApiKey=$ApiKey }
    if (-not [string]::IsNullOrWhiteSpace($OrganizationId)) { $SetupArgs.OrganizationId=$OrganizationId }
    & $SetupScript @SetupArgs
    if ($LASTEXITCODE -ne 0) { throw "Setup failed (exit $LASTEXITCODE)." }
    $ConnectionSettings=Get-VGateConnectionSettings -Root $Root
}

if (-not $ConnectionSettings) {
    throw 'CONNECTION_SETTINGS_NOT_CONFIGURED: VGate connection setup is incomplete.'
}

$CredentialStatus=Get-VGateCredentialStatus -Root $Root
if (-not $CredentialStatus.exists -or -not $CredentialStatus.decrypt_pass -or -not $CredentialStatus.runtime_api_key_configured) {
    if ($NonInteractive) {
        throw 'CREDENTIAL_NOT_CONFIGURED: VGate Runtime API key is unavailable. Run Setup-VGate.cmd first.'
    }

    $SetupArgs=@{
        FillMissing=$true
        TunnelId=[string]$ConnectionSettings.tunnel_id
        OrganizationId=[string]$ConnectionSettings.organization_id
        HealthPort=[int]$ConnectionSettings.health_port
    }
    if (-not [string]::IsNullOrWhiteSpace($ApiKey)) { $SetupArgs.ApiKey=$ApiKey }
    & $SetupScript @SetupArgs
    if ($LASTEXITCODE -ne 0) { throw "Setup failed (exit $LASTEXITCODE)." }

    $ConnectionSettings=Get-VGateConnectionSettings -Root $Root
    $CredentialStatus=Get-VGateCredentialStatus -Root $Root
}

$Profile=Write-VGateTunnelProfile -Root $Root
$ResolvedOrganizationId=if (-not [string]::IsNullOrWhiteSpace($OrganizationId)) {
    [string]$OrganizationId
} else {
    [string]$ConnectionSettings.organization_id
}

$Resolved=Resolve-VGateCredential -Root $Root -ApiKey $ApiKey -OrganizationId $ResolvedOrganizationId -NonInteractive:$NonInteractive
$OldKey=[Environment]::GetEnvironmentVariable('CONTROL_PLANE_API_KEY','Process')
$OldOrg=[Environment]::GetEnvironmentVariable('CONTROL_PLANE_ORGANIZATION_ID','Process')

try {
    $env:CONTROL_PLANE_API_KEY=$Resolved.RuntimeApiKey
    $env:CONTROL_PLANE_ORGANIZATION_ID=$Resolved.OrganizationId
    Write-Host "Credential source: Runtime API key=$($Resolved.ApiKeySource); Organization ID=connection-settings"

    Push-Location -LiteralPath $Root
    try {
        & $Client doctor --profile-file $Profile --control-plane.organization-id $Resolved.OrganizationId --pid.file (Join-Path $Runtime 'tunnel-client.pid') 2>&1 | Tee-Object -FilePath (Join-Path $Logs 'doctor-latest.log')
        if ($LASTEXITCODE -ne 0) { throw 'VGate tunnel doctor failed. See logs\doctor-latest.log.' }
    }
    finally {
        Pop-Location
    }

    $Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
    $Args=@(
        'run',
        '--profile-file',$Profile,
        '--control-plane.organization-id',$Resolved.OrganizationId,
        '--pid.file',(Join-Path $Runtime 'tunnel-client.pid')
    )
    $Process=Start-Process -FilePath $Client -WorkingDirectory $Root -ArgumentList $Args -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Logs "tunnel-$Stamp.out.log") -RedirectStandardError (Join-Path $Logs "tunnel-$Stamp.err.log")
    Set-Content -LiteralPath $State -Value $Process.Id -NoNewline
}
finally {
    if ($null -eq $OldKey) { Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue } else { $env:CONTROL_PLANE_API_KEY=$OldKey }
    if ($null -eq $OldOrg) { Remove-Item Env:CONTROL_PLANE_ORGANIZATION_ID -ErrorAction SilentlyContinue } else { $env:CONTROL_PLANE_ORGANIZATION_ID=$OldOrg }
    Remove-Variable Resolved,ApiKey,OrganizationId,ResolvedOrganizationId -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2
if (-not (Get-Process -Id $Process.Id -ErrorAction SilentlyContinue)) {
    Remove-Item -LiteralPath $State -Force -ErrorAction SilentlyContinue
    throw 'VGate tunnel exited during startup.'
}

Write-Host "VGate started (PID $($Process.Id))."
Write-Host "Tunnel ID: $($ConnectionSettings.tunnel_id)"
Write-Host "Organization ID: $($ConnectionSettings.organization_id)"
Write-Host "Health port: $($ConnectionSettings.health_port)"
Write-Host 'Run Status-VGate.cmd to check readiness.'
