@echo off
REM Script para lanzar el backend de Reportes de Incidencias localmente en Windows
REM Ejecuta el servidor FastAPI / Uvicorn en el puerto 8000

echo.
echo ========================================================
echo  Reportes de Incidencias - SERVICIO BACKEND API (Local)
echo ========================================================
echo.
echo  API Documentation: http://localhost:8000/docs
echo  Health check:      http://localhost:8000/api/health
echo.
echo  Nota: El frontend oficial se encuentra centralizado en
echo        release-dashboard-application (puerto 8081 / 8089)
echo.
echo Presiona Ctrl+C para detener el servidor
echo.

cd /d "%~dp0backend"

if exist venv\Scripts\python.exe (
    echo Usando entorno virtual (venv)...
    venv\Scripts\python.exe main.py
) else (
    echo Usando Python del sistema...
    python main.py
)

pause
