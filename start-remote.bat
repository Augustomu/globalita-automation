@echo off
title Globalita Dashboard Remoto
echo ============================================
echo   Globalita Dashboard - Acceso Remoto
echo ============================================
echo.

:: Configurar credenciales (cambiar si queres)
set DASH_USER=augusto
set DASH_PASS=globalita2026
set DASH_PORT=3000

echo [1/2] Iniciando dashboard en puerto %DASH_PORT%...
start "Dashboard" cmd /k "cd /d %~dp0 && node dashboard-server.js"

:: Esperar 2 segundos para que el servidor arranque
timeout /t 2 /nobreak >nul

echo [2/2] Iniciando ngrok...
echo.
echo    Credenciales:
echo    Usuario: %DASH_USER%
echo    Pass:    %DASH_PASS%
echo.
echo    Copia la URL publica de ngrok y usala desde el celular.
echo    Ej: https://xxxx-xxxx.ngrok-free.app
echo.
echo ============================================
ngrok http %DASH_PORT%
