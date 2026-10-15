# 📦 Guía de Despliegue — Automatización de Reportes Semanales (Staging / Producción)

Guía completa para desplegar y mantener la aplicación "Automatización de reportes semanales" en el servidor de producción / staging en **10.132.68.85:8081** (`infocodes.si.orange.es`, host `AOTLXPRBOA00001`).

---

## 🎯 Arquitectura del Sistema

```
                         ┌────────────────────────────────────────────────────────┐
                         │               Nginx (10.132.68.85:8081)                │
                         │             /infocodes/nginx/sbin/nginx                │
                         ├────────────────────────────────────────────────────────┤
                         │  conf/nginx.conf ──► include conf/conf.d/*.conf        │
                         │                        └── cso-incident.conf           │
                         └───────┬───────────────────────────────┬────────────────┘
                                 │                               │
                Frontend estático│                               │ Proxy pass /api,
             /reportes-incidencias                               │ /healthz, /readyz
                                 ▼                               ▼
                 ┌───────────────────────────────┐ ┌───────────────────────────────┐
                 │       [app/ (HTML/JS/CSS)]    │ │   [Backend FastAPI (:8000)]   │
                 │   - index.html (dashboard)    │ │   - main.py (FastAPI)         │
                 │   - editor.html (editor deck) │ │   - models.py & schemas.py    │
                 │   - preview.html (slides)     │ │   - executive_report_generator│
                 │   - styles.css & branding     │ │   - service.sh / uvicorn      │
                 └───────────────────────────────┘ └───────────────┬───────────────┘
                                                                   │
                                   Persistencia desacoplada en     │
                                        /infocodes/var/            ▼
                 ┌──────────────────────────────────────────────────────────────────┐
                 │  - SQLite DB: var/data/cso-incident-masivas-report/reports.db    │
                 │  - PPTX Storage: var/storage/executive_pptx/ (compartido)        │
                 │  - PID File: var/run/cso-backend.pid                             │
                 │  - Backups: var/backups/cso-incident-masivas-report/             │
                 │  - Logs: /infocodes/logs/cso-incident-masivas-report/            │
                 └──────────────────────────────────────────────────────────────────┘
```

### Estructura de Despliegue en el Servidor (Standalone & Releases Atómicas)

El despliegue sigue la misma arquitectura basada en **artefactos standalone inmutables y enlace simbólico (`current`)** empleada en `gestion-problemas-dashboard`:

```text
/infocodes/project/cso-incident-masivas-report/
├── current -> releases/20261015_140701   # Symlink atómico a la versión activa
├── releases/
│   ├── 20261015_134012/                  # Release anterior (para rollback)
│   └── 20261015_140701/                  # Release activa (backend/, nginx/, app/)
├── shared/
│   ├── venv/                             # Entorno Python virtual persistente
│   └── .env                              # Configuración de entorno desacoplada
├── rollback.sh                           # Script para conmutar a la release previa
├── status.sh                             # Inspección de versión activa y salud
└── VERSION                               # 2.1.0
```

> 🌟 **Ventajas del despliegue Standalone**:
> - **Sin Git en Producción**: No hay repo `.git/` en el servidor, evitando descargas innecesarias y conflictos de merge.
> - **Artefacto ultraligero**: Se empaqueta en `dist/cso-incident-backend.tar.gz` (aprox. **1.5 MB**), excluyendo tests, mocks, wheels y dev docs.
> - **Entorno virtual compartido (`shared/venv`)**: Las dependencias no se reinstalan desde cero en cada despliegue, tardando menos de un minuto.
> - **Rollback instantáneo**: Conmuta el symlink `current` en 1 segundo sin tocar datos persistentes.

### Relación con Aplicaciones Hermanas

El servidor `AOTLXPRBOA00001` aloja varios servicios compartidos bajo el usuario `infocodes`:
- **`cso-incident-masivas-report`** (este servicio): Fuente de la verdad de incidencias y generador canónico de informes ejecutivos en PowerPoint (`.pptx`).
- **`gestion-problemas-dashboard`** (`/problemas`): Dashboard Next.js que consume las APIs ejecutivas y enlaza a la descarga directa del PPTX semanal.
- **`release-dashboard-application`** (`/dashboards`): Tablero de gestión de versiones y releases.
- **Epsilon IA Proxy** (`/api/epsilon/`): Integración de modelos LLM internos.

---

## 📋 Requisitos Previos

**En el servidor (`AOTLXPRBOA00001` - `10.132.26.96` / `10.132.68.85`):**
- Python 3.8+ con módulo virtualenv (`venv`).
- Nginx instalado en `/infocodes/nginx/` con soporte de `conf.d/*.conf`.
- Acceso SSH para el usuario `infocodes` (puerto 22).

**En el puesto de desarrollo (Windows):**
- PowerShell 5.1+ o PowerShell 7+.
- Cliente OpenSSH (`ssh`, `scp`) configurado en el `PATH`.
- Git para Windows (`git`).
- Tar nativo de Windows (`tar.exe`).

---

