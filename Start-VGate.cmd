@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-VGate.ps1" %*
exit /b %ERRORLEVEL%
