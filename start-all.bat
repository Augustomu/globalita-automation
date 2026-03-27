@echo off
REM ============================================================
REM  Sub Gerente — Arranque completo
REM  1. Inicia el dashboard
REM  2. Lanza Chrome con debug port
REM  3. Abre el dashboard en el navegador
REM ============================================================

echo Instalando dependencias si faltan...
call npm install playwright express 2>nul
echo.

echo Iniciando dashboard en http://localhost:3000 ...
start "Dashboard" cmd /k "node dashboard-server.js"
timeout /t 2 /nobreak >nul

echo Abriendo dashboard en el navegador...
start http://localhost:3000
timeout /t 1 /nobreak >nul

echo Cerrando Chrome para relanzar con debug port...
taskkill /IM chrome.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo Lanzando Chrome - Inversores ES (puerto 9222)...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --profile-directory="Default" ^
  --user-data-dir="C:\Users\augus\AppData\Local\Google\Chrome\User Data" ^
  --no-first-run --no-default-browser-check

echo.
echo ============================================================
echo  AHORA:
echo  1. En Chrome: ve a LinkedIn ^> Mi red ^> Invitaciones ^> Enviadas
echo  2. Scrollea hasta las invitaciones mas antiguas
echo  3. Volvé acá y presioná cualquier tecla
echo ============================================================
echo.
pause

echo Ejecutando agente Inversores ES...
start "Inversores ES" cmd /k "node agent-inversores.js"

echo.
echo Todo corriendo. Controlá desde: http://localhost:3000
pause
