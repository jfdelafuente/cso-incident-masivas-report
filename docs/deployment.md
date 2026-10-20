# 📦 Guía de Despliegue en Producción — Standalone Releases

Guía unificada de despliegue para el servicio **CSO Incident Masivas Report** en el servidor corporativo `AOTLXPRBOA00001` (`10.132.26.96` / `10.132.68.85:8081`).

---

## 🎯 Arquitectura de Despliegue (Standalone Releases)

El despliegue en producción utiliza una arquitectura basada en **artefactos standalone inmutables y enlace simbólico (`current`)**, idéntica al estándar del departamento:

```text
/infocodes/project/cso-incident-masivas-report/
├── current -> releases/20261015_140701   # Symlink atómico a la versión activa
├── releases/
│   ├── 20261015_134012/                  # Release previa (permite rollback en 1s)
│   └── 20261015_140701/                  # Release activa (backend/, nginx/, app/)
├── shared/
│   ├── venv/                             # Entorno Python virtual persistente compartido
│   └── .env                              # Configuración de entorno desacoplada
├── rollback.sh                           # Conmuta current a la release previa
├── status.sh                             # Inspecciona versión activa y sondas
└── VERSION                               # Versión semántica activa
```

### Ventajas clave:
- **Sin Git en Producción**: No hay clon `.git` en el servidor, evitando descargas innecesarias y conflictos de merge.
- **Artefacto Ultraligero**: Se genera un tarball comprimido `dist/cso-incident-backend.tar.gz` (~1.5 MB), excluyendo `.git`, dependencias de desarrollo y tests.
- **Entorno Virtual Compartido (`shared/venv`)**: Las dependencias no se reinstalan desde cero en cada release; el despliegue tarda menos de 1 minuto.
- **Rollback Instantáneo**: Conmuta el symlink `current` en 1 segundo sin tocar datos persistentes.

---

## 🌐 Relación con Nginx y Otras Aplicaciones

```
                        ┌────────────────────────────────────────────────────────┐
                        │               Nginx (10.132.68.85:8081)                │
                        │             /infocodes/nginx/sbin/nginx                │
                        ├────────────────────────────────────────────────────────┤
                        │  conf/nginx.conf ──► include conf/conf.d/*.conf        │
                        │                        └── cso-incident.conf           │
                        └───────┬───────────────────────────────┬────────────────┘
                                │                               │
     Redirección 301            │                               │ Proxy pass /api,
     /reportes-incidencias      │                               │ /healthz, /readyz
                                ▼                               ▼
                ┌───────────────────────────────┐ ┌───────────────────────────────┐
                │  Release Dashboard Central    │ │   [Backend FastAPI (:8000)]   │
                │  /dashboards/reportes-        │ │   - main.py (FastAPI)         │
                │  incidencias/                 │ │   - models.py & schemas.py    │
                │  (Frontend oficial unificado) │ │   - report_generator/ (PPTX)  │
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

---

## 🚀 Método Principal: Despliegue 1-Clic desde Windows

Desde la raíz del repositorio en tu terminal PowerShell de Windows:

```powershell
.\scripts\deploy-production.ps1
```

### Flujo automatizado que ejecuta el script:
1. **Empaquetado Standalone**: Compila `dist/cso-incident-backend.tar.gz` (~1.5 MB) omitiendo `.git`, tests y dependencias de desarrollo.
2. **Transferencia Segura**: Sube el tarball vía SCP a `/tmp/` en el host `infocodes@10.132.26.96`.
3. **Backup Preventivo de BD**: Hace copia inmediata de `reports.db` antes de cualquier modificación.
4. **Nueva Release Aislada**: Extrae el contenido en `releases/<TIMESTAMP>/`.
5. **Enlace de Recursos Compartidos**: Symlink de `backend/venv` a `shared/venv` y de `.env` a `shared/.env`.
6. **Migración de Esquema**: Ejecuta validación de esquemas SQLite.
7. **Sincronización Nginx**: Actualiza `conf.d/cso-incident.conf` y recarga Nginx (`nginx -s reload`).
8. **Conmutación Atómica de Symlink**: Apunta `current` a la nueva release `releases/<TIMESTAMP>`.
9. **Reinicio Backend**: Reinicia FastAPI (`current/backend/service.sh restart`).
10. **Rotación de Releases**: Conserva las últimas 3 versiones liberando espacio de las anteriores.
11. **Comprobación de Sondas**: Valida HTTP 200 en `/healthz`, `/readyz` y a través de Nginx (`:8081/api/health`).

### Parámetros opcionales del script:

| Parámetro | Descripción |
|---|---|
| *(sin parámetros)* | Despliegue completo estándar (~30-45s). |
| `-VerifyOnly` | Solo ejecuta sondas de salud (`/api/health`, `/readyz`) y estado del proceso (~1s). |
| `-Rollback` | Revierte instantáneamente `current` a la release previa y reinicia el servicio. |
| `-RestartOnly` | Reinicia el servicio backend FastAPI en el servidor remoto sin transferir archivos. |
| `-SkipBuild` | Reutiliza el tarball existente en `dist/` sin reempaquetar. |
| `-SkipUpload` | Despliega el tarball ya presente en `/tmp/` del servidor remoto. |
| `-DryRun` | Muestra los comandos y el script bash que se ejecutaría sin aplicar cambios. |

---

## 🐧 Operación y Verificación por SSH

Conectado a la máquina vía SSH (`ssh infocodes@10.132.26.96`):

```bash
cd /infocodes/project/cso-incident-masivas-report

# 1. Comprobar release activa y sondas de salud:
./status.sh

# 2. Revertir a la release anterior en 1 segundo:
./rollback.sh

# 3. Reiniciar el backend manualmente:
./current/backend/service.sh restart
```

> ⚠️ **Proxy corporativo**: El servidor tiene variables `http_proxy`/`https_proxy` que interceptan el tráfico localhost. En llamadas manuales de `curl`, incluye siempre `--noproxy '*'`:
> ```bash
> curl --noproxy '*' http://localhost:8000/readyz
> ```

---

## ✅ Checklist de Validación Post-Despliegue

### 1. Frontend Unificado
- [ ] Acceso a: **http://10.132.68.85:8081/dashboards/reportes-incidencias/**
- [ ] La redirección desde `http://10.132.68.85:8081/reportes-incidencias` funciona (HTTP 301).
- [ ] La lista de informes semanales carga correctamente desde el backend.

### 2. Backend & Sondas
- [ ] Liveness: `curl --noproxy '*' http://localhost:8000/healthz` (status `ok`).
- [ ] Readiness: `curl --noproxy '*' http://localhost:8000/readyz` (status `ready`, `database: ok`, `executiveReportEngine: available`).
- [ ] Descarga PPTX semanal: `curl -I http://localhost:8081/api/reports/2026-W41/legacy-pptx` (HTTP 200).

### 3. Persistencia y Logs
- [ ] Base de datos accesible en `/infocodes/var/data/cso-incident-masivas-report/reports.db`.
- [ ] Backup preventivo registrado en `/infocodes/var/backups/cso-incident-masivas-report/`.
- [ ] Log sin errores críticos en `/infocodes/logs/cso-incident-masivas-report/backend.log`.

