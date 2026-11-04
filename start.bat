@echo off
rem Labreporthelp starten und im Browser oeffnen. Fenster offen lassen, solange du arbeitest.
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\bin;%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte zuerst install.bat ausfuehren.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Labreporthelp ist noch nicht eingerichtet. Bitte zuerst install.bat ausfuehren.
  pause
  exit /b 1
)
rem Bei jedem Start neu bauen, damit nach einem Update nicht die alte Fassung laeuft
echo Labreporthelp wird vorbereitet ...
call npm install --prefer-offline --no-audit --no-fund >nul 2>nul
call npm run build >nul
if errorlevel 1 (
  echo Vorbereiten ist fehlgeschlagen. Bitte install.bat noch einmal ausfuehren.
  pause
  exit /b 1
)
echo.
echo Labreporthelp laeuft unter http://localhost:5173
echo Zum Beenden dieses Fenster schliessen.
echo.
call npm run preview -- --port 5173 --strictPort --open
pause
