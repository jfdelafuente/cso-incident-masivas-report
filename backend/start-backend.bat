@echo off
REM Script to start the FastAPI backend on Windows

echo.
echo ================================================
echo Backend API - Reportes de Incidencias
echo ================================================
echo.

REM Check if venv exists, if not create it
if not exist "venv" (
    echo Creando entorno virtual...
    python -m venv venv
)

REM Activate venv
call venv\Scripts\activate.bat

REM Install dependencies if needed
pip install -q -r requirements.txt

REM Start server
echo.
echo Iniciando servidor en http://localhost:8000
echo Documentacion en http://localhost:8000/docs
echo.
echo Presiona Ctrl+C para detener
echo.

python main.py
pause
