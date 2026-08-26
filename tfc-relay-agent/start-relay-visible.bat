@echo off
title TFC Axom Hikvision Local Relay Agent (Verbose Live Logs)
cd /d "%~dp0"
color 0A
echo =====================================================
echo  📡 TFC AXOM HIKVISION LOCAL RELAY AGENT (LIVE CMD)
echo =====================================================
echo  Starting standalone relay with live visual logs...
echo.
node standalone-relay.js
echo.
echo =====================================================
echo  ⚠️ Relay process stopped or crashed.
echo =====================================================
pause
