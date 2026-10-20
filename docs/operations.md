# 📘 Manual de Operaciones y Mantenimiento

Guía para **operar, monitorizar y mantener** el servicio en producción en el servidor `AOTLXPRBOA00001` (`infocodes@10.132.26.96` / `10.132.68.85:8081`).

---

## 1. Ficha del Entorno

| Parámetro | Valor de Producción |
|---|---|
| Servidor / Host | `AOTLXPRBOA00001` (`10.132.26.96` / `10.132.68.85`) |
| Usuario de ejecución | `infocodes` (uid=2001) — **sin root, sin sudo, sin systemd** |
| URL del Portal | `http://infocodes.si.orange.es:8081/dashboards/reportes-incidencias/` |
| URL Redirección | `http://infocodes.si.orange.es:8081/reportes-incidencias` (301) |
| Backend API | FastAPI en puerto interno **8000** |
| Nginx (modular) | `/infocodes/nginx/` (sitio en `conf/conf.d/cso-incident.conf`) |
| Release Activa | `/infocodes/project/cso-incident-masivas-report/current` |
| Base de datos SQLite | `/infocodes/var/data/cso-incident-masivas-report/reports.db` |
| Almacén PPTX Ejecutivos | `/infocodes/var/storage/executive_pptx/` |
| Archivo de PID | `/infocodes/var/run/cso-backend.pid` |
| Backups automáticos | `/infocodes/var/backups/cso-incident-masivas-report/` |
| Directorio de Logs | `/infocodes/var/log/cso-incident-masivas-report/` |

---

## 2. Gestión del Proceso Backend (`service.sh`)

Al no disponer de `systemd` ni privilegios `root`, el servicio se gestiona mediante [`backend/service.sh`](../backend/service.sh):

```bash
cd /infocodes/project/cso-incident-masivas-report/current/backend

./service.sh status   # Estado del proceso, PID y healthcheck
./service.sh start    # Arrancar en segundo plano si está detenido
./service.sh stop     # Parada ordenada (SIGTERM; SIGKILL tras 10s)
./service.sh restart  # Reinicio limpio
```

- **Log en vivo**:
  ```bash
  tail -f /infocodes/var/log/cso-incident-masivas-report/backend.log
  ```
- **Sondas de verificación manual**:
  ```bash
  curl --noproxy '*' http://localhost:8000/healthz
  curl --noproxy '*' http://localhost:8000/readyz
  ```

---

## 3. Mantenimiento y Backups en Caliente (`maintenance.sh`)

El script [`backend/maintenance.sh`](../backend/maintenance.sh) proporciona utilidades seguras para el ciclo de vida de datos:

```bash
cd /infocodes/project/cso-incident-masivas-report/current/backend

# 1. Copia de seguridad en caliente (usa la API SQLite Online Backup, segura en producción)
./maintenance.sh backup

# 2. Restaurar la base de datos a partir del último backup
./maintenance.sh restore

# 3. Rotar logs (copytruncate de backend.log sin reiniciar el servicio)
./maintenance.sh rotate-logs

# 4. Chequeo integral de salud (proceso, nginx, disco, integridad SQLite y backups)
./maintenance.sh healthcheck
```

### Configuración en Crontab (usuario `infocodes`):
```cron
# Backup diario a las 02:00 manteniendo los últimos 7
0 2 * * * /infocodes/project/cso-incident-masivas-report/current/backend/maintenance.sh backup >> /infocodes/var/log/cso-incident-masivas-report/maintenance.log 2>&1

# Rotación semanal de logs los domingos a las 03:00
0 3 * * 0 /infocodes/project/cso-incident-masivas-report/current/backend/maintenance.sh rotate-logs >> /infocodes/var/log/cso-incident-masivas-report/maintenance.log 2>&1
```

---

## 4. Resolución de Problemas (Troubleshooting)

### Error 502 / 504 Bad Gateway
1. Verifica si el backend está activo:
   ```bash
   /infocodes/project/cso-incident-masivas-report/current/backend/service.sh status
   ```
2. Si está caído, revisa las últimas líneas del log:
   ```bash
   tail -n 60 /infocodes/var/log/cso-incident-masivas-report/backend.log
   /infocodes/project/cso-incident-masivas-report/current/backend/service.sh start
   ```

### Falso Negativo 403 Forbidden al hacer `curl` en el servidor
- **Causa**: Las variables `http_proxy`/`https_proxy` en la sesión de terminal redirigen llamadas a `localhost` hacia el proxy corporativo saliente.
- **Solución**: Añadir siempre `--noproxy '*'`:
  ```bash
  curl --noproxy '*' http://127.0.0.1:8000/readyz
  ```

### Nginx falla al recargar (`nginx -t` error)
- Revisa el fichero modular `conf.d/cso-incident.conf`:
  ```bash
  /infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t
  ```

### Base de datos bloqueada (`database is locked`)
1. Detecta procesos que mantengan bloqueos abiertos:
   ```bash
   fuser /infocodes/var/data/cso-incident-masivas-report/reports.db
   ```
2. Reinicia el proceso backend para liberar conexiones zombis:
   ```bash
   /infocodes/project/cso-incident-masivas-report/current/backend/service.sh restart
   ```

