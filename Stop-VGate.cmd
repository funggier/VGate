@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-VGate.ps1" %*
exit /b %ERRORLEVEL%
