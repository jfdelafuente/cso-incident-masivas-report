# 📘 Manual de Operador — Reportes de Incidencias

Guía de referencia para **operar y mantener** la aplicación ya desplegada. No cubre la instalación inicial ni la arquitectura del código — para eso:

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — despliegue manual paso a paso, referencia completa.
- [`STAGING_DEPLOYMENT.md`](STAGING_DEPLOYMENT.md) — flujo real de despliegue en staging con `deploy.sh`.
- [`CLAUDE.md`](CLAUDE.md) — arquitectura del código, para quien vaya a tocar el backend/frontend.

Está pensado para un uso **poco frecuente**: prioriza comandos listos para copiar y pegar sobre explicaciones largas. Si vuelves a este documento tras semanas sin tocar el sistema, ve directo a la sección 9 (referencia rápida).

---

## 1. Antes de empezar

| Dato | Valor |
|---|---|
| Usuario del servidor | `infocodes` (uid=2001) — **sin root, sin sudo, sin systemd** |
| Ruta de despliegue | `/infocodes/project/cso-incident-masivas-report` |
| Backend | `.../backend`, FastAPI/uvicorn en el puerto **8000** (interno) |
| Nginx | Instalación propia en `/infocodes/nginx` (binario, config y logs propios, no el paquete del sistema) |
| URL pública | `http://infocodes.si.orange.es:8081/reportes-incidencias` |
| Base de datos | SQLite, fichero `backend/reports.db`, tabla `reports` |

⚠️ **Proxy corporativo**: la shell del servidor tiene `http_proxy`/`https_proxy` activas, y `curl` las respeta incluso para `localhost`, devolviendo `403 Forbidden`. Cualquier `curl` manual contra `localhost`/`127.0.0.1` debe llevar `--noproxy '*'`. Los scripts de este repo (`service.sh`, `maintenance.sh`) ya lo hacen internamente.

---

## 2. Operación rutinaria del backend

Todo con [`backend/service.sh`](backend/service.sh):

| Comando | Cuándo usarlo |
|---|---|
| `./service.sh status` | Comprobación rápida: ¿está vivo y responde? |
| `./service.sh start` | Arrancarlo si está parado (no hace nada si ya corre) |
| `./service.sh stop` | Pararlo de forma ordenada (SIGTERM, luego SIGKILL si no responde en 10s) |
| `./service.sh restart` | Tras un cambio de configuración o código, o si algo va mal |

Logs en `backend/backend.log`, PID en `backend/backend.pid` (ambos fuera de git). Si `start`/`restart` fallan diciendo que el puerto 8000 ya está ocupado por otro proceso, **no lo mates a ciegas** — ver sección 8 ("Proceso huérfano en el puerto 8000").

---

## 3. Desplegar una actualización

```bash
cd /infocodes/project/cso-incident-masivas-report
bash deploy.sh
```

Por dentro, [`deploy.sh`](deploy.sh) hace (en este orden): `git pull`, instala/actualiza dependencias del backend, inicializa la BD si hiciera falta (no destructivo si ya existe), hace backup de `nginx.conf` y aplica el del repo (con **rollback automático** si `nginx -t` falla), reinicia el backend vía `service.sh restart`, y verifica que el frontend esté en su sitio. Detalle completo en [`STAGING_DEPLOYMENT.md`](STAGING_DEPLOYMENT.md).

⚠️ **`nginx.conf` es compartido** con otras apps del servidor (`/static`, `/dashboards`, `/data`). Si sospechas que alguien lo editó a mano en el servidor sin pasar por el repo, compara antes de confiar en el rollback automático:
```bash
diff /infocodes/nginx/conf/nginx.conf /infocodes/project/cso-incident-masivas-report/nginx.conf
```

---

## 4. Copias de seguridad

`maintenance.sh backup` hace una copia consistente de `reports.db` (usa el Online Backup API de SQLite, seguro aunque el backend esté escribiendo en ese momento — no un simple `cp`), la verifica con `PRAGMA integrity_check`, y se guarda en:

```
/infocodes/backups/cso-incident-masivas-report/reports_YYYYmmdd_HHMMSS.db
```

Se conservan automáticamente los **últimos 7** backups (se borran los más antiguos en cada ejecución). Esa carpeta está **fuera del árbol del repo**, así que un `git clean` o un redeploy no puede tocarla.

