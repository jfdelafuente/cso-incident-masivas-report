#!/bin/bash

# Gestión robusta del proceso backend (FastAPI/uvicorn)
# Uso: ./service.sh {start|stop|restart|status}
#
# - Usa un PID file en vez de "pkill -f main.py": en un servidor compartido,
#   matar por nombre de proceso puede afectar a otras apps Python que corran
#   con el mismo nombre de script.
# - No inicia si el puerto ya está ocupado por un proceso desconocido.
# - Espera activamente al healthcheck (con reintentos) en vez de un sleep fijo,
#   y si falla, muestra el log y deja el sistema limpio (sin proceso zombie).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${BACKEND_PORT:-8000}"
PID_FILE="$SCRIPT_DIR/backend.pid"
LOG_FILE="$SCRIPT_DIR/backend.log"
HEALTH_URL="http://localhost:$PORT/api/health"
PYTHON_BIN="$SCRIPT_DIR/venv/bin/python3"
HEALTH_RETRIES=15
HEALTH_INTERVAL=1
STOP_TIMEOUT=10

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}i  $1${NC}"; }
log_success() { echo -e "${GREEN}OK $1${NC}"; }
log_error()   { echo -e "${RED}!! $1${NC}"; }
log_warn()    { echo -e "${YELLOW}?? $1${NC}"; }

pid_from_file() {
    [ -f "$PID_FILE" ] && cat "$PID_FILE" 2>/dev/null
}

# Comprueba que el PID sigue vivo Y que realmente es nuestro backend
# (evita matar/confundir procesos ajenos que hayan reciclado el mismo PID)
is_our_process() {
    local pid="$1"
    [ -z "$pid" ] && return 1
    if [ -r "/proc/$pid/cmdline" ]; then
        tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "main.py"
    else
        ps -p "$pid" -o command= 2>/dev/null | grep -q "main.py"
    fi
}

is_running() {
    is_our_process "$(pid_from_file)"
}

wait_for_health() {
    local attempt=1
    while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
        if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            return 0
        fi
        sleep "$HEALTH_INTERVAL"
        attempt=$((attempt + 1))
    done
    return 1
}

ensure_venv() {
    if [ ! -x "$PYTHON_BIN" ]; then
        log_info "Creando entorno virtual..."
        python3 -m venv venv
    fi
    log_info "Instalando/actualizando dependencias..."
    "$SCRIPT_DIR/venv/bin/pip" install -q -r requirements.txt
}

start() {
    if is_running; then
        log_warn "El backend ya está corriendo (PID $(pid_from_file))"
        return 0
    fi

    if command -v lsof > /dev/null 2>&1 && lsof -i ":$PORT" -sTCP:LISTEN > /dev/null 2>&1; then
        log_error "El puerto $PORT ya está en uso por otro proceso. Revísalo antes de continuar:"
        lsof -i ":$PORT" -sTCP:LISTEN
        return 1
    fi

    rm -f "$PID_FILE"
    ensure_venv

    log_info "Iniciando backend..."
    nohup "$PYTHON_BIN" main.py >> "$LOG_FILE" 2>&1 &
    local pid=$!
    disown "$pid" 2>/dev/null
    echo "$pid" > "$PID_FILE"

    log_info "Esperando healthcheck en $HEALTH_URL..."
    if wait_for_health; then
        log_success "Backend corriendo (PID $pid) - $HEALTH_URL"
        return 0
    else
        log_error "El backend no respondió tras $((HEALTH_RETRIES * HEALTH_INTERVAL))s. Últimas líneas del log:"
        tail -n 30 "$LOG_FILE" 2>/dev/null
        kill "$pid" 2>/dev/null
        rm -f "$PID_FILE"
        return 1
    fi
}

stop() {
    local pid
    pid="$(pid_from_file)"

    if ! is_our_process "$pid"; then
        log_warn "El backend no está corriendo (o el PID registrado ya no es válido)"
        rm -f "$PID_FILE"
        return 0
    fi

    log_info "Deteniendo backend (PID $pid)..."
    kill "$pid"
    local waited=0
    while [ "$waited" -lt "$STOP_TIMEOUT" ] && is_our_process "$pid"; do
        sleep 1
        waited=$((waited + 1))
    done

    if is_our_process "$pid"; then
        log_warn "El proceso no respondió a SIGTERM, forzando con SIGKILL"
        kill -9 "$pid" 2>/dev/null
    fi

    rm -f "$PID_FILE"
    log_success "Backend detenido"
}

status() {
    local pid
    pid="$(pid_from_file)"
    if is_our_process "$pid"; then
        log_success "Backend corriendo (PID $pid)"
        if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            log_success "Healthcheck OK - $HEALTH_URL"
        else
            log_error "El proceso está vivo pero el healthcheck falla"
            return 1
        fi
    else
        log_warn "Backend no está corriendo"
        return 1
    fi
}

case "${1:-}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    *)
        echo "Uso: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