## 🚀 Métodos de Despliegue

### Método Principal: Despliegue Automatizado 1-Clic (PowerShell)

Desde la raíz del repositorio en Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1
```

**Flujo automatizado que ejecuta el script:**
1. **Empaquetado Standalone**: Compila y crea `dist/cso-incident-backend.tar.gz` (~1.5 MB) con solo los ficheros de runtime (`backend/`, scripts de servicio, configuración Nginx, `rollback.sh`, `status.sh`).
2. **Transferencia Segura**: Sube el tarball vía SCP a `/tmp/cso-incident-backend.tar.gz` en `infocodes@10.132.26.96`.
3. **Backup Preventivo de BD**: Hace copia inmediata de `/infocodes/var/data/cso-incident-masivas-report/reports.db` antes de cualquier modificación.
4. **Nueva Release Aislada**: Extrae el contenido en `/infocodes/project/cso-incident-masivas-report/releases/<TIMESTAMP>/`.
5. **Enlace de Recursos Compartidos**: Symlink de `backend/venv` a `shared/venv` y de `.env` a `shared/.env`.
6. **Migración de Esquema**: Ejecuta `Base.metadata.create_all()` para aplicar posibles nuevas columnas.
7. **Sincronización Nginx**: Actualiza `conf.d/cso-incident.conf` y recarga Nginx (`nginx -s reload`).
8. **Conmutación Atómica de Symlink**: Apunta `current` a la nueva release `releases/<TIMESTAMP>`.
9. **Reinicio Backend**: Reinicia FastAPI desde la release activa (`current/backend/service.sh restart`).
10. **Rotación de Releases**: Conserva las últimas 3 versiones liberando espacio de las anteriores.
11. **Comprobación de Sondas**: Valida HTTP 200 en `/api/health`, `/readyz` y a través de Nginx (`:8081/api/health`).

**Parámetros disponibles:**

| Parámetro | Descripción |
|---|---|
| *(sin parámetros)* | Despliegue completo (empaquetado, subida, nueva release, symlink atómico y sondas). |
| `-VerifyOnly` | Solo ejecuta sondas de salud (`/api/health`, `/readyz`) y comprueba el proceso sin alterar nada (~0.8s). |
| `-Rollback` | Revierte instantáneamente `current` a la release previa y reinicia el servicio. |
| `-RestartOnly` | Reinicia el servicio backend FastAPI en el servidor remoto sin transferir archivos. |
| `-SkipBuild` | Reutiliza el tarball existente en `dist/` sin reempaquetar. |
| `-SkipUpload` | Despliega el tarball ya presente en `/tmp/` del servidor remoto. |
| `-DryRun` | Muestra los comandos y el script bash que se ejecutaría sin aplicar cambios. |

---

### Método en el Servidor: Inspección y Control Manual

Si estás conectado por SSH al servidor (`infocodes@10.132.26.96`):

```bash
cd /infocodes/project/cso-incident-masivas-report

# Ver qué release está activa y comprobar salud:
./status.sh

# Revertir instantáneamente a la versión anterior:
./rollback.sh

# Reiniciar backend manualmente:
./current/backend/service.sh restart
```
---

### Opción C: Despliegue Manual Paso a Paso (Para Troubleshooting)

Útil para diagnosticar un fallo puntual en la cadena de automatización:

#### 1. Conexión y preparación de directorios
```bash
ssh infocodes@10.132.26.96
mkdir -p /infocodes/var/data/cso-incident-masivas-report
mkdir -p /infocodes/var/storage/executive_pptx
mkdir -p /infocodes/var/run
mkdir -p /infocodes/var/backups/cso-incident-masivas-report
mkdir -p /infocodes/logs/cso-incident-masivas-report
```

#### 2. Actualizar el código
```bash
cd /infocodes/project/cso-incident-masivas-report
git fetch origin main
git reset --hard origin/main
```

#### 3. Entorno virtual y dependencias
```bash
cd /infocodes/project/cso-incident-masivas-report/backend
python3 -m venv venv
source venv/bin/activate
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
```

#### 4. Configurar variables de entorno (.env)
Asegurar que existe el fichero `/infocodes/project/cso-incident-masivas-report/backend/.env`:
```ini
DATABASE_URL=sqlite:////infocodes/var/data/cso-incident-masivas-report/reports.db
EXECUTIVE_PPTX_STORAGE_DIR=/infocodes/var/storage/executive_pptx
BACKUP_DIR=/infocodes/var/backups/cso-incident-masivas-report
PID_FILE=/infocodes/var/run/cso-backend.pid
PORT=8000
HOST=0.0.0.0
```

#### 5. Configuración Modular de Nginx
```bash
# Copiar el bloque del sitio a conf.d (sin sobreescribir nginx.conf global)
cp /infocodes/project/cso-incident-masivas-report/nginx/conf.d/cso-incident.conf /infocodes/nginx/conf/conf.d/

# Probar la sintaxis
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t

