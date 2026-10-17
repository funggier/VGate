[CmdletBinding()]
param(
    [ValidateRange(250,10000)][int]$DelayMilliseconds = 1200,
    [ValidateRange(10,120)][int]$ReadyTimeoutSeconds = 45
)

$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$CredentialHelper=Join-Path $Root 'scripts\TunnelCredential.ps1'
$ConnectionHelper=Join-Path $Root 'scripts\TunnelConnectionSettings.ps1'
$Worker=Join-Path $Root 'scripts\Restart-VGateWorker.ps1'

foreach ($Required in @($CredentialHelper,$ConnectionHelper,$Worker)) {
    if (-not (Test-Path -LiteralPath $Required -PathType Leaf)) {
        throw "Missing VGate restart helper: $Required"
    }
}
. $CredentialHelper
. $ConnectionHelper

$ConnectionSettings=$null
try { $ConnectionSettings=Get-VGateConnectionSettings -Root $Root } catch {}
if (-not $ConnectionSettings) {
    throw 'RESTART_CONNECTION_NOT_CONFIGURED: Tunnel ID, Organization ID, and health port are not configured. Run Setup-VGate.cmd first.'
}

$CredentialStatus=Get-VGateCredentialStatus -Root $Root
if (-not $CredentialStatus.exists -or -not $CredentialStatus.decrypt_pass -or -not $CredentialStatus.runtime_api_key_configured) {
    throw 'RESTART_CREDENTIAL_NOT_CONFIGURED: A decryptable VGate Runtime API key is required. Run Setup-VGate.cmd first.'
}

function Quote-Ps([string]$Value) { "'" + ($Value -replace "'","''") + "'" }
$PowerShell=(Get-Command powershell.exe -ErrorAction Stop).Source
$Command="& {0} -Root {1} -DelayMilliseconds {2} -ReadyTimeoutSeconds {3}" -f (Quote-Ps $Worker),(Quote-Ps $Root),$DelayMilliseconds,$ReadyTimeoutSeconds
$Encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
$CommandLine=('"{0}" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {1}' -f $PowerShell,$Encoded)

$Startup=([WmiClass]'Win32_ProcessStartup').CreateInstance()
$Startup.ShowWindow=0
$Result=([WmiClass]'Win32_Process').Create($CommandLine,$Root,$Startup)
if ([int]$Result.ReturnValue -ne 0 -or [int]$Result.ProcessId -le 0) {
    throw "RESTART_SCHEDULE_FAILED: Win32_Process.Create returned $($Result.ReturnValue)."
}
Write-Host "VGate restart scheduled (worker PID $($Result.ProcessId))."
Write-Host "The current VGate tunnel will disconnect after approximately $DelayMilliseconds ms and reconnect automatically."
