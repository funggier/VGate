@echo off
setlocal
set "_vgate_hold=1"
if /i "%~1"=="--no-hold" set "_vgate_hold=0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Status-VGate.ps1"
set "_vgate_rc=%errorlevel%"

if "%_vgate_hold%"=="1" (
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Hold-VGateConsole.ps1"
)

exit /b %_vgate_rc%
