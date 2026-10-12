@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Status-VGate.ps1" %*
exit /b %ERRORLEVEL%
