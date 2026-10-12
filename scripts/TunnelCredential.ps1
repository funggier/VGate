Set-StrictMode -Version Latest

$script:VGateCredentialPath = 'local-secrets\vgate-tunnel.json.enc'
$script:VGateCredentialFormat = 'vgate-tunnel-credential'
$script:VGateCredentialEntropy = 'VGate|TunnelCredential|v1'
$script:LegacyCredentialPath = 'local-secrets\credentials.json.enc'
$script:LegacyCredentialFormat = 'lconnect-secure-credential'
$script:LegacyCredentialEntropy = 'LConnect|SecureCredential|v1'

function Initialize-VGateDpapi {
    Add-Type -AssemblyName System.Security -ErrorAction Stop
    if (-not ('System.Security.Cryptography.ProtectedData' -as [type])) { throw 'DPAPI_UNAVAILABLE: ProtectedData is unavailable.' }
}

function Get-VGateCredentialFile {
    param([Parameter(Mandatory=$true)][string]$Root)
    Join-Path $Root $script:VGateCredentialPath
}

function Initialize-VGateSecretDirectory {
    param([Parameter(Mandatory=$true)][string]$Root)
    $Directory = Join-Path $Root 'local-secrets'
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $SystemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
    $Acl = New-Object System.Security.AccessControl.DirectorySecurity
    $Acl.SetAccessRuleProtection($true, $false)
    foreach ($Sid in @($Identity.User, $SystemSid)) {
        $Rule = New-Object System.Security.AccessControl.FileSystemAccessRule($Sid,[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)
        [void]$Acl.AddAccessRule($Rule)
    }
    [System.IO.Directory]::SetAccessControl($Directory, $Acl)
    $Directory
}

function Read-VGateCredentialEnvelope {
    param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$ExpectedFormat,[Parameter(Mandatory=$true)][string]$EntropyText)
    Initialize-VGateDpapi
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "CREDENTIAL_NOT_CONFIGURED: $Path" }
    $Envelope = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -ErrorAction Stop
    if ([string]$Envelope.format -ne $ExpectedFormat -or [int]$Envelope.version -ne 1 -or [string]$Envelope.provider -ne 'windows-dpapi' -or [string]$Envelope.scope -ne 'CurrentUser') { throw "CREDENTIAL_FORMAT_INVALID: $Path" }
    $Utf8 = New-Object System.Text.UTF8Encoding($false)
    $Cipher = [Convert]::FromBase64String([string]$Envelope.ciphertext)
    $Entropy = $Utf8.GetBytes($EntropyText)
    $Plain = $null
    try {
        $Plain = [System.Security.Cryptography.ProtectedData]::Unprotect($Cipher,$Entropy,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
        $Payload = $Utf8.GetString($Plain) | ConvertFrom-Json -ErrorAction Stop
        if ([string]::IsNullOrWhiteSpace([string]$Payload.runtime_api_key) -or [string]::IsNullOrWhiteSpace([string]$Payload.organization_id)) { throw 'CREDENTIAL_FORMAT_INVALID: Decrypted payload is incomplete.' }
        [pscustomobject]@{ RuntimeApiKey=[string]$Payload.runtime_api_key; OrganizationId=[string]$Payload.organization_id }
    } finally {
        if ($Cipher) { [Array]::Clear($Cipher,0,$Cipher.Length) }; if ($Entropy) { [Array]::Clear($Entropy,0,$Entropy.Length) }; if ($Plain) { [Array]::Clear($Plain,0,$Plain.Length) }
        Remove-Variable Payload -ErrorAction SilentlyContinue
    }
}

function Read-VGateStoredCredential {
    param([Parameter(Mandatory=$true)][string]$Root)
    Read-VGateCredentialEnvelope -Path (Get-VGateCredentialFile -Root $Root) -ExpectedFormat $script:VGateCredentialFormat -EntropyText $script:VGateCredentialEntropy
}

function Write-VGateStoredCredential {
    param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$RuntimeApiKey,[Parameter(Mandatory=$true)][string]$OrganizationId)
    if ([string]::IsNullOrWhiteSpace($RuntimeApiKey) -or [string]::IsNullOrWhiteSpace($OrganizationId)) { throw 'CREDENTIAL_INVALID: Required values are empty.' }
    Initialize-VGateDpapi
    $Directory = Initialize-VGateSecretDirectory -Root $Root
    $Path = Get-VGateCredentialFile -Root $Root
    $Utf8 = New-Object System.Text.UTF8Encoding($false)
    $Plain = $Utf8.GetBytes(([ordered]@{runtime_api_key=$RuntimeApiKey;organization_id=$OrganizationId} | ConvertTo-Json -Compress))
    $Entropy = $Utf8.GetBytes($script:VGateCredentialEntropy)
    $Cipher = $null
    try {
        $Cipher = [System.Security.Cryptography.ProtectedData]::Protect($Plain,$Entropy,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
        $Envelope = [ordered]@{format=$script:VGateCredentialFormat;version=1;provider='windows-dpapi';scope='CurrentUser';updated_at=[DateTimeOffset]::UtcNow.ToString('o');ciphertext=[Convert]::ToBase64String($Cipher)}
        $Temp = Join-Path $Directory ('vgate-credential-' + [Guid]::NewGuid().ToString('N') + '.tmp')
        [System.IO.File]::WriteAllText($Temp,($Envelope | ConvertTo-Json -Depth 4),$Utf8)
        Move-Item -LiteralPath $Temp -Destination $Path -Force
        [pscustomobject]@{saved=$true;path=$Path;format=$script:VGateCredentialFormat}
    } finally {
        if ($Plain) { [Array]::Clear($Plain,0,$Plain.Length) }; if ($Entropy) { [Array]::Clear($Entropy,0,$Entropy.Length) }; if ($Cipher) { [Array]::Clear($Cipher,0,$Cipher.Length) }
    }
}

