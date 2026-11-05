@echo off
rem Wird von "Labreporthelp starten.bat" aus einer Kopie im TEMP-Ordner gestartet,
rem damit die Startdatei selbst ersetzt werden kann. Kopiert die neue Version aus
rem ".update\neu\Labreporthelp" ueber den Programmordner und startet neu.
rem Dateien, die nicht im Paket sind (z. B. ".eingerichtet"), bleiben erhalten.
setlocal
set "APP=%~1"
if "%APP:~-1%"=="\" set "APP=%APP:~0,-1%"
set "NEU=%APP%\.update\neu\Labreporthelp"
echo Neue Version wird installiert ...
ping -n 2 127.0.0.1 >nul
rem Erst alles ausser VERSION.txt, dann VERSION.txt: so wird ein abgebrochenes Update beim naechsten Start wiederholt.
robocopy "%NEU%" "%APP%" /E /R:5 /W:1 /XF VERSION.txt /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto fehler
robocopy "%NEU%" "%APP%" VERSION.txt /R:5 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto fehler
echo Update fertig.
goto weiter
:fehler
echo Das Update konnte nicht komplett kopiert werden (ist Labreporthelp noch in einem anderen Fenster offen?).
echo Beim naechsten Start wird es erneut versucht.
:weiter
rmdir /s /q "%APP%\.update" 2>nul
cd /d "%APP%"
"%APP%\Labreporthelp starten.bat"
