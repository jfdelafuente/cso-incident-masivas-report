# 📘 Manual de Operador — Reportes de Incidencias

Guía de referencia para **operar, monitorizar y mantener** la aplicación desplegada en producción.

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — Guía completa de arquitectura y opciones de despliegue (1 clic con PowerShell, `deploy.sh` y manual).
- [`backend/README.md`](backend/README.md) — Catálogo de endpoints de API, modelos, contratos de integración y esquemas.
- [`CLAUDE.md`](CLAUDE.md) — Arquitectura interna del código para desarrollo y mantenimiento.

---

## 1. Datos del Entorno

| Parámetro | Valor de Producción / Staging |
|---|---|
| Servidor / Host | `AOTLXPRBOA00001` (`10.132.26.96` / `10.132.68.85`) |
| Usuario de ejecución | `infocodes` (uid=2001) — **sin root, sin sudo, sin systemd** |
| URL pública de la aplicación | `http://infocodes.si.orange.es:8081/reportes-incidencias` |
| Directorio del proyecto | `/infocodes/project/cso-incident-masivas-report` |
| Backend API | FastAPI + Uvicorn en puerto **8000** (interno) |
| Nginx (modular) | `/infocodes/nginx/` (sitio en `conf/conf.d/cso-incident.conf`) |
| Base de datos SQLite | `/infocodes/var/data/cso-incident-masivas-report/reports.db` |
| Almacén PPTX Ejecutivos | `/infocodes/var/storage/executive_pptx/` (compartido con Gestión de Problemas) |
| Archivo de PID | `/infocodes/var/run/cso-backend.pid` |
| Copias de seguridad (backups) | `/infocodes/var/backups/cso-incident-masivas-report/` |
| Directorio de Logs | `/infocodes/logs/cso-incident-masivas-report/` |

> ⚠️ **Proxy corporativo**: La sesión del servidor tiene variables `http_proxy`/`https_proxy` activas. Cualquier comando `curl` manual contra `localhost` o `127.0.0.1` debe incluir `--noproxy '*'`. Los scripts del sistema (`service.sh`, `maintenance.sh`, `deploy-production.ps1`) ya lo gestionan internamente.

---

## 2. Operación Rutinaria del Backend

El backend se gestiona mediante el script [`backend/service.sh`](backend/service.sh):

| Comando | Acción |
|---|---|
| `./service.sh status` | Verifica si el proceso está vivo, consulta el PID y valida el healthcheck. |
| `./service.sh start` | Arranca el backend en segundo plano si no está en ejecución. |
| `./service.sh stop` | Detiene el backend de forma ordenada (SIGTERM; SIGKILL tras 10s si no responde). |
| `./service.sh restart` | Detiene el servicio y vuelve a arrancarlo de forma limpia. |

**Ubicaciones asociadas:**
- Log en vivo: `/infocodes/logs/cso-incident-masivas-report/backend.log`
- PID en ejecución: `/infocodes/var/run/cso-backend.pid`

**Verificación directa de salud:**
```bash
# Sonda de liveness (proceso respondiendo):
curl --noproxy '*' http://localhost:8000/healthz

# Sonda de readiness (base de datos y motor PPTX listos):
curl --noproxy '*' http://localhost:8000/readyz
```

---

## 3. Desplegar una Actualización

### Vía PowerShell (Desde Windows — Recomendado)

Desde la raíz del repositorio en tu equipo local:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1
```

Este script automatiza de forma atómica y segura:
1. Empaquetado standalone en `dist/cso-incident-backend.tar.gz` (1.5 MB, sin `.git` ni tests).
2. Transferencia segura por SCP a `/tmp/` en el servidor.
3. Backup preventivo automático de la base de datos `reports.db`.
4. Extracción en release aislada inmutable: `/infocodes/project/cso-incident-masivas-report/releases/<TIMESTAMP>/`.
5. Enlace simbólico a los recursos persistentes compartidos (`shared/venv` y `shared/.env`).
6. Instalación modular de `cso-incident.conf` en Nginx (`nginx -t` y `nginx -s reload`).
7. Conmutación atómica del enlace simbólico: `current -> releases/<TIMESTAMP>`.
8. Reinicio del backend (`current/backend/service.sh restart`).
9. Comprobación de sondas de salud `/api/health` y `/readyz`.

### Vía Servidor Linux (SSH)

Conectado a la máquina por SSH:
```bash
cd /infocodes/project/cso-incident-masivas-report

