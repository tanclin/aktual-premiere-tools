@echo off
setlocal EnableExtensions EnableDelayedExpansion
title AKTUAL Premiere Tools Installer

set "GITHUB_RELEASE_ZIP=https://github.com/tanclin/aktual-premiere-tools/releases/latest/download/TADEJ.SCRIPTS.zip"
set "GITHUB_REG_URL=https://raw.githubusercontent.com/tanclin/aktual-premiere-tools/main/premiereCSXS.reg"
set "GITHUB_WAV_PRESET_URL=https://raw.githubusercontent.com/tanclin/aktual-premiere-tools/main/wav.epr"
set "FFMPEG_ZIP_URL=https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

set "INSTALL_ROOT=%USERPROFILE%\aktual-premiere-tools"
set "DOWNLOADS_DIR=%INSTALL_ROOT%\downloads"
set "TEMP_DIR=%INSTALL_ROOT%\temp"
set "PLUGIN_DIR=%INSTALL_ROOT%\plugin\TADEJ.SCRIPTS"
set "RUNTIME_ROOT=%INSTALL_ROOT%\runtime\whispr"
set "MODELS_DIR=%INSTALL_ROOT%\models"
set "TOOLS_DIR=%INSTALL_ROOT%\tools"
set "FFMPEG_DIR=%TOOLS_DIR%\ffmpeg"
set "FFMPEG_BIN_DIR=%FFMPEG_DIR%\bin"
set "PRESETS_DIR=%INSTALL_ROOT%\presets"
set "CONFIG_DIR=%INSTALL_ROOT%\config"
set "CEP_EXT_DIR=%APPDATA%\Adobe\CEP\extensions\TADEJ.SCRIPTS"

set "RELEASE_ZIP=%DOWNLOADS_DIR%\TADEJ.SCRIPTS.zip"
set "REG_FILE=%CONFIG_DIR%\premiereCSXS.reg"
set "WAV_PRESET_FILE=%PRESETS_DIR%\wav-transcribe.epr"
set "FFMPEG_ZIP=%DOWNLOADS_DIR%\ffmpeg-release-essentials.zip"
set "PLUGIN_EXTRACT_DIR=%TEMP_DIR%\plugin_extract"
set "FFMPEG_EXTRACT_DIR=%TEMP_DIR%\ffmpeg_extract"
set "MODEL_READY_MARKER=%MODELS_DIR%\large-v3.ready"

set "WHISPR_SOURCE=%PLUGIN_DIR%\server\whispr_runtime"
set "VENV_DIR=%RUNTIME_ROOT%\.venv"
set "PYTHON_CMD="
set "FFMPEG_FOUND_PATH="
set "FFMPEG_SOURCE_DIR="

echo ================================
echo AKTUAL PREMIERE TOOLS INSTALLER
echo ================================
echo Root: %INSTALL_ROOT%
echo.

call :ensure_directories || goto :fail
call :close_premiere || goto :fail
call :download_required_assets || goto :fail
call :install_csxs_reg || goto :fail
call :extract_plugin || goto :fail
call :install_plugin_files || goto :fail
call :install_runtime_files || goto :fail
call :install_wav_preset || goto :fail
call :ensure_python || goto :fail
call :ensure_venv || goto :fail
call :ensure_ffmpeg || goto :fail
call :configure_runtime_env || goto :fail
call :install_python_requirements || goto :fail
call :preload_model || goto :fail
call :verify_install || goto :fail

echo.
echo INSTALL COMPLETE
echo Plugin root:   %INSTALL_ROOT%
echo CEP extension: %CEP_EXT_DIR%
echo Runtime root:  %RUNTIME_ROOT%
echo Model cache:   %MODELS_DIR%
echo ffmpeg bin:    %FFMPEG_BIN_DIR%
echo.
pause
exit /b 0

:ensure_directories
echo [1/15] Preparing install directories...
for %%D in ("%INSTALL_ROOT%" "%DOWNLOADS_DIR%" "%TEMP_DIR%" "%INSTALL_ROOT%\plugin" "%INSTALL_ROOT%\runtime" "%MODELS_DIR%" "%TOOLS_DIR%" "%PRESETS_DIR%" "%CONFIG_DIR%") do (
    if not exist "%%~fD" mkdir "%%~fD" >nul 2>&1
    if not exist "%%~fD" (
        echo ERROR: Failed to create directory %%~fD
        exit /b 1
    )
)
exit /b 0

:close_premiere
echo [2/15] Closing Premiere if running...
taskkill /IM "Adobe Premiere Pro.exe" /F >nul 2>&1
exit /b 0

