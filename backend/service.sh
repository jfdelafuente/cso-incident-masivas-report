#!/bin/bash

# Gestión robusta del proceso backend (FastAPI/uvicorn)
# Uso: ./service.sh {start|stop|restart|status}
#
# - Usa PID file pero también verifica procesos main.py acotados a este SCRIPT_DIR
#   para evitar dejar procesos huérfanos tras recargas o arranques manuales.
# - Detección agnóstica de puerto ocupado mediante socket nativo de Python
#   (no depende de si el servidor tiene lsof, ss o netstat instalados).
# - En producción fuerza RELOAD=false para evitar subprocesos worker huérfanos.
# - Verificación estricta de salud post-arranque que comprueba que el nuevo PID
#   sigue con vida, evitando falsos positivos de procesos residuales antiguos.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
source "$SCRIPT_DIR/lib.sh"

PORT="${BACKEND_PORT:-8000}"
PID_FILE="$SCRIPT_DIR/backend.pid"
LOG_DIR="/infocodes/logs/cso-incident-masivas-report"
LOG_FILE="$LOG_DIR/backend.log"
HEALTH_URL="http://localhost:$PORT/api/health"
PYTHON_BIN="$SCRIPT_DIR/venv/bin/python3"
HEALTH_RETRIES=15
HEALTH_INTERVAL=1
STOP_TIMEOUT=10

pid_from_file() {
    [ -f "$PID_FILE" ] && cat "$PID_FILE" 2>/dev/null
}

# Comprueba si un proceso sigue vivo y pertenece a main.py
is_our_process() {
    local pid="$1"
    [ -z "$pid" ] && return 1
    kill -0 "$pid" 2>/dev/null || return 1
    if [ -r "/proc/$pid/cmdline" ]; then
        tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "main.py"
    else
        ps -p "$pid" -o command= 2>/dev/null | grep -q "main.py"
    fi
}

# Comprueba si el puerto responde a conexiones locales (socket nativo de Python)
port_is_listening() {
    local port="$1"
    if [ -x "$PYTHON_BIN" ]; then
        "$PYTHON_BIN" -c "import socket, sys; s = socket.socket(); s.settimeout(0.5); sys.exit(0 if s.connect_ex(('127.0.0.1', int(sys.argv[1]))) == 0 else 1)" "$port" 2>/dev/null
    else
        python3 -c "import socket, sys; s = socket.socket(); s.settimeout(0.5); sys.exit(0 if s.connect_ex(('127.0.0.1', int(sys.argv[1]))) == 0 else 1)" "$port" 2>/dev/null
    fi
}

# Busca procesos python que estén ejecutando main.py específicamente desde este SCRIPT_DIR
find_project_main_pids() {
    local p
    for p in $(pgrep -f "main.py" 2>/dev/null || true); do
        [ -z "$p" ] && continue
        if [ -d "/proc/$p" ]; then
            local proc_cwd
            proc_cwd="$(readlink -f "/proc/$p/cwd" 2>/dev/null || true)"
            if [ "$proc_cwd" = "$SCRIPT_DIR" ]; then
                echo "$p"
            fi
        fi
    done
}

# Localiza PIDs que están escuchando en el puerto indicado (si hay herramientas de red)
find_pids_on_port() {
    local port="$1"
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti ":$port" 2>/dev/null || true
    elif command -v fuser >/dev/null 2>&1; then
        fuser "$port/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -v '^$' || true
    elif command -v ss >/dev/null 2>&1; then
        ss -lptn "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true
    fi
}

is_running() {
    local pid
    pid="$(pid_from_file)"
    if [ -n "$pid" ] && is_our_process "$pid"; then
        return 0
    fi
    local extra_pids
    extra_pids="$(find_project_main_pids)"
    [ -n "$extra_pids" ]
}

wait_for_health() {
    local attempt=1
    while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
        if curl -sf --noproxy '*' "$HEALTH_URL" > /dev/null 2>&1; then
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

    # Si matplotlib y dependencias ya están instaladas, evitar invocar pip innecesariamente
    if "$PYTHON_BIN" -c "import matplotlib, fastapi, uvicorn" >/dev/null 2>&1; then
        return 0
    fi

    log_info "Instalando/actualizando dependencias..."

    # Detectar proxy corporativo (git config o variables de entorno del servidor)
    local proxy_url
    proxy_url="$(git config --get http.proxy 2>/dev/null || true)"
    if [ -z "$proxy_url" ]; then
        proxy_url="${https_proxy:-${HTTPS_PROXY:-${http_proxy:-${HTTP_PROXY:-}}}}"
    fi

    local proxy_opts=()
    if [ -n "$proxy_url" ]; then
        proxy_opts=(--proxy "$proxy_url")
    fi

    # Ejecutar pip aislando NO_PROXY para evitar que impida alcanzar PyPI a través del proxy
    (
        unset NO_PROXY no_proxy
        "$SCRIPT_DIR/venv/bin/pip" install \
            "${proxy_opts[@]}" \
            --trusted-host pypi.org \
            --trusted-host pypi.python.org \
            --trusted-host files.pythonhosted.org \
            -q -r requirements.txt
    ) || {
        log_warn "No se pudieron actualizar dependencias vía pip. Continuando con las instaladas..."
    }
}

