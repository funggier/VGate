[CmdletBinding()]
param(
    [ValidateRange(250,10000)][int]$DelayMilliseconds = 1200,
    [ValidateRange(10,120)][int]$ReadyTimeoutSeconds = 45
)
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$CredentialHelper=Join-Path $Root 'scripts\TunnelCredential.ps1'
$Worker=Join-Path $Root 'scripts\Restart-VGateWorker.ps1'
if (-not (Test-Path -LiteralPath $CredentialHelper)) { throw "Missing $CredentialHelper" }
if (-not (Test-Path -LiteralPath $Worker)) { throw "Missing $Worker" }
. $CredentialHelper
$Credential=Resolve-VGateCredential -Root $Root -NonInteractive
Remove-Variable Credential -ErrorAction SilentlyContinue

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
