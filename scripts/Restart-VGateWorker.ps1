[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Root,
    [ValidateRange(250,10000)][int]$DelayMilliseconds = 1200,
    [ValidateRange(10,120)][int]$ReadyTimeoutSeconds = 45
)
$ErrorActionPreference='Stop'
$Runtime=Join-Path $Root 'runtime'
$Logs=Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $Runtime,$Logs | Out-Null
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$Log=Join-Path $Logs "restart-$Stamp.log"

function Write-RestartLog([string]$Message) {
    Add-Content -LiteralPath $Log -Value ("[{0}] {1}" -f ([DateTimeOffset]::Now.ToString('o')),$Message)
}

try {
    Start-Sleep -Milliseconds $DelayMilliseconds
    Write-RestartLog 'Stopping current VGate tunnel.'
    & (Join-Path $Root 'Stop-VGate.ps1') *>> $Log

    Write-RestartLog 'Starting VGate tunnel non-interactively.'
    & (Join-Path $Root 'Start-VGate.ps1') -NonInteractive *>> $Log

    $Deadline=(Get-Date).AddSeconds($ReadyTimeoutSeconds)
    $Status=1
    do {
        Start-Sleep -Milliseconds 500
        & (Join-Path $Root 'Status-VGate.ps1') *>> $Log
        $Status=$LASTEXITCODE
    } while ($Status -ne 0 -and (Get-Date) -lt $Deadline)

    if ($Status -ne 0) {
        throw "VGate did not become healthy within $ReadyTimeoutSeconds seconds."
    }
    Write-RestartLog 'VGate restart qualification PASS.'
} catch {
    Write-RestartLog ("VGate restart FAILED: " + $_.Exception.Message)
    exit 1
}
