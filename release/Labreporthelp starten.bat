@echo off
rem Labreporthelp starten. Beim ersten Mal wird Claude Code eingerichtet.
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\bin;%ProgramFiles%\Git\cmd;%PATH%"
if not exist "%~dp0node\node.exe" (
  echo Der Ordner "node" fehlt. Bitte die ZIP-Datei komplett entpacken, nicht nur hineinschauen.
  pause
  exit /b 1
)
if not exist "%~dp0.eingerichtet" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\einrichten.ps1"
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo.
echo Labreporthelp startet. Der Browser oeffnet sich gleich.
echo Dieses Fenster offen lassen, solange du arbeitest.
echo.
"%~dp0node\node.exe" "%~dp0server\standalone.mjs"
pause