# Inspeccionar versión activa y estado de salud:
./status.sh
```

> 🛡️ **Seguridad Nginx y Despliegue Aislado**: Gracias a la arquitectura modular `conf.d/cso-incident.conf` y al despliegue inmutable por releases, no se modifican repositorios Git en caliente ni se altera la configuración global de Nginx. Las aplicaciones hermanas (`/problemas`, `/dashboards`, `/api/epsilon/`) quedan totalmente aisladas de cualquier cambio.

---

## 4. Deshacer un Despliegue (Rollback)

Si un despliegue reciente introduce errores o comportamientos inesperados:

### Opción Rápida con PowerShell (Windows)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1 -Rollback
```
*(Conmuta instantáneamente `current` a la release previa y reinicia el servicio en ~1s)*.

### Opción en el Servidor (Linux)

**1. Revertir el código/release:**
```bash
cd /infocodes/project/cso-incident-masivas-report
./rollback.sh
```
El script detectará la release previa en el directorio `releases/`, conmutará el symlink atómico `current` y reiniciará el backend automáticamente.

**2. Revertir los datos (solo si la base de datos se vio afectada):**
```bash
cd /infocodes/project/cso-incident-masivas-report/current/backend
./maintenance.sh restore
```
El script mostrará la lista de backups disponibles numerados para que elijas el más reciente antes del incidente.

---

## 5. Copias de Seguridad (Backups)

El script `maintenance.sh backup` genera un backup consistente de la base de datos SQLite utilizando el **Online Backup API** (seguro en caliente sin bloquear las lecturas o escrituras activas).

- **Directorio de backups:** `/infocodes/var/backups/cso-incident-masivas-report/`
- **Nomenclatura:** `reports_YYYYmmdd_HHMMSS.db`
- **Rotación:** Conserva automáticamente los **últimos 7** backups.

**Generar un backup manual inmediato:**
```bash
cd /infocodes/project/cso-incident-masivas-report/current/backend
./maintenance.sh backup
```

**Configuración en Cron (Usuario `infocodes`):**
```bash
crontab -e
# Backup diario a las 02:00 AM:
0 2 * * * bash /infocodes/project/cso-incident-masivas-report/current/backend/maintenance.sh backup >> /infocodes/logs/cso-incident-masivas-report/maintenance.log 2>&1
# Rotación semanal de logs los sábados a las 02:10 AM:
10 2 * * 6 bash /infocodes/project/cso-incident-masivas-report/current/backend/maintenance.sh rotate-logs >> /infocodes/logs/cso-incident-masivas-report/maintenance.log 2>&1
```

**Listar copias existentes:**
```bash
ls -lht /infocodes/var/backups/cso-incident-masivas-report/
```

---

## 6. Restaurar una Copia de Seguridad

Para recuperar el estado de `reports.db` a una fecha/hora anterior:

```bash
cd /infocodes/project/cso-incident-masivas-report/current/backend
./maintenance.sh restore
```

El asistente interactivo ejecutará los siguientes pasos protegidos:
1. Detiene el backend de forma ordenada (`service.sh stop`).
2. Genera un **snapshot de seguridad preventivo** del fichero actual (`reports.db.before-restore.<timestamp>`).
3. Sobrescribe `/infocodes/var/data/cso-incident-masivas-report/reports.db` con la copia seleccionada.
4. Ejecuta `PRAGMA integrity_check` para verificar la consistencia del archivo restaurado.
5. Vuelve a iniciar el backend (`service.sh start`) y valida su respuesta.

---

## 7. Rotación y Gestión de Logs

El archivo de log principal es `/infocodes/logs/cso-incident-masivas-report/backend.log`.

**Rotación manual bajo demanda:**
```bash
cd /infocodes/project/cso-incident-masivas-report/backend
./maintenance.sh rotate-logs
```

