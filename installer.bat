@echo off
setlocal
call "%~dp0install.bat" %*
exit /b %ERRORLEVEL%
