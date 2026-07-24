#!/bin/bash

# Tareas de mantenimiento del backend: backup, restore, rotación de logs y
# chequeo de salud rápido.
# Uso: ./maintenance.sh {backup|restore [fichero]|rotate-logs|healthcheck}
#
# - backup: copia de seguridad de reports.db con el Online Backup API de
#   SQLite (segura aunque el backend esté escribiendo, a diferencia de un
#   simple `cp`), verificada con integrity_check, con retención automática.
# - restore: restaura reports.db desde un backup, con snapshot de seguridad
#   del fichero actual y parada/arranque ordenados del backend.
# - rotate-logs: copy-truncate de backend.log, seguro sin reiniciar el
#   backend porque su descriptor de fichero en modo append sigue apuntando
#   al mismo inodo tras el truncado.
# - healthcheck: backend, nginx, disco, integridad de la BD, tamaño de logs
#   y antigüedad del último backup, en un único vistazo.
#
# Todas las operaciones de SQLite (backup, integrity_check, recuento de
# filas) se hacen con `python3 -c ...` usando el módulo `sqlite3` de la
# librería estándar, NO con el binario `sqlite3` de línea de comandos --
# en el servidor de producción existe en /infocodes/sqlite3/bin, pero no
# está en el $PATH por defecto, así que depender de él exigiría o bien
# codificar esa ruta concreta aquí, o bien confiar en que el $PATH de
# quien ejecute el script (a mano o por cron) lo incluya. `python3` ya es
# una dependencia obligatoria del propio backend (service.sh lo usa para
# arrancar la app) y su `sqlite3` va integrado en el intérprete estándar
# de CPython sin paquetes adicionales, así que evita ese problema por
# completo.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
source "$SCRIPT_DIR/lib.sh"

DB_FILE="$SCRIPT_DIR/reports.db"
LOG_DIR="/infocodes/logs/cso-incident-masivas-report"
LOG_FILE="$LOG_DIR/backend.log"
BACKUP_DIR="/infocodes/backups/cso-incident-masivas-report"

BACKUP_RETENTION=7
LOG_ROTATE_RETENTION=8
LOG_MIN_SIZE_BYTES=10240
DISK_WARN_PCT=80
DISK_FAIL_PCT=95
LOG_SIZE_WARN_BYTES=52428800
BACKUP_STALE_WARN_DAYS=8

mkdir -p "$LOG_DIR"

file_size() {
    stat -c%s "$1" 2>/dev/null || echo 0
}

# Copia $1 (origen) en $2 (destino) usando el Online Backup API de SQLite
# vía el módulo estándar de Python -- consistente aunque el backend esté
# escribiendo en ese momento, igual que haría `sqlite3 origen ".backup destino"`.
sqlite_backup() {
    python3 -c "
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
src.close()
dst.close()
" "$1" "$2"
}

# Imprime el resultado de PRAGMA integrity_check sobre el fichero $1 (normalmente "ok").
sqlite_integrity_check() {
    python3 -c "
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
print(conn.execute('PRAGMA integrity_check;').fetchone()[0])
conn.close()
" "$1" 2>&1
}

# Imprime el número de filas de la tabla reports del fichero $1.
sqlite_count_reports() {
    python3 -c "
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
print(conn.execute('SELECT COUNT(*) FROM reports;').fetchone()[0])
conn.close()
" "$1" 2>&1
}

backup() {
    mkdir -p "$BACKUP_DIR"

    if [ ! -f "$DB_FILE" ]; then
        log_error "No existe $DB_FILE, nada que respaldar"
        return 1
    fi

    local dest
    dest="$BACKUP_DIR/reports_$(date +%Y%m%d_%H%M%S).db"

    log_info "Creando backup: $dest"
    if ! sqlite_backup "$DB_FILE" "$dest"; then
        log_error "Fallo al ejecutar el backup"
        rm -f "$dest"
        return 1
    fi

    local check
    check="$(sqlite_integrity_check "$dest")"
    if [ "$check" != "ok" ]; then
        log_error "El backup generado no pasa integrity_check: $check"
        rm -f "$dest"
        return 1
    fi

    log_success "Backup OK ($(du -h "$dest" 2>/dev/null | cut -f1)): $dest"

    ls -1t "$BACKUP_DIR"/reports_*.db 2>/dev/null | tail -n +"$((BACKUP_RETENTION + 1))" | xargs -r rm --
    log_info "Backups conservados: $(ls -1 "$BACKUP_DIR"/reports_*.db 2>/dev/null | wc -l)/$BACKUP_RETENTION"
}

restore() {
    local chosen="${1:-}"

    if [ -z "$chosen" ]; then
        log_info "Backups disponibles en $BACKUP_DIR:"
        ls -1t "$BACKUP_DIR"/reports_*.db 2>/dev/null | nl
        echo
        read -r -p "Número de la lista (o ruta completa) del backup a restaurar: " chosen
        if [[ "$chosen" =~ ^[0-9]+$ ]]; then
            chosen="$(ls -1t "$BACKUP_DIR"/reports_*.db 2>/dev/null | sed -n "${chosen}p")"
        fi
    fi

    if [ -z "$chosen" ] || [ ! -f "$chosen" ]; then
        log_error "No existe el fichero de backup indicado"
        return 1
    fi

    read -r -p "¿Confirmar restauración de '$chosen' sobre $DB_FILE? Esto parará el backend. [s/N] " confirm
    if [[ ! "$confirm" =~ ^[sS]$ ]]; then
        log_warn "Cancelado"
        return 1
    fi

    log_info "Deteniendo backend..."
    "$SCRIPT_DIR/service.sh" stop

    if [ -f "$DB_FILE" ]; then
        local snap
        snap="$BACKUP_DIR/reports.db.before-restore.$(date +%Y%m%d_%H%M%S)"
        cp "$DB_FILE" "$snap"
        log_info "Snapshot de seguridad del reports.db actual: $snap"
    fi

    cp "$chosen" "$DB_FILE"

    local check
    check="$(sqlite_integrity_check "$DB_FILE")"
    if [ "$check" != "ok" ]; then
        log_error "El fichero restaurado NO pasa integrity_check: $check"
        log_error "Restaura el snapshot de seguridad de arriba o prueba otro backup antes de arrancar el backend"
        return 1
    fi

    log_success "Restauración OK (integrity_check: ok)"
    log_info "Arrancando backend..."
    "$SCRIPT_DIR/service.sh" start
}