**Backup manual, bajo demanda** (por ejemplo antes de un despliegue delicado):
```bash
cd /infocodes/project/cso-incident-masivas-report/backend
./maintenance.sh backup
```

**Backup automático diario** — añadir al crontab del propio usuario `infocodes` (no requiere root):
```bash
crontab -l                       # revisa primero qué hay ya, para no perderlo
crontab -e                       # y añade esta línea:
15 2 * * * /infocodes/project/cso-incident-masivas-report/backend/maintenance.sh backup >> /infocodes/project/cso-incident-masivas-report/backend/maintenance.log 2>&1
```

**Ver los backups disponibles:**
```bash
ls -lht /infocodes/backups/cso-incident-masivas-report/
```

---

## 5. Restaurar una copia de seguridad

Para emergencias: recuperar el estado de `reports.db` a un momento anterior.

```bash
cd /infocodes/project/cso-incident-masivas-report/backend
./maintenance.sh restore
```

Sin argumentos, lista los backups disponibles numerados y pide elegir uno (o pasa la ruta completa directamente como `./maintenance.sh restore /ruta/al/backup.db`). El proceso, una vez confirmas:

1. Para el backend (`service.sh stop`).
2. Guarda un **snapshot de seguridad** del `reports.db` actual (`reports.db.before-restore.<fecha>`, en la misma carpeta de backups) — por si el restore fue un error.
3. Copia el backup elegido sobre `reports.db`.
4. Verifica la integridad del fichero restaurado antes de continuar.
5. Vuelve a arrancar el backend (`service.sh start`, que valida el healthcheck).

**Deshacer una restauración equivocada**: vuelve a ejecutar `./maintenance.sh restore` y elige el fichero `reports.db.before-restore.<fecha>` más reciente.

---

## 6. Rotación de logs

`backend/backend.log` se abre en modo *append* y **nunca se rota solo** — crece indefinidamente mientras el backend esté vivo.

```bash
cd /infocodes/project/cso-incident-masivas-report/backend
./maintenance.sh rotate-logs
```

Hace *copy-truncate*: copia `backend.log` a `backend.log.1` (desplazando las rotaciones anteriores) y luego vacía `backend.log` sin borrarlo. **Es seguro sin reiniciar el backend**: el proceso mantiene abierto el fichero original en modo *append*, así que al vaciarlo simplemente sigue escribiendo desde el principio, sin perder el descriptor de fichero. Solo rota si `backend.log` supera 10KB (evita rotaciones vacías en semanas de poco uso). Se conservan las últimas 8 rotaciones.

**Cron semanal recomendado** (domingo de madrugada):
```bash
0 3 * * 0 /infocodes/project/cso-incident-masivas-report/backend/maintenance.sh rotate-logs >> /infocodes/project/cso-incident-masivas-report/backend/maintenance.log 2>&1
```

**Consultar un log rotado**: `tail -f backend/backend.log.1`, etc. — son ficheros de texto normales.

**`maintenance.log`** (la salida de las propias tareas de cron, no confundir con `backend.log`) crece muy despacio — un par de líneas por semana. No hace falta rotarlo; si algún día molesta, se puede truncar a mano sin ningún riesgo (`: > backend/maintenance.log`), ya que ningún proceso lo mantiene abierto de forma persistente.

---

## 7. Chequeo de salud

Un único comando para saber si todo está bien, pensado para cuando vuelves a operar el sistema tras un tiempo sin tocarlo:

```bash
cd /infocodes/project/cso-incident-masivas-report/backend
./maintenance.sh healthcheck
```

Comprueba, en orden: backend arriba (vía `service.sh status`), proceso maestro de Nginx vivo, espacio en disco de `/infocodes` (aviso ≥80%, fallo ≥95%), integridad de la base de datos (`PRAGMA integrity_check` + recuento de informes), tamaño de `backend.log` (aviso ≥50MB), y antigüedad del backup más reciente (aviso ≥8 días, fallo si no hay ninguno).

Cada línea sale como `OK` / `??` (aviso) / `!!` (fallo), igual que `service.sh`, con un resumen al final. Ejecútalo:
- Al reconectar tras semanas sin tocar el sistema.
- Después de cualquier incidente o restauración.
- Antes y después de un `deploy.sh` delicado.

---

## 8. Resolución de problemas