# Recargar Nginx
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload
```

#### 6. Iniciar el Backend
```bash
cd /infocodes/project/cso-incident-masivas-report/backend
./service.sh restart
```

---

## 🩺 Sondas de Observabilidad y Salud

El backend expone endpoints estandarizados de observabilidad:

| Endpoint | Tipo | Propósito | Respuesta Esperada |
|---|---|---|---|
| `GET /healthz` | Liveness Probe | Verifica que el proceso HTTP esté vivo y respondiendo. | `{"status":"ok","uptime":...}` (HTTP 200) |
| `GET /readyz` | Readiness Probe | Verifica que la base de datos SQLite y el motor PPTX estén listos. | `{"status":"ready","database":"ok","executiveReportEngine":"available"}` (HTTP 200) |
| `GET /api/health` | Legacy Health | Compatibilidad hacia atrás con scripts anteriores. | `{"status":"ok","service":"Reportes de Incidencias API"}` (HTTP 200) |

**Verificación directa desde el servidor:**
```bash
# Nota: Usar siempre --noproxy '*' por el proxy corporativo
curl --noproxy '*' http://localhost:8000/healthz
curl --noproxy '*' http://localhost:8000/readyz
curl --noproxy '*' http://localhost:8081/healthz
```

**Cabeceras de Diagnóstico:**
Todas las respuestas HTTP incluyen cabeceras para trazar tiempos y peticiones:
- `X-Request-ID`: Identificador UUID único de la petición.
- `X-Process-Time`: Tiempo de procesamiento en el servidor (ej. `0.0042s`).

---

## ✅ Checklist de Validación Post-Despliegue

### 1. Frontend
- [ ] Acceso a `http://10.132.68.85:8081/reportes-incidencias`.
- [ ] Carga `index.html` con la lista de informes de incidencias sin alertas de error.
- [ ] Los estilos Orange, fuentes e iconos cargan correctamente.
- [ ] El editor (`editor.html?report=YYYY-Wxx`) permite editar y auto-guardar.
- [ ] La vista previa (`preview.html?report=YYYY-Wxx`) renderiza las diapositivas.

### 2. Backend & APIs Ejecutivas
- [ ] `curl --noproxy '*' http://localhost:8000/readyz` devuelve status `ready`.
- [ ] Listado de reportes: `curl --noproxy '*' http://localhost:8081/api/reports` devuelve array JSON.
- [ ] Descarga PPTX semanal: `curl -I http://10.132.68.85:8081/api/reports/2026-W41/legacy-pptx` devuelve HTTP 200.
- [ ] Endpoint de sincronización con `gestion-problemas-dashboard`:
  `curl http://10.132.68.85:8081/api/reports/executive/summary` responde correctamente.

### 3. Persistencia
- [ ] Base de datos en `/infocodes/var/data/cso-incident-masivas-report/reports.db` accesible.
- [ ] Backup automático creado en `/infocodes/var/backups/cso-incident-masivas-report/`.
- [ ] PID registrado en `/infocodes/var/run/cso-backend.pid`.

---

## 🐛 Resolución de Problemas (Troubleshooting)

### Error 502 / 504 Bad Gateway
- Comprueba si el backend está en ejecución:
  ```bash
  cd /infocodes/project/cso-incident-masivas-report/backend && ./service.sh status
  ```
- Si está parado, examina el log de errores:
  ```bash
  tail -n 50 /infocodes/logs/cso-incident-masivas-report/backend.log
  ./service.sh start
  ```

### Nginx falla en el reload (`nginx -t` error)
- Revisa el fichero modular `conf.d/cso-incident.conf`:
  ```bash
  /infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t
  ```
- Si hay un error de sintaxis en `conf.d/cso-incident.conf`, puedes restaurar la versión anterior o eliminarlo temporalmente sin romper el `nginx.conf` principal.

### Falso Negativo 403 Forbidden al hacer `curl`
- **Causa**: Las variables `http_proxy` / `https_proxy` en la shell corporativa redirigen el tráfico de `localhost` hacia el proxy saliente.
- **Solución**: Añadir siempre el flag `--noproxy '*'`:
  ```bash
  curl --noproxy '*' http://127.0.0.1:8000/readyz
  ```

### Bloqueo de Base de Datos SQLite (database locked)
- Asegúrate de que no haya procesos zombis accediendo a la base de datos:
  ```bash
  fuser /infocodes/var/data/cso-incident-masivas-report/reports.db
  ```
- Reinicia el backend con `./service.sh restart`.

---

## 📝 Procedimiento de Rollback

Si una versión desplegada presenta incidencias graves:

**Vía PowerShell (Windows):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1 -Rollback
```

**Vía SSH (Linux):**
```bash
# 1. Conmutar al release previo (atómico, instantáneo y seguro)
cd /infocodes/project/cso-incident-masivas-report
./rollback.sh

# 2. Restaurar base de datos (solo si la BD fue corrompida)
cd current/backend
./maintenance.sh restore
```

---

**Última actualización:** Octubre 2026  
**Versión de despliegue:** 2.1 (Artefacto Standalone, Releases Atómicas con Symlink y Persistencia `/infocodes/var/`)
