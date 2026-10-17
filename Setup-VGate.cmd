@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-VGate.ps1" %*
exit /b %ERRORLEVEL%
