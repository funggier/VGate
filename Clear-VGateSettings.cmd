@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Clear-VGateSettings.ps1" %*
exit /b %ERRORLEVEL%
