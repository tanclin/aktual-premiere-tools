@echo off
title AKTUAL Installer

echo ==========================
echo AKTUAL PREMIERE INSTALLER
echo ==========================

:: 🔧 SETTINGS
set DOWNLOAD_URL=https://github.com/tanclin/aktual-premiere-tools/releases/latest/download/TADEJ.SCRIPTS.zip
set TEMP_ZIP=%TEMP%\aktual.zip
set TEMP_DIR=%TEMP%\aktual_extract
set EXT_DIR=%APPDATA%\Adobe\CEP\extensions\TADEJ.SCRIPTS

echo.
echo Closing Premiere (if running)...
taskkill /IM "Adobe Premiere Pro.exe" /F >nul 2>&1

echo.
echo Downloading latest version...
powershell -Command "Invoke-WebRequest '%DOWNLOAD_URL%' -OutFile '%TEMP_ZIP%'"

if not exist "%TEMP_ZIP%" (
    echo ❌ Download failed
    pause
    exit
)

echo.
echo Extracting...
rmdir /s /q "%TEMP_DIR%" >nul 2>&1
mkdir "%TEMP_DIR%"

powershell -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"

echo.
echo Removing old version...
rmdir /s /q "%EXT_DIR%" >nul 2>&1

echo Installing...
xcopy /E /I /Y "%TEMP_DIR%\TADEJ.SCRIPTS" "%EXT_DIR%" >nul

echo.
echo ✅ INSTALL COMPLETE
echo Location:
echo %EXT_DIR%

pause