rotate_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        log_warn "No existe $LOG_FILE, nada que rotar"
        return 0
    fi

    local size
    size="$(file_size "$LOG_FILE")"
    if [ "$size" -lt "$LOG_MIN_SIZE_BYTES" ]; then
        log_info "backend.log tiene $size bytes (por debajo del mínimo configurado), no se rota"
        return 0
    fi

    local i
    for i in 7 6 5 4 3 2 1; do
        [ -f "$LOG_FILE.$i" ] && mv "$LOG_FILE.$i" "$LOG_FILE.$((i + 1))"
    done
    cp "$LOG_FILE" "$LOG_FILE.1"
    : > "$LOG_FILE"

    ls -1t "$LOG_FILE".[0-9]* 2>/dev/null | tail -n +"$((LOG_ROTATE_RETENTION + 1))" | xargs -r rm --

    log_success "backend.log rotado a backend.log.1 (el proceso sigue escribiendo sin reiniciarse)"
}

healthcheck() {
    local fails=0 warns=0

    log_info "=== Backend ==="
    if ! "$SCRIPT_DIR/service.sh" status; then
        fails=$((fails + 1))
    fi

    log_info "=== Nginx ==="
    if ps -ef 2>/dev/null | grep -q '[n]ginx: master process'; then
        log_success "Proceso master de nginx activo"
    else
        log_error "No se encuentra el proceso master de nginx"
        fails=$((fails + 1))
    fi

    log_info "=== Disco (/infocodes) ==="
    local pct
    pct="$(df -P /infocodes 2>/dev/null | awk 'NR==2 { gsub("%","",$(NF-1)); print $(NF-1) }')"
    if [ -z "$pct" ]; then
        log_warn "No se pudo determinar el uso de disco de /infocodes"
        warns=$((warns + 1))
    elif [ "$pct" -ge "$DISK_FAIL_PCT" ]; then
        log_error "Disco al ${pct}% (umbral de fallo ${DISK_FAIL_PCT}%)"
        fails=$((fails + 1))
    elif [ "$pct" -ge "$DISK_WARN_PCT" ]; then
        log_warn "Disco al ${pct}% (umbral de aviso ${DISK_WARN_PCT}%)"
        warns=$((warns + 1))
    else
        log_success "Disco al ${pct}%"
    fi

    log_info "=== Integridad de la base de datos ==="
    if [ -f "$DB_FILE" ]; then
        local check
        check="$(sqlite_integrity_check "$DB_FILE")"
        if [ "$check" = "ok" ]; then
            local n
            n="$(sqlite_count_reports "$DB_FILE")"
            log_success "integrity_check: ok ($n informes)"
        else
            log_error "integrity_check falló: $check"
            fails=$((fails + 1))
        fi
    else
        log_error "No existe $DB_FILE"
        fails=$((fails + 1))
    fi

    log_info "=== Tamaño de backend.log ==="
    if [ -f "$LOG_FILE" ]; then
        local lsize
        lsize="$(file_size "$LOG_FILE")"
        if [ "$lsize" -ge "$LOG_SIZE_WARN_BYTES" ]; then
            log_warn "backend.log pesa $(du -h "$LOG_FILE" 2>/dev/null | cut -f1), considera ./maintenance.sh rotate-logs"
            warns=$((warns + 1))
        else
            log_success "backend.log: $(du -h "$LOG_FILE" 2>/dev/null | cut -f1)"
        fi
    else
        log_warn "No existe backend.log"
    fi

    log_info "=== Último backup ==="
    local last
    last="$(ls -1t "$BACKUP_DIR"/reports_*.db 2>/dev/null | head -1)"
    if [ -z "$last" ]; then
        log_error "No hay ningún backup en $BACKUP_DIR"
        fails=$((fails + 1))
    else
        local age_days
        age_days=$(( ($(date +%s) - $(stat -c%Y "$last" 2>/dev/null || echo 0)) / 86400 ))
        if [ "$age_days" -ge "$BACKUP_STALE_WARN_DAYS" ]; then
            log_warn "Backup más reciente tiene $age_days día(s): $last"
            warns=$((warns + 1))
        else
            log_success "Backup más reciente: $last ($age_days día(s))"
        fi
    fi

    echo
    if [ "$fails" -gt 0 ]; then
        log_error "Resumen: $fails fallo(s), $warns aviso(s)"
        return 1
    elif [ "$warns" -gt 0 ]; then
        log_warn "Resumen: 0 fallos, $warns aviso(s)"
        return 0
    else
        log_success "Resumen: todo OK"
        return 0
    fi
}

case "${1:-}" in
    backup)      backup ;;
    restore)     restore "${2:-}" ;;
    rotate-logs) rotate_logs ;;
    healthcheck) healthcheck ;;
    *)
        echo "Uso: $0 {backup|restore [fichero]|rotate-logs|healthcheck}"
        exit 1
        ;;
esac
