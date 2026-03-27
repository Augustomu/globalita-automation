@echo off
echo Iniciando dashboard en http://localhost:3000 ...
start "Dashboard" node "%~dp0dashboard-server.js"
timeout /t 2 /nobreak >nul
start http://localhost:3000
echo Dashboard iniciado. Abriendo en el navegador...
echo.
echo Cuando termines, cerrá esta ventana para detener el dashboard.
pause
