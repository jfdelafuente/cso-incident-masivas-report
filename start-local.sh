#!/bin/bash

# Script para lanzar la app localmente en Linux/Mac/WSL
# Ejecuta el servidor Python HTTP en puerto 8080

echo ""
echo "================================================"
echo "Generador de Reportes de Incidencias - LOCAL"
echo "================================================"
echo ""

cd "$(dirname "$0")/app"

echo "Iniciando servidor en http://localhost:8080"
echo ""
echo "Presiona Ctrl+C para detener el servidor"
echo ""

if command -v python3 >/dev/null 2>&1; then
    python3 -m http.server 8080
elif command -v python >/dev/null 2>&1; then
    python -m http.server 8080
else
    echo "Error: No se encontró Python (python3 o python) en el sistema." >&2
    exit 1
fi
