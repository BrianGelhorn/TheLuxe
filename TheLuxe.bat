@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-native.ps1" -InstallHome "%~dp0."
if errorlevel 1 (
  echo.
  echo No se pudo iniciar TheLuxe. Revisa el mensaje anterior.
  pause
  exit /b 1
)
exit /b 0
