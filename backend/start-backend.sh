#!/bin/bash

# Script to start the FastAPI backend on Linux/Mac

echo ""
echo "================================================"
echo "Backend API - Reportes de Incidencias"
echo "================================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if venv exists, if not create it
if [ ! -d "venv" ]; then
    echo "Creando entorno virtual..."
    if command -v python3 >/dev/null 2>&1; then
        python3 -m venv venv
    else
        python -m venv venv
    fi
fi

# Activate venv
source venv/bin/activate

# Install dependencies if needed
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -q -r requirements.txt

# Start server
echo ""
echo "Iniciando servidor en http://localhost:8000"
echo "Documentacion en http://localhost:8000/docs"
echo ""
echo "Presiona Ctrl+C para detener"
echo ""

python main.py
