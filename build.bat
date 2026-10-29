@echo off
rem Double-click: builds dist\asis-keeper.html (single HTML for sharing). See build.ps1 for details.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
if errorlevel 1 echo. & echo BUILD FAILED - see the message above.
echo.
pause
