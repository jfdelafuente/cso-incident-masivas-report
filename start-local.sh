#!/bin/bash

# Script para lanzar el backend de Reportes de Incidencias en Linux/Mac/WSL
# Ejecuta el servidor FastAPI / Uvicorn en el puerto 8000

echo ""
echo "========================================================"
echo " Reportes de Incidencias - SERVICIO BACKEND API (Local)"
echo "========================================================"
echo ""
echo " API Documentation: http://localhost:8000/docs"
echo " Health check:      http://localhost:8000/api/health"
echo ""
echo " Nota: El frontend oficial se encuentra centralizado en"
echo "       release-dashboard-application (puerto 8081 / 8089)"
echo ""
echo "Presiona Ctrl+C para detener el servidor"
echo ""

cd "$(dirname "$0")/backend"

if [ -f "venv/bin/python" ]; then
    echo "Usando entorno virtual (venv)..."
    venv/bin/python main.py
elif command -v python3 >/dev/null 2>&1; then
    python3 main.py
elif command -v python >/dev/null 2>&1; then
    python main.py
else
    echo "Error: No se encontró Python en el sistema." >&2
    exit 1
fi
