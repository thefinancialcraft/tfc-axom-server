@echo off
title Unblock TFC Relay Agent Files
echo Unblocking Security Zone Identifier on Relay Agent files...
powershell -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File"
echo.
echo =====================================================
echo  SUCCESS: All Relay Agent files unblocked!
echo  Windows Security warning prompts removed.
echo =====================================================
echo.
pause
