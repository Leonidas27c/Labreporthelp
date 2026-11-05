@echo off
rem Labreporthelp starten. Beim ersten Mal wird Claude Code eingerichtet.
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\bin;%ProgramFiles%\Git\cmd;%PATH%"
if not exist "%~dp0node\node.exe" (
  echo Der Ordner "node" fehlt. Bitte die ZIP-Datei komplett entpacken, nicht nur hineinschauen.
  pause
  exit /b 1
)
rem Auf GitHub nach einer neueren Version schauen (ohne Konto). Exit-Code 10 = neue Version bereit.
if exist "%~dp0scripts\update.mjs" "%~dp0node\node.exe" "%~dp0scripts\update.mjs"
if errorlevel 10 goto update
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
exit /b

:update
rem Den Installer als Kopie aus TEMP starten, damit diese Datei ersetzt werden darf.
copy /y "%~dp0.update\neu\Labreporthelp\scripts\update-installieren.bat" "%TEMP%\labreporthelp-update.bat" >nul
"%TEMP%\labreporthelp-update.bat" "%~dp0"