:download_required_assets
echo [3/15] Downloading required installer assets...
call :download_file "%GITHUB_RELEASE_ZIP%" "%RELEASE_ZIP%" "plugin release zip" || exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip='%RELEASE_ZIP%'; $archive=[System.IO.Compression.ZipFile]::OpenRead($zip); try { if($archive.Entries.Count -le 0){ throw 'Zip contains no entries.' } } finally { $archive.Dispose() }"
if errorlevel 1 (
    echo ERROR: Invalid zip downloaded for plugin release zip
    exit /b 1
)
call :download_file "%GITHUB_REG_URL%" "%REG_FILE%" "premiereCSXS.reg" || exit /b 1
call :download_file "%GITHUB_WAV_PRESET_URL%" "%WAV_PRESET_FILE%" "wav-transcribe.epr" || exit /b 1
exit /b 0

:install_csxs_reg
echo [4/15] Importing Premiere CSXS debug registry settings...
reg import "%REG_FILE%" >nul
if errorlevel 1 (
    echo ERROR: Failed to import %REG_FILE%
    exit /b 1
)
exit /b 0

:extract_plugin
echo [5/15] Extracting plugin package...
rmdir /s /q "%PLUGIN_EXTRACT_DIR%" >nul 2>&1
mkdir "%PLUGIN_EXTRACT_DIR%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('%RELEASE_ZIP%', '%PLUGIN_EXTRACT_DIR%')"
if errorlevel 1 (
    echo ERROR: Failed to extract plugin release zip
    exit /b 1
)
if not exist "%PLUGIN_EXTRACT_DIR%\TADEJ.SCRIPTS\index.html" (
    echo ERROR: Extracted plugin package is invalid.
    exit /b 1
)
if not exist "%PLUGIN_EXTRACT_DIR%\TADEJ.SCRIPTS\server\whispr_runtime\main.py" (
    echo ERROR: Extracted plugin package is missing WHISPR runtime main.py.
    exit /b 1
)
exit /b 0

:install_plugin_files
echo [6/15] Installing plugin files...
rmdir /s /q "%PLUGIN_DIR%" >nul 2>&1
robocopy "%PLUGIN_EXTRACT_DIR%\TADEJ.SCRIPTS" "%PLUGIN_DIR%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if %ERRORLEVEL% GEQ 8 (
    echo ERROR: Failed to populate plugin root.
    exit /b 1
)
if not exist "%PLUGIN_DIR%\index.html" (
    echo ERROR: Plugin root missing index.html after install.
    exit /b 1
)

rmdir /s /q "%CEP_EXT_DIR%" >nul 2>&1
robocopy "%PLUGIN_DIR%" "%CEP_EXT_DIR%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if %ERRORLEVEL% GEQ 8 (
    echo ERROR: Failed to install CEP extension files.
    exit /b 1
)
if not exist "%CEP_EXT_DIR%\index.html" (
    echo ERROR: CEP extension install missing index.html.
    exit /b 1
)
exit /b 0

:install_runtime_files
echo [7/15] Installing bundled transcription runtime...
if not exist "%WHISPR_SOURCE%\main.py" (
    echo ERROR: Bundled WHISPR runtime is missing from the plugin package.
    exit /b 1
)
mkdir "%RUNTIME_ROOT%" >nul 2>&1
mkdir "%RUNTIME_ROOT%\jobs" >nul 2>&1
robocopy "%WHISPR_SOURCE%" "%RUNTIME_ROOT%" /E /NFL /NDL /NJH /NJS /NP >nul
if %ERRORLEVEL% GEQ 8 (
    echo ERROR: Failed to copy WHISPR runtime into %RUNTIME_ROOT%
    exit /b 1
)
if not exist "%RUNTIME_ROOT%\main.py" (
    echo ERROR: Runtime install missing main.py
    exit /b 1
)
exit /b 0

:install_wav_preset
echo [8/15] Installing WAV transcription preset...
if not exist "%WAV_PRESET_FILE%" (
    echo ERROR: WAV preset file missing from %WAV_PRESET_FILE%
    exit /b 1
)
exit /b 0

:ensure_python
echo [9/15] Checking Python...
call :set_python_cmd "py -3.11"
if not errorlevel 1 goto :python_ok
call :set_python_cmd "py -3.10"
if not errorlevel 1 goto :python_ok
call :set_python_cmd "py -3"
if not errorlevel 1 goto :python_ok
call :set_python_cmd "python"
if not errorlevel 1 goto :python_ok

echo Python 3.10+ was not found. Trying to install Python 3.11 via winget...
call :install_with_winget "Python.Python.3.11" "Python 3.11" || exit /b 1

call :set_python_cmd "py -3.11"
if not errorlevel 1 goto :python_ok
call :set_python_cmd "py -3.10"
if not errorlevel 1 goto :python_ok
call :set_python_cmd "py -3"
if not errorlevel 1 goto :python_ok
call :set_python_cmd "python"
if not errorlevel 1 goto :python_ok

