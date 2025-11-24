@REM @echo off
@REM setlocal
@REM title Ti3D Server

@REM :: 1. Move to script directory
@REM cd /d "%~dp0"

@REM :: 2. Start Server via NPM
@REM :: This runs the "start" command we defined in package.json
@REM echo Starting Ti3D...
@REM start "Ti3D Server" /min npm start

@REM :: 3. Wait a moment for connection
@REM timeout /t 3 /nobreak >nul

@REM :: 4. Launch Chrome in App Mode
@REM set "URL=http://localhost:8080/public/index.html"
@REM if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
@REM     start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="%URL%"
@REM ) else (
@REM     start "" "%URL%"
@REM )

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
start "Ti3D Server" /min npm start

timeout /t 3 /nobreak >nul
set "URL=http://localhost:8080/public/index.html"
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="%URL%"
) else (
    start "" "%URL%"
)