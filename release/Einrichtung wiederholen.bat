@echo off
rem Einrichtung erneut ausfuehren, z. B. um dich neu bei Claude anzumelden.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\einrichten.ps1"
echo.
pause
