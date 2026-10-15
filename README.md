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
  *(Empaqueta un artefacto standalone inmutable de 1.5 MB, lo despliega en `releases/<TIMESTAMP>/` y activa el symlink atómico `current`)*.
  *(Soporta `-VerifyOnly`, `-RestartOnly`, `-Rollback`, `-SkipBuild`, `-SkipUpload` y `-DryRun`)*.
- **Operación y Verificación en el Servidor**:
  - `status.sh` — Muestra la release activa y verifica sondas HTTP de salud.
  - `rollback.sh` — Revierte instantáneamente en 1 segundo a la release anterior.
- **Guías completas**:
  - [`DEPLOYMENT.md`](DEPLOYMENT.md) — Guía detallada de la arquitectura standalone, releases y configuración Nginx.
  - [`MANUAL_OPERADOR.md`](MANUAL_OPERADOR.md) — Operación rutinaria, backups automáticos en caliente, rotación y resolución de incidencias.

---

## 🏛️ Estructura del Repositorio

- `app/` — Frontend estático de referencia (el frontend oficial en producción y hub de portales está integrado en `release-dashboard-application/dashboards/reportes-incidencias/`).
- `backend/` — API FastAPI + SQLite:
  - `main.py` — Endpoints CRUD, generación de PPTX semanal, endpoints de informes ejecutivos e integración de subida CSV.
  - `report_generator/` — Motor generador de Informes Ejecutivos PPTX (`ExecutiveReportBuilder`, Confluence parser, estilos).
  - `service.sh` — Gestión del proceso (`start`, `stop`, `restart`, `status`).
  - `maintenance.sh` — Mantenimiento seguro con SQLite Online Backup (`backup`, `restore`, `rotate-logs`, `healthcheck`).
  - `.env.example` — Variables de entorno configurables.
- `nginx/conf.d/cso-incident.conf` — Configuración modular aislada para Nginx (`/reportes-incidencias/` y `/api`).
- `scripts/deploy-production.ps1` — Orquestador de despliegue standalone (empaquetado, subida SCP, symlinks y sondas).
- `rollback.sh` — Script de rollback atómico para producción.
- `status.sh` — Script de comprobación de release activa y healthchecks.
- `VERSION` — Número de versión del proyecto (2.1.0).
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