El script utiliza el método **copy-truncate**:
- Copia el contenido a `backend.log.1` (desplazando las rotaciones previas hasta 8).
- Vacía el log activo en el mismo inodo sin necesidad de reiniciar el servicio FastAPI.
- Solo rota si el fichero supera 10 KB.

**Cron semanal recomendado (domingos a las 03:00 AM):**
```bash
0 3 * * 0 /infocodes/project/cso-incident-masivas-report/backend/maintenance.sh rotate-logs >> /infocodes/logs/cso-incident-masivas-report/maintenance.log 2>&1
```

---

## 8. Diagnóstico y Chequeo de Salud Completo

Para revisar el estado global del sistema de forma integral:

```bash
cd /infocodes/project/cso-incident-masivas-report/backend
./maintenance.sh healthcheck
```

Este chequeo valida:
1. **Estado del proceso backend**: PID en `/infocodes/var/run/cso-backend.pid` y respuesta a `/healthz`.
2. **Readiness del servicio**: Sonda `/readyz` (conexión a SQLite y motor PPTX).
3. **Servidor Nginx**: Proceso maestro de `/infocodes/nginx/sbin/nginx` activo.
4. **Espacio en disco**: Partición `/infocodes` (alerta si ≥80%, crítico si ≥95%).
5. **Integridad de base de datos**: `PRAGMA integrity_check` en `reports.db` y recuento de registros.
6. **Tamaño del log**: Alerta si `backend.log` excede 50 MB.
7. **Antigüedad de backups**: Alerta si el último backup tiene más de 7 días.

---

## 9. Resolución de Problemas Frecuentes

### Puerto 8000 Ocupado o Proceso Huérfano
- **Síntoma**: `service.sh start` indica que el puerto 8000 ya está en uso.
- **Diagnóstico y solución**:
  ```bash
  # Identificar qué proceso tiene el puerto 8000:
  lsof -i :8000
  # Verificar si pertenece a este backend:
  tr '\0' ' ' < /proc/<PID>/cmdline; echo
  # Detener de forma ordenada:
  kill <PID>
  ./service.sh start
  ```

### Sondas o `curl` fallan con HTTP 403 Forbidden
- **Causa**: Proxy corporativo interceptando conexiones hacia `localhost`.
- **Solución**: Añadir siempre `--noproxy '*'`:
  ```bash
  curl --noproxy '*' http://localhost:8000/readyz
  ```

### Nginx falla en el reload tras modificar configuración
- **Diagnóstico**:
  ```bash
  /infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t
  ```
- **Solución**: Revisa los errores sintácticos en `/infocodes/nginx/conf/conf.d/cso-incident.conf`. Recuerda que el `nginx.conf` principal incluye automáticamente todos los archivos `.conf` de esa carpeta.

### Los Dashboards Hermanos no descargan el PPTX
- **Diagnóstico**: Comprueba la sonda de readiness del motor PPTX:
  ```bash
  curl --noproxy '*' http://localhost:8000/readyz
  ```
  Debe devolver `"executiveReportEngine": "available"`.
- Comprueba que el directorio compartido exista y tenga permisos:
  ```bash
  ls -la /infocodes/var/storage/executive_pptx/
  ```

---

## 10. Referencia Rápida de Comandos

```bash
# --- OPERACIÓN BACKEND ---
cd /infocodes/project/cso-incident-masivas-report/backend
./service.sh status                 # Estado y PID
./service.sh restart                # Reinicio del backend
curl --noproxy '*' http://localhost:8000/readyz  # Sonda de readiness

# --- DESPLIEGUE ---
# Desde Windows:
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1
# Desde Linux:
cd /infocodes/project/cso-incident-masivas-report && bash deploy.sh

# --- MANTENIMIENTO Y SALUD ---
cd /infocodes/project/cso-incident-masivas-report/backend
./maintenance.sh healthcheck        # Chequeo integral
./maintenance.sh backup             # Backup inmediato
./maintenance.sh restore            # Asistente de restauración
./maintenance.sh rotate-logs        # Rotación de logs

# --- NGINX (Usuario infocodes) ---
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t          # Test
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload   # Reload

# --- MONITOREO DE LOGS ---
tail -f /infocodes/logs/cso-incident-masivas-report/backend.log
tail -f /infocodes/var/log/nginx/infocodes.access.log | grep reportes
```
