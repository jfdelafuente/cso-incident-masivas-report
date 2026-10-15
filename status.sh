#!/bin/bash
# ==============================================================================
# Consulta de estado del Backend CSO Incident
# ==============================================================================
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -L "$APP_DIR/current" ] && [ -x "$APP_DIR/current/backend/service.sh" ]; then
    echo "Release activa: $(readlink "$APP_DIR/current" 2>/dev/null || echo 'desconocida')"
    exec "$APP_DIR/current/backend/service.sh" status
elif [ -x "$APP_DIR/backend/service.sh" ]; then
    exec "$APP_DIR/backend/service.sh" status
else
    echo "ERROR: No se encuentra service.sh"
    exit 1
fi

