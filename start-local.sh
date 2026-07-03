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

python -m http.server 8080