function Import-VGateLegacyCredential {
    param([Parameter(Mandatory=$true)][string]$Root,[switch]$RemoveLegacy)
    $Target = Get-VGateCredentialFile -Root $Root
    if (Test-Path -LiteralPath $Target -PathType Leaf) { $null = Read-VGateStoredCredential -Root $Root; return [pscustomobject]@{migrated=$false;reason='already-vgate';path=$Target} }
    $Legacy = Join-Path $Root $script:LegacyCredentialPath
    $Stored = Read-VGateCredentialEnvelope -Path $Legacy -ExpectedFormat $script:LegacyCredentialFormat -EntropyText $script:LegacyCredentialEntropy
    try {
        Write-VGateStoredCredential -Root $Root -RuntimeApiKey $Stored.RuntimeApiKey -OrganizationId $Stored.OrganizationId | Out-Null
        $Verify = Read-VGateStoredCredential -Root $Root
        if ([string]::IsNullOrWhiteSpace($Verify.RuntimeApiKey) -or [string]::IsNullOrWhiteSpace($Verify.OrganizationId)) { throw 'CREDENTIAL_MIGRATION_FAILED' }
        if ($RemoveLegacy) { Remove-Item -LiteralPath $Legacy -Force }
        [pscustomobject]@{migrated=$true;legacy_removed=[bool]$RemoveLegacy;path=$Target}
    } finally { Remove-Variable Stored,Verify -ErrorAction SilentlyContinue }
}

function Get-VGateCredentialStatus {
    param([Parameter(Mandatory=$true)][string]$Root)
    $Path = Get-VGateCredentialFile -Root $Root
    $Status = [ordered]@{path=$Path;exists=(Test-Path -LiteralPath $Path -PathType Leaf);decrypt_pass=$false;runtime_api_key_configured=$false;organization_id_configured=$false;legacy_exists=(Test-Path -LiteralPath (Join-Path $Root $script:LegacyCredentialPath) -PathType Leaf);error=$null}
    if ($Status.exists) { try { $Stored=Read-VGateStoredCredential -Root $Root; $Status.decrypt_pass=$true; $Status.runtime_api_key_configured=-not [string]::IsNullOrWhiteSpace($Stored.RuntimeApiKey); $Status.organization_id_configured=-not [string]::IsNullOrWhiteSpace($Stored.OrganizationId) } catch { $Status.error=$_.Exception.Message } finally { Remove-Variable Stored -ErrorAction SilentlyContinue } }
    [pscustomobject]$Status
}

function Resolve-VGateCredential {
    param([Parameter(Mandatory=$true)][string]$Root,[string]$ApiKey,[string]$OrganizationId,[switch]$NonInteractive)
    if ([string]::IsNullOrWhiteSpace($ApiKey)) { $ApiKey=[string]$env:CONTROL_PLANE_API_KEY }
    if ([string]::IsNullOrWhiteSpace($OrganizationId)) { $OrganizationId=[string]$env:CONTROL_PLANE_ORGANIZATION_ID }
    if ([string]::IsNullOrWhiteSpace($ApiKey) -or [string]::IsNullOrWhiteSpace($OrganizationId)) {
        if (-not (Test-Path -LiteralPath (Get-VGateCredentialFile -Root $Root)) -and (Test-Path -LiteralPath (Join-Path $Root $script:LegacyCredentialPath))) { Import-VGateLegacyCredential -Root $Root | Out-Null }
        if (Test-Path -LiteralPath (Get-VGateCredentialFile -Root $Root)) { $Stored=Read-VGateStoredCredential -Root $Root; if ([string]::IsNullOrWhiteSpace($ApiKey)){$ApiKey=$Stored.RuntimeApiKey}; if ([string]::IsNullOrWhiteSpace($OrganizationId)){$OrganizationId=$Stored.OrganizationId}; Remove-Variable Stored -ErrorAction SilentlyContinue }
    }
    if ([string]::IsNullOrWhiteSpace($ApiKey) -and -not $NonInteractive) { $Secure=Read-Host 'OpenAI Runtime API key' -AsSecureString; $Bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure); try{$ApiKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)} }
    if ([string]::IsNullOrWhiteSpace($OrganizationId) -and -not $NonInteractive) { $OrganizationId=Read-Host 'OpenAI Organization ID' }
    if ([string]::IsNullOrWhiteSpace($ApiKey) -or [string]::IsNullOrWhiteSpace($OrganizationId)) { throw 'CREDENTIAL_NOT_CONFIGURED: VGate tunnel credential is unavailable.' }
    [pscustomobject]@{RuntimeApiKey=$ApiKey;OrganizationId=$OrganizationId}
}
