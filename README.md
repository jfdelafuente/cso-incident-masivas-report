# Automatización de reportes semanales — Reportes de Incidencias

Herramienta interna de MASORANGE que convierte el listado semanal de incidencias IT + RED en un dossier de diapositivas con estilo corporativo (vista web, PDF y PowerPoint editable), sustituyendo la confección manual de presentaciones.

Además, actúa como **Single Source of Truth** para la generación de Informes Ejecutivos PPTX con integración de Jira y Confluence, prestando servicio a aplicaciones hermanas como **Gestión de Problemas Dashboard** (`/problemas`) y **Release Dashboard Application** (`/dashboards`).

Frontend en HTML/CSS/JS puro (sin paso de compilación) + backend FastAPI con persistencia desacoplada en SQLite.

---

## 🚀 Empezar

- **Ejecutar en local**: ver [`START_LOCAL.md`](START_LOCAL.md).
- **Arquitectura del código** (frontend, backend, integración y diseño): ver [`CLAUDE.md`](CLAUDE.md).

---

## 📦 Despliegue y Operación

- **Despliegue 1-Clic desde Windows (Recomendado)**:
  ```powershell
  .\scripts\deploy-production.ps1
  ```
  *(Soporta `-VerifyOnly`, `-RestartOnly`, `-Rollback`, `-SyncFiles` y `-DryRun`)*.
- **Despliegue en el Servidor**: ver [`DEPLOYMENT.md`](DEPLOYMENT.md) y [`deploy.sh`](deploy.sh).
- **Operación del día a día** (arrancar/parar backend, backups, restauración, rotación de logs, chequeo de salud y sondas): ver [`MANUAL_OPERADOR.md`](MANUAL_OPERADOR.md).

---

## 🏛️ Estructura del Repositorio

- `app/` — Frontend estático (dashboard `index.html`, editor `editor.html`, vista previa `preview.html`, `report-render.js`, `api-client.js`).
- `backend/` — API FastAPI + SQLite:
  - `main.py` — Endpoints CRUD, generación de PPTX semanal, endpoints de informes ejecutivos e integración de subida CSV.
  - `report_generator/` — Motor generador de Informes Ejecutivos PPTX (`ExecutiveReportBuilder`, Confluence parser, estilos).
  - `service.sh` — Gestión del proceso (`start`, `stop`, `restart`, `status`).
  - `maintenance.sh` — Mantenimiento seguro con SQLite Online Backup (`backup`, `restore`, `rotate-logs`, `healthcheck`).
  - `.env.example` — Variables de entorno configurables.
- `nginx/conf.d/cso-incident.conf` — Configuración modular aislada para Nginx (`/reportes-incidencias/` y `/api`).
- `deploy.sh` — Script de despliegue en Linux con migración automática de Nginx modular y persistencia en `/infocodes/var/`.
- `scripts/deploy-production.ps1` — Orquestador de despliegue en 1 clic para PowerShell.
- `scripts/` — Herramientas CLI para volcado e importación de plantillas PowerPoint (`export_legacy_pptx.py`, `import_pptx.py`, `dump_pptx_shapes.py`).

---

## 🌐 Entorno de Producción (`AOTLXPRBOA00001`)

- **Host SSH**: `10.132.26.96` (`infocodes`)
- **Acceso Web Nginx**: `http://10.132.68.85:8081/reportes-incidencias/` (o `http://infocodes.si.orange.es:8081/reportes-incidencias/`)
- **API Backend**: `http://10.132.68.85:8081/api/` (puerto interno `8000`)
- **Persistencia Centralizada**:
  - Base de datos SQLite: `/infocodes/var/data/cso-incident-masivas-report/reports.db`
  - Informes Ejecutivos PPTX: `/infocodes/var/storage/executive_pptx/`
  - PID del servicio: `/infocodes/var/run/cso-backend.pid`
  - Backups de base de datos: `/infocodes/var/backups/cso-incident-masivas-report/`
  - Logs: `/infocodes/logs/cso-incident-masivas-report/backend.log`