echo ERROR: Python 3.10+ is still unavailable after install.
exit /b 1

:python_ok
echo Using Python command: %PYTHON_CMD%
exit /b 0

:ensure_venv
echo [10/15] Preparing local Python environment...
if not exist "%VENV_DIR%\Scripts\python.exe" (
    call %PYTHON_CMD% -m venv "%VENV_DIR%" || (
        echo ERROR: Failed to create virtual environment at %VENV_DIR%
        exit /b 1
    )
)
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo ERROR: Virtual environment Python is missing.
    exit /b 1
)
exit /b 0

:ensure_ffmpeg
echo [11/15] Installing portable ffmpeg...
if exist "%FFMPEG_BIN_DIR%\ffmpeg.exe" (
    echo ffmpeg already present in %FFMPEG_BIN_DIR%
    set "FFMPEG_FOUND_PATH=%FFMPEG_BIN_DIR%\ffmpeg.exe"
    exit /b 0
)

call :download_file "%FFMPEG_ZIP_URL%" "%FFMPEG_ZIP%" "ffmpeg portable zip" || exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip='%FFMPEG_ZIP%'; $archive=[System.IO.Compression.ZipFile]::OpenRead($zip); try { if($archive.Entries.Count -le 0){ throw 'Zip contains no entries.' } } finally { $archive.Dispose() }"
if errorlevel 1 (
    echo ERROR: Invalid zip downloaded for ffmpeg portable zip
    exit /b 1
)
rmdir /s /q "%FFMPEG_EXTRACT_DIR%" >nul 2>&1
mkdir "%FFMPEG_EXTRACT_DIR%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('%FFMPEG_ZIP%', '%FFMPEG_EXTRACT_DIR%')"
if errorlevel 1 (
    echo ERROR: Failed to extract ffmpeg portable zip
    exit /b 1
)
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-ChildItem -Path '%FFMPEG_EXTRACT_DIR%' -Filter ffmpeg.exe -Recurse | Select-Object -First 1 -ExpandProperty FullName)"`) do set "FFMPEG_FOUND_PATH=%%I"
if not defined FFMPEG_FOUND_PATH (
    echo ERROR: ffmpeg.exe was not found after extraction.
    exit /b 1
)
mkdir "%FFMPEG_BIN_DIR%" >nul 2>&1
for %%I in ("%FFMPEG_FOUND_PATH%") do set "FFMPEG_SOURCE_DIR=%%~dpI"
if not defined FFMPEG_SOURCE_DIR (
    echo ERROR: Could not resolve ffmpeg source directory.
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Copy-Item -Path '%FFMPEG_SOURCE_DIR%*' -Destination '%FFMPEG_BIN_DIR%' -Recurse -Force"
if errorlevel 1 (
    echo ERROR: Failed to copy ffmpeg binaries into %FFMPEG_BIN_DIR%
    exit /b 1
)
if not exist "%FFMPEG_BIN_DIR%\ffmpeg.exe" (
    echo ERROR: Portable ffmpeg install missing ffmpeg.exe
    exit /b 1
)
set "FFMPEG_FOUND_PATH=%FFMPEG_BIN_DIR%\ffmpeg.exe"
exit /b 0

:configure_runtime_env
echo [12/15] Configuring runtime environment...
set "HF_HOME=%MODELS_DIR%\huggingface"
set "HUGGINGFACE_HUB_CACHE=%HF_HOME%\hub"
set "TRANSFORMERS_CACHE=%HF_HOME%\transformers"
set "XDG_CACHE_HOME=%MODELS_DIR%\.cache"
if not exist "%HF_HOME%" mkdir "%HF_HOME%" >nul 2>&1
if not exist "%HUGGINGFACE_HUB_CACHE%" mkdir "%HUGGINGFACE_HUB_CACHE%" >nul 2>&1
if not exist "%TRANSFORMERS_CACHE%" mkdir "%TRANSFORMERS_CACHE%" >nul 2>&1
if not exist "%XDG_CACHE_HOME%" mkdir "%XDG_CACHE_HOME%" >nul 2>&1
set "PATH=%FFMPEG_BIN_DIR%;%PATH%"
exit /b 0

:install_python_requirements
echo [13/15] Installing Python dependencies...
"%VENV_DIR%\Scripts\python.exe" -c "import faster_whisper, ctranslate2, onnxruntime, tokenizers" >nul 2>&1
if not errorlevel 1 (
    echo Python requirements already installed.
    exit /b 0
)

"%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel || (
    echo ERROR: Failed to upgrade pip tooling.
    exit /b 1
)

