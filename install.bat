@echo off
rem Labreporthelp einmalig einrichten: Node.js, Claude Code, Bausteine, Anmeldung
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
echo.
pause
