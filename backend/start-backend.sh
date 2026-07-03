#!/bin/bash

# Script to start the FastAPI backend on Linux/Mac

echo ""
echo "================================================"
echo "Backend API - Reportes de Incidencias"
echo "================================================"
echo ""

# Check if venv exists, if not create it
if [ ! -d "venv" ]; then
    echo "Creando entorno virtual..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies if needed
pip install -q -r requirements.txt

# Start server
echo ""
echo "Iniciando servidor en http://localhost:8000"
echo "Documentacion en http://localhost:8000/docs"
echo ""
echo "Presiona Ctrl+C para detener"
echo ""

python main.py
