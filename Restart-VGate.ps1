[CmdletBinding()]
param([switch]$NonInteractive)
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
& (Join-Path $Root 'Stop-VGate.ps1')
& (Join-Path $Root 'Start-VGate.ps1') -NonInteractive:$NonInteractive
