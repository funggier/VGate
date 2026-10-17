[CmdletBinding()]
param(
    [string]$TunnelId,
    [string]$ApiKey,
    [string]$OrganizationId,
    [int]$HealthPort = 0,
    [switch]$Force,
    [switch]$FillMissing
)

$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$CredentialHelper=Join-Path $Root 'scripts\TunnelCredential.ps1'
$ConnectionHelper=Join-Path $Root 'scripts\TunnelConnectionSettings.ps1'
. $CredentialHelper
. $ConnectionHelper

Write-Host ''
Write-Host '========================================'
Write-Host ' VGate - Connection Setup'
Write-Host '========================================'
Write-Host ''

$ExistingSettings=Get-VGateConnectionSettings -Root $Root
$Stored=$null
$CredentialStatus=Get-VGateCredentialStatus -Root $Root
if ($CredentialStatus.exists -and $CredentialStatus.decrypt_pass) {
    try { $Stored=Read-VGateStoredCredential -Root $Root } catch {}
}

if (-not $ExistingSettings -and $FillMissing) {
    $Legacy=Read-VGateLegacyProfileConnection -Root $Root
    if ($Legacy) {
        if ([string]::IsNullOrWhiteSpace($TunnelId)) { $TunnelId=[string]$Legacy.tunnel_id }
        if ($HealthPort -eq 0) { $HealthPort=[int]$Legacy.health_port }
    }

    if (([string]::IsNullOrWhiteSpace($ApiKey) -or [string]::IsNullOrWhiteSpace($OrganizationId)) -and
        ($CredentialStatus.exists -or $CredentialStatus.legacy_exists)) {
        try {
            $ResolvedLegacy=Resolve-VGateCredential -Root $Root -ApiKey $ApiKey -OrganizationId $OrganizationId -NonInteractive
            if ([string]::IsNullOrWhiteSpace($ApiKey)) { $ApiKey=[string]$ResolvedLegacy.RuntimeApiKey }
            if ([string]::IsNullOrWhiteSpace($OrganizationId)) { $OrganizationId=[string]$ResolvedLegacy.OrganizationId }
        } catch {}
        Remove-Variable ResolvedLegacy -ErrorAction SilentlyContinue
    }
}

if ($ExistingSettings -and -not $Force -and -not $FillMissing) {
    $Answer=Read-Host 'Existing VGate connection settings found. Reconfigure them? [y/N]'
    if ($Answer -notmatch '^(?i)y(es)?$') {
        Write-Host 'Setup cancelled. Existing settings were not changed.'
        exit 0
    }
}

if ($FillMissing -and $ExistingSettings) {
    if ([string]::IsNullOrWhiteSpace($TunnelId)) { $TunnelId=[string]$ExistingSettings.tunnel_id }
    if ([string]::IsNullOrWhiteSpace($OrganizationId)) { $OrganizationId=[string]$ExistingSettings.organization_id }
    if ($HealthPort -eq 0) { $HealthPort=[int]$ExistingSettings.health_port }
}
if ($FillMissing -and [string]::IsNullOrWhiteSpace($ApiKey) -and $Stored) {
    $ApiKey=[string]$Stored.RuntimeApiKey
}

if ([string]::IsNullOrWhiteSpace($TunnelId)) {
    do { $TunnelId=Read-Host '1/4 Tunnel ID (tunnel_...)' } while ([string]::IsNullOrWhiteSpace($TunnelId))
} elseif ($FillMissing) {
    Write-Host "1/4 Tunnel ID: reuse $TunnelId"
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Write-Host '2/4 Runtime API key'
    $Secure=Read-Host '    API key (input hidden)' -AsSecureString
    $Bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { $ApiKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr) }
    if ([string]::IsNullOrWhiteSpace($ApiKey)) { throw 'Runtime API key cannot be empty.' }
} elseif ($FillMissing) {
    Write-Host '2/4 Runtime API key: reuse encrypted credential'
}

if ([string]::IsNullOrWhiteSpace($OrganizationId)) {
    do { $OrganizationId=Read-Host '3/4 Organization ID (org_... or org-...)' } while ([string]::IsNullOrWhiteSpace($OrganizationId))
} elseif ($FillMissing) {
    Write-Host "3/4 Organization ID: reuse $OrganizationId"
}

if ($HealthPort -eq 0) {
    while ($true) {
        $Raw=Read-Host '4/4 Local health port [18030]'
        $Candidate=0
        if ([string]::IsNullOrWhiteSpace($Raw)) { $Candidate=18030 }
        elseif (-not [int]::TryParse($Raw,[ref]$Candidate)) {
            Write-Host '    Invalid port. Enter a number from 1024 to 65535.'
            continue
        }
        if ($Candidate -lt 1024 -or $Candidate -gt 65535) {
            Write-Host '    Port must be between 1024 and 65535.'
            continue
        }
        if (-not (Test-VGatePortAvailable -Port $Candidate)) {
            Write-Host "    Port $Candidate is already in use. Choose another port."
            continue
        }
        $HealthPort=$Candidate
        break
    }
} elseif ($HealthPort -lt 1024 -or $HealthPort -gt 65535) {
    throw 'HealthPort must be between 1024 and 65535.'
} elseif ($FillMissing -and $ExistingSettings -and [int]$ExistingSettings.health_port -eq $HealthPort) {
    Write-Host "4/4 Local health port: reuse $HealthPort"
} elseif (-not (Test-VGatePortAvailable -Port $HealthPort)) {
    throw "HealthPort $HealthPort is already in use."
}

try {
    $SettingsResult=Save-VGateConnectionSettings -Root $Root -TunnelId $TunnelId -OrganizationId $OrganizationId -HealthPort $HealthPort
    $CredentialResult=Write-VGateStoredCredential -Root $Root -RuntimeApiKey $ApiKey
    $Profile=Write-VGateTunnelProfile -Root $Root

    Write-Host ''
    Write-Host 'Setup result: PASS'
    Write-Host "Tunnel ID: $TunnelId"
    Write-Host 'Runtime API key: configured (encrypted with Windows DPAPI)'
    Write-Host "Organization ID: $OrganizationId"
    Write-Host "Health port: $HealthPort"
    Write-Host "Settings: $($SettingsResult.path)"
    Write-Host "Credential: $($CredentialResult.path)"
    Write-Host "Generated profile: $Profile"
    Write-Host ''
    Write-Host 'Saved values are reused automatically until explicitly cleared.'
    Write-Host 'Next: run Start-VGate.cmd'
}
finally {
    Remove-Variable ApiKey,Stored -ErrorAction SilentlyContinue
}
