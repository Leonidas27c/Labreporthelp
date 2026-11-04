@echo off
rem Labreporthelp als MCP-Server in Claude Desktop eintragen.
cd /d "%~dp0"
"%~dp0node\node.exe" "%~dp0scripts\claude-desktop.mjs"
echo.
pause
