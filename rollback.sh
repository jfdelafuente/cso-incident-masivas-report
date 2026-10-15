#!/bin/bash
# ==============================================================================
# Rollback instantáneo de CSO Incident Masivas Report Backend
# Cambia el symlink "current" a la release previa en releases/ y reinicia el servicio.
# ==============================================================================
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
RELEASES_DIR="$APP_DIR/releases"
CURRENT_LINK="$APP_DIR/current"
TARGET_RELEASE="$1"

cd "$APP_DIR"

if [ -d "$RELEASES_DIR" ]; then
    ACTIVE_RELEASE=""
    if [ -L "$CURRENT_LINK" ]; then
        ACTIVE_TARGET="$(readlink "$CURRENT_LINK" 2>/dev/null || true)"
        ACTIVE_RELEASE="$(basename "$ACTIVE_TARGET")"
    fi

    if [ -n "$TARGET_RELEASE" ]; then
        PREV_RELEASE="$TARGET_RELEASE"
    else
        PREV_RELEASE=""
        for rel in $(ls -1 "$RELEASES_DIR" 2>/dev/null | sort); do
            if [ -f "$RELEASES_DIR/$rel/backend/main.py" ]; then
                if [ "$rel" != "$ACTIVE_RELEASE" ]; then
                    PREV_RELEASE="$rel"
                fi
            fi
        done
    fi

    if [ -n "$PREV_RELEASE" ] && [ -f "$RELEASES_DIR/$PREV_RELEASE/backend/main.py" ]; then
        echo "=========================================================="
        echo "↺ Ejecutando Rollback Atómico por Symlink (Backend CSO)"
        echo "  Release anterior : ${ACTIVE_RELEASE:-N/A}"
        echo "  Release destino  : $PREV_RELEASE"
        echo "=========================================================="

        # Asegurar symlink de venv compartido si existe
        if [ -d "$APP_DIR/shared/venv" ]; then
            ln -sfn "$APP_DIR/shared/venv" "$RELEASES_DIR/$PREV_RELEASE/backend/venv"
        fi

        # Cambio atómico del symlink current
        ln -sfn "releases/$PREV_RELEASE" "$CURRENT_LINK"

        # Restaurar snippet Nginx de esa release si aplica
        if [ -f "$CURRENT_LINK/nginx/conf.d/cso-incident.conf" ] && [ -d "/infocodes/nginx/conf/conf.d" ]; then
            cp -f "$CURRENT_LINK/nginx/conf.d/cso-incident.conf" "/infocodes/nginx/conf/conf.d/cso-incident.conf"
            /infocodes/nginx/sbin/nginx -t 2>/dev/null && /infocodes/nginx/sbin/nginx -s reload 2>/dev/null || true
        fi

        # Sincronizar scripts de control en el directorio raíz
        for script in service.sh maintenance.sh; do
            if [ -f "$CURRENT_LINK/backend/$script" ]; then
                cp -f "$CURRENT_LINK/backend/$script" "$APP_DIR/backend/$script" 2>/dev/null || true
            fi
        done

        # Reiniciar backend apuntando al nuevo current
        "$CURRENT_LINK/backend/service.sh" restart
        echo "✓ Rollback completado con éxito a release $PREV_RELEASE"
        exit 0
    fi
fi

echo "ERROR: No se encontró una release previa válida en $RELEASES_DIR"
exit 1

