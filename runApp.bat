

@echo off
setlocal
title Ti3D Server
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is missing. Please install from nodejs.org
    pause
    exit /b
)

echo Starting Ti3D Server...
echo Open Chrome to: http://localhost:8080/public/index.html
@REM start "Ti3D Server" /min npm start
start "Ti3D Server" cmd /k "npm start"

timeout /t 3 /nobreak >nul
set "URL=http://localhost:8080/public/index.html"
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="%URL%"
) else (
    start "" "%URL%"
)