set "PIP_ATTEMPT=1"
:pip_retry
"%VENV_DIR%\Scripts\python.exe" -m pip install --prefer-binary --upgrade-strategy only-if-needed -r "%RUNTIME_ROOT%\requirements.txt"
if errorlevel 1 (
    if "%PIP_ATTEMPT%"=="1" (
        echo Retrying Python dependency install...
        set "PIP_ATTEMPT=2"
        timeout /t 3 /nobreak >nul
        goto :pip_retry
    )
    echo ERROR: Failed to install Python requirements.
    exit /b 1
)
exit /b 0

:preload_model
echo [14/15] Downloading / validating transcription model cache...
if exist "%MODEL_READY_MARKER%" (
    echo Transcription model cache already marked ready.
    exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$roots = @('%HF_HOME%','%HUGGINGFACE_HUB_CACHE%','%MODELS_DIR%') | Where-Object { $_ -and (Test-Path -LiteralPath $_) }; foreach ($root in $roots) { $model = Get-ChildItem -LiteralPath $root -Recurse -Filter 'model.bin' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'large-v3|faster-whisper-large-v3|Systran' } | Select-Object -First 1; if ($model) { exit 0 } }; exit 1"
if not errorlevel 1 (
    echo Existing large-v3 model cache found.
    > "%MODEL_READY_MARKER%" echo large-v3 ready
    exit /b 0
)
"%VENV_DIR%\Scripts\python.exe" -c "from faster_whisper import WhisperModel; WhisperModel('large-v3', device='cpu', compute_type='int8'); print('large-v3 ready')" || (
    echo ERROR: Failed to preload the faster-whisper large-v3 model.
    exit /b 1
)
> "%MODEL_READY_MARKER%" echo large-v3 ready
exit /b 0

:verify_install
echo [15/15] Verifying installed files...
if not exist "%PLUGIN_DIR%\index.html" (
    echo ERROR: Plugin root verification failed.
    exit /b 1
)
if not exist "%CEP_EXT_DIR%\index.html" (
    echo ERROR: CEP extension verification failed.
    exit /b 1
)
if not exist "%RUNTIME_ROOT%\main.py" (
    echo ERROR: Runtime verification failed: main.py missing.
    exit /b 1
)
if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo ERROR: Runtime verification failed: venv Python missing.
    exit /b 1
)
if not exist "%FFMPEG_BIN_DIR%\ffmpeg.exe" (
    echo ERROR: Runtime verification failed: ffmpeg missing.
    exit /b 1
)
if not exist "%WAV_PRESET_FILE%" (
    echo ERROR: Runtime verification failed: WAV preset missing.
    exit /b 1
)
if not exist "%REG_FILE%" (
    echo ERROR: Runtime verification failed: premiereCSXS.reg missing.
    exit /b 1
)
"%VENV_DIR%\Scripts\python.exe" -m py_compile "%RUNTIME_ROOT%\config.py" "%RUNTIME_ROOT%\main.py" "%RUNTIME_ROOT%\transcriber.py" "%CEP_EXT_DIR%\server\transcribe_job.py" "%CEP_EXT_DIR%\server\gpu_probe.py" || (
    echo ERROR: Python runtime verification failed.
    exit /b 1
)
exit /b 0

:download_file
set "DOWNLOAD_URL=%~1"
set "DOWNLOAD_TARGET=%~2"
set "DOWNLOAD_LABEL=%~3"
echo - %DOWNLOAD_LABEL%
if exist "%DOWNLOAD_TARGET%" del /f /q "%DOWNLOAD_TARGET%" >nul 2>&1
curl.exe -L --fail --silent --show-error "%DOWNLOAD_URL%" -o "%DOWNLOAD_TARGET%"
if errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest '%DOWNLOAD_URL%' -OutFile '%DOWNLOAD_TARGET%'"
    if errorlevel 1 (
        echo ERROR: Failed to download %DOWNLOAD_LABEL%
        exit /b 1
    )
)
if not exist "%DOWNLOAD_TARGET%" (
    echo ERROR: Downloaded file missing for %DOWNLOAD_LABEL%
    exit /b 1
)
for %%I in ("%DOWNLOAD_TARGET%") do if %%~zI LEQ 0 (
    echo ERROR: Downloaded file is empty for %DOWNLOAD_LABEL%
    exit /b 1
)
exit /b 0

:set_python_cmd
set "PYTHON_CMD=%~1"
call %PYTHON_CMD% -c "import sys; raise SystemExit(0 if sys.version_info[:2] >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 (
    set "PYTHON_CMD="
    exit /b 1
)
exit /b 0

:install_with_winget
where winget >nul 2>&1
if errorlevel 1 (
    echo ERROR: winget is not available, so %~2 could not be installed automatically.
    exit /b 1
)
winget install -e --id %~1 --accept-package-agreements --accept-source-agreements --silent
if errorlevel 1 (
    echo ERROR: Failed to install %~2 via winget.
    exit /b 1
)
exit /b 0

:fail
echo.
echo INSTALL FAILED
pause
exit /b 1