### Proceso huérfano en el puerto 8000 (sin PID file)
**Síntoma**: `service.sh start` dice que el puerto 8000 ya está en uso, pero `service.sh status` dice que el backend no está corriendo.
**Causa**: quedó un proceso backend de un arranque anterior que no pasó por `service.sh` (por ejemplo, tras un despliegue antiguo con `nohup` manual), así que no hay `backend.pid` que lo identifique.
**Solución**: identifica el proceso con cuidado antes de matarlo — el servidor aloja otras apps Python bajo el mismo usuario:
```bash
tr '\0' ' ' < /proc/<PID>/cmdline; echo   # confirma que es "python3 main.py"
readlink -f /proc/<PID>/cwd               # confirma que apunta a .../backend
kill <PID>
./service.sh start
```

### `venv` roto tras mover/renombrar el directorio de despliegue ("bad interpreter")
**Síntoma**: `service.sh start` falla con algo como `bad interpreter: No such file or directory` al instalar dependencias.
**Causa**: el entorno virtual de Python tiene rutas absolutas grabadas en `venv/bin/pip` (y similares); si el directorio del repo se mueve o renombra, esas rutas dejan de existir.
**Solución**: el `venv` es descartable (no está en git) — bórralo y deja que se recree:
```bash
cd backend
rm -rf venv
./service.sh start
```

### Error 500 al leer un informe antiguo tras añadir un campo nuevo al esquema
**Síntoma**: `GET /api/reports/{id}` devuelve 500 para un informe concreto, aunque el resto funcionan bien.
**Causa**: se añadió un campo obligatorio nuevo a `IncidentBase` (backend/schemas.py) sin valor por defecto; los informes guardados antes de ese cambio no tienen ese campo, y la respuesta falla al validarlos.
**Cómo detectarlo**: `maintenance.sh healthcheck` **no** lo detecta — el `integrity_check` de SQLite solo comprueba que el fichero no esté corrupto a nivel de disco, no que los datos cumplan el esquema actual de la aplicación. Hay que fijarse en los logs del backend (`backend.log`) o en el error real del cliente.
**Mitigación permanente**: cualquier campo nuevo en `IncidentBase` debe llevar un valor por defecto (`campo: bool = False`, etc.).

### `nginx.conf` compartido sobrescrito a ciegas
**Síntoma**: tras un `deploy.sh`, deja de funcionar algo de OTRA aplicación del servidor (`/static`, `/dashboards`, `/data`).
**Causa**: `nginx.conf` en este repo es la configuración **completa** del servidor Nginx compartido, no solo la de esta app. Si alguien la editó a mano en el servidor sin reflejarlo en el repo, `deploy.sh` la sobrescribe.
**Solución**: restaurar desde el backup que `deploy.sh` genera automáticamente (`/infocodes/nginx/conf/nginx.conf.backup.<fecha>`), y coordinar con quien tocó la config en vivo para llevar ese cambio al repo.

---

## 9. Referencia rápida

```bash
# Backend
cd /infocodes/project/cso-incident-masivas-report/backend
./service.sh status                 # ¿está vivo?
./service.sh restart                # reiniciar

# Despliegue
cd /infocodes/project/cso-incident-masivas-report
bash deploy.sh                      # git pull + deps + nginx + restart backend

# Mantenimiento (desde backend/)
./maintenance.sh backup             # backup manual de reports.db
./maintenance.sh restore            # restaurar desde un backup (interactivo)
./maintenance.sh rotate-logs        # rotar backend.log
./maintenance.sh healthcheck        # chequeo de salud completo

# Nginx (sin systemd, se llama al binario directamente)
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t          # validar config
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload   # recargar
ps -ef | grep '[n]ginx: master process'                                    # ¿vivo?

# Comprobaciones manuales (siempre con --noproxy por el proxy corporativo)
curl --noproxy '*' http://localhost:8000/api/health         # backend directo
curl --noproxy '*' http://localhost:8081/api/health         # a través de Nginx

# Logs
tail -f backend/backend.log                                  # backend en vivo
tail -f /infocodes/nginx/logs/error.log                       # Nginx (errores)
tail -f /infocodes/var/log/nginx/infocodes.access.log         # Nginx (accesos)

# Backups
ls -lht /infocodes/backups/cso-incident-masivas-report/
```