stop() {
    local pid
    pid="$(pid_from_file)"
    local any_killed=0

    # 1. Parar por PID file si está vivo
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        log_info "Deteniendo backend principal (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        any_killed=1
    fi

    # 2. Parar cualquier otro proceso main.py de este proyecto (huérfanos o manuales)
    local extra_pids
    extra_pids="$(find_project_main_pids)"
    for ep in $extra_pids; do
        if [ "$ep" != "$pid" ] && kill -0 "$ep" 2>/dev/null; then
            log_info "Deteniendo proceso residual o huérfano (PID $ep)..."
            kill "$ep" 2>/dev/null || true
            any_killed=1
        fi
    done

    # 3. Esperar que finalicen y se libere el puerto
    local waited=0
    while [ "$waited" -lt "$STOP_TIMEOUT" ]; do
        local still_alive=0
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            still_alive=1
        fi
        for ep in $extra_pids; do
            if kill -0 "$ep" 2>/dev/null; then
                still_alive=1
            fi
        done
        if [ "$still_alive" -eq 0 ] && ! port_is_listening "$PORT"; then
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done

    # 4. Si aún no han salido tras STOP_TIMEOUT, forzar SIGKILL (-9)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        log_warn "Proceso $pid no respondió a SIGTERM, forzando con SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
    fi
    extra_pids="$(find_project_main_pids)"
    for ep in $extra_pids; do
        if kill -0 "$ep" 2>/dev/null; then
            log_warn "Proceso residual $ep forzado con SIGKILL"
            kill -9 "$ep" 2>/dev/null || true
        fi
    done

    # 5. Si el puerto sigue ocupado por algún proceso residual de este directorio
    if port_is_listening "$PORT"; then
        local port_pids
        port_pids="$(find_pids_on_port "$PORT")"
        for pp in $port_pids; do
            [ -z "$pp" ] && continue
            local cwd
            cwd="$(readlink -f "/proc/$pp/cwd" 2>/dev/null || true)"
            if [ "$cwd" = "$SCRIPT_DIR" ]; then
                log_warn "Liberando puerto $PORT ocupado por PID $pp (SIGKILL)..."
                kill -9 "$pp" 2>/dev/null || true
            fi
        done
        sleep 1
    fi

    rm -f "$PID_FILE"

    if port_is_listening "$PORT"; then
        log_warn "El puerto $PORT aún parece ocupado. Podría pertenecer a otro servicio ajeno."
    else
        if [ "$any_killed" -eq 1 ]; then
            log_success "Backend detenido y puerto $PORT liberado"
        else
            log_info "Backend ya estaba detenido (puerto $PORT libre)"
        fi
    fi
}

start() {
    export RELOAD="${RELOAD:-false}"

    # 1. Comprobar si ya está corriendo con PID válido
    if is_running; then
        log_warn "El backend ya está corriendo (PID $(pid_from_file))"
        return 0
    fi

    # 2. Si el puerto está ocupado antes de empezar
    if port_is_listening "$PORT"; then
        local extra_pids
        extra_pids="$(find_project_main_pids)"
        if [ -n "$extra_pids" ]; then
            log_warn "Puerto $PORT ocupado por proceso residual de este proyecto. Limpiando antes de iniciar..."
            stop
            sleep 1
        else
            log_error "El puerto $PORT ya está en uso por otro proceso desconocido. Revísalo antes de continuar."
            return 1
        fi
    fi

    rm -f "$PID_FILE"
    ensure_venv
    mkdir -p "$LOG_DIR"

    log_info "Iniciando backend (puerto $PORT, RELOAD=$RELOAD)..."
    nohup "$PYTHON_BIN" main.py >> "$LOG_FILE" 2>&1 &
    local pid=$!
    disown "$pid" 2>/dev/null
    echo "$pid" > "$PID_FILE"

    log_info "Esperando healthcheck en $HEALTH_URL..."
    if wait_for_health; then
        # Verificación estricta: asegurar que el PID recién creado es el que está vivo
        if kill -0 "$pid" 2>/dev/null; then
            log_success "Backend corriendo (PID $pid) - $HEALTH_URL"
            return 0
        else
            log_error "El healthcheck respondió pero el nuevo proceso (PID $pid) terminó inesperadamente. Últimas líneas del log:"
            tail -n 30 "$LOG_FILE" 2>/dev/null
            rm -f "$PID_FILE"
            return 1
        fi
    else
        log_error "El backend no respondió tras $((HEALTH_RETRIES * HEALTH_INTERVAL))s. Últimas líneas del log:"
        tail -n 30 "$LOG_FILE" 2>/dev/null
        kill -9 "$pid" 2>/dev/null || true
        rm -f "$PID_FILE"
        return 1
    fi
}

restart() {
    log_info "Reiniciando backend..."
    stop
    sleep 1
    start
}

status() {
    local pid
    pid="$(pid_from_file)"
    if [ -n "$pid" ] && is_our_process "$pid"; then
        log_success "Backend corriendo (PID $pid)"
        if curl -sf --noproxy '*' "$HEALTH_URL" > /dev/null 2>&1; then
            log_success "Healthcheck OK - $HEALTH_URL"
            return 0
        else
            log_error "El proceso está vivo pero el healthcheck falla"
            return 1
        fi
    else
        local extra_pids
        extra_pids="$(find_project_main_pids)"
        if [ -n "$extra_pids" ]; then
            log_warn "Backend corriendo sin PID file sincronizado (PIDs: $extra_pids)"
            return 0
        fi
        log_warn "Backend no está corriendo"
        return 1
    fi
}

case "${1:-}" in
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    status)  status ;;
    *)
        echo "Uso: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
