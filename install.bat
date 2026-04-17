@echo off
setlocal
call "%~dp0installer.bat" %*
exit /b %ERRORLEVEL%
