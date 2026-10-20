# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI assistants when working with code in this repository.

## What this is

"Automatización de reportes semanales" — internal ORANGE backend service and generator engine that turns a weekly list of IT/RED incidents into styled presentation dossiers (PowerPoint `.pptx`, PDF, and structured JSON).

Also serves as the **Single Source of Truth (SSOT)** for generating executive postmortem presentations consumed by sibling apps like **Gestión de Problemas Dashboard** (`/problemas`) and **Release Dashboard Application** (`/dashboards`).

> ⚠️ **Frontend Migration Notice**: The official user-facing frontend was migrated to `release-dashboard-application` under `dashboards/reportes-incidencias/`. In this repository, `app/` only retains a lightweight `index.html` HTTP 301 redirect card for backward compatibility. All future frontend UI work belongs in `release-dashboard-application`.

## Running locally

### Backend (FastAPI + SQLite on port 8000):
```bash
# Windows:
.\start-local.bat

# Linux / Mac / WSL:
chmod +x start-local.sh
./start-local.sh
```
Or manually:
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
python main.py                                      # or: uvicorn main:app --reload --port 8000
```
Interactive docs at `http://localhost:8000/docs`.

There is no automated test suite and no lint/format tooling in this repo — do not invent commands for these.

## Architecture

**Backend** (`backend/`):
- FastAPI app in `main.py`, SQLAlchemy models in `models.py`, Pydantic schemas in `schemas.py`.
- SQLite database defaults to `reports.db` locally or `/infocodes/var/data/cso-incident-masivas-report/reports.db` in production via `DATABASE_URL`.
- Report primary key is `"{year}-W{week:02d}"` (e.g. `2026-W26`), not an autoincrement ID — creating a duplicate year/week returns HTTP 409.
- Observability probes: `/healthz` (liveness), `/readyz` (readiness verifying database and PPTX engine), `/api/health` (legacy).
- Single Source of Truth for executive PPTX generation (`/api/v1/reports/executive-incident/...`) and legacy weekly export (`/api/reports/{id}/legacy-pptx`).
- End-to-end request tracing via `X-Request-ID` and `X-Process-Time` middleware.

**Report Generator** (`backend/report_generator/`):
- Autonomous engine for executive postmortem PPTX generation:
  - `confluence_parser.py`: Parses Confluence wiki markup, Jira tables, timelines, and action points.
  - `executive_report_builder.py`: Builds corporate PowerPoint decks using `python-pptx` and `assets/executive_template.pptx`.
  - `executive_paths.py`: Resolves decoupled storage (`/infocodes/var/storage/executive_pptx/`) and automatic file retention cleanup.

**CLI Tools** (`scripts/`):
- `import_pptx.py`: Ingests legacy weekly PowerPoint decks into structured JSON or directly posts them to the API.
- `export_legacy_pptx.py`: Generates the official corporate weekly slide deck using `scripts/legacy_template.pptx`.
- `dump_pptx_shapes.py`: Diagnostic tool for dumping shape coordinates and textboxes of PPTX templates.

## Process Management & Maintenance

- **`backend/service.sh`**: Supervises the backend process using PID files without requiring systemd or root (`{start|stop|restart|status}`). PID file is stored in `/infocodes/var/run/cso-backend.pid`. Logs are written to `/infocodes/logs/cso-incident-masivas-report/backend.log`.
- **`backend/maintenance.sh`**: Routines for SQLite Online Backup (`backup`, `restore`), log copy-truncation (`rotate-logs`), and healthchecks (`healthcheck`).
- **Corporate Proxy**: The server environment sets `http_proxy`/`https_proxy`. Any manual `curl` against `localhost` must include `--noproxy '*'`.

## Deployment

Full details in `docs/deployment.md` and `docs/operations.md`.
- Automated 1-click deployment from Windows:
  ```powershell
  .\scripts\deploy-production.ps1
  ```
  *(Packages a 1.5 MB standalone tarball, uploads via SCP, creates preventive DB backup, symlinks `releases/<TIMESTAMP>/` -> `current`, reloads Nginx and restarts FastAPI)*.
- Instant rollback: `./rollback.sh` or `.\scripts\deploy-production.ps1 -Rollback`.
- Active release inspection: `./status.sh` or `.\scripts\deploy-production.ps1 -VerifyOnly`.

## Data Model & Business Rules

- `IncidentBase` fields in `backend/schemas.py` **must always have default values** (booleans in particular). `PUT /api/reports/{id}` validates incoming payloads; a required field without default causes HTTP 500 when loading older reports.
- **Severities**:
  - **IT**: `SL1`, `SL2`, `SL3` (SL1 if title contains "indisponibilidad", else SL2).
  - **RED**: `EMERGENCIA` or `CRITICA` (never SL1 or SL2).
- **Categories**:
  - **IT**: "Indisponibilidad", "Degradación" or blank.
  - **RED**: "Pérdida de servicio móvil", "Pérdida de servicio FTTH", "Pérdida de servicio FTTH y móvil" or blank.
- **Structured Fields**:
  - `metrics`: Multi-line `"label | value"`.
  - `actionPoints`: Multi-line `"AP | Tipo de AP | Descripción"`.
- `featured` boolean: When `true`, pins the incident as the highlighted incident for its area in executive summaries.
