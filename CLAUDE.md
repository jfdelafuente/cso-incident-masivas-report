# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Automatización de reportes semanales" — an internal MASORANGE tool that turns a weekly list of IT/RED incidents into a styled slide deck (web preview, PDF, and editable PowerPoint), replacing a manually-built PowerPoint. Vanilla HTML/CSS/JS frontend + a small FastAPI backend for persistence. No frontend build step, no test suite, no linter configured.

The `project/` and `chats/` directories are the original Claude Design handoff bundle (HTML/CSS/JS mockups + the design conversation that produced them). They are historical reference for *why* the UI looks the way it does, not code that runs — the real implementation lives in `app/` and `backend/`.

## Running locally

Frontend (static files, no build step):
```bash
cd app && python -m http.server 8080   # or start-local.sh / start-local.bat from repo root
```
Open http://localhost:8080 (serves `home.html`/`index.html`). A VS Code launch config for this exists at `.claude/launch.json`.

Backend (FastAPI + SQLite):
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
python main.py                                      # or: uvicorn main:app --reload --port 8000
```
Serves on http://localhost:8000; interactive docs at `/docs`. The frontend's `ApiClient` (`app/api-client.js`) defaults to `http://localhost:8000` but reads an override from `localStorage['api_base_url']` — useful when pointing a local frontend at the staging backend or vice versa.

There is no automated test suite and no lint/format tooling in this repo — don't invent commands for these.

## Architecture

**Two frontend surfaces sharing state through the DOM and localStorage, not modules:**

- `home.html` + `home.js` (`HomePage` object) — dashboard: lists/creates/duplicates/deletes reports via `ApiClient`, imports/exports JSON/CSV. This is the only page that treats the backend as the source of truth.
- `index.html` + `app.js` (`App`, an IIFE) + `editor.js` (`ReportEditor`) — the report editor/deck. This is two scripts cooperating on one page:
  - `app.js` owns rendering, in-memory state, and PDF/PPTX export (via the `pptxgenjs` CDN bundle loaded in `index.html`). It persists to `localStorage['mo_inc_report_v1']` and can run **standalone** with no backend (seeded with demo data in `seed()`).
  - `editor.js` bridges that page to the backend: reads `?report=<id>` from the URL, loads/saves via `ApiClient`, and mutates `App.state` directly, then re-writes the same localStorage key so `app.js` stays in sync. It polls for `App` to exist (`setTimeout` retry loop) because there's no module system enforcing load order — if you add a new script here, replicate that pattern rather than assuming `app.js` has already run.
  - `?view` query param puts the editor in read-only mode (disables all inputs/buttons via `disableEditControls()`).
- `preview.html` — standalone read-only slide viewer/export page, same `pptxgenjs` dependency.
- `api-client.js` — thin fetch wrapper (`ApiClient`) used by `home.js` and `editor.js`. Not used by `app.js` directly.

**Backend** (`backend/`): FastAPI app in `main.py`, SQLAlchemy models in `models.py`, Pydantic schemas in `schemas.py`, SQLite file `reports.db` (created automatically, gitignored). Report primary key is `"{year}-W{week:02d}"` (e.g. `2026-W26`), not an autoincrement id — creating a duplicate year/week returns 409. CORS is wide open (`allow_origins=["*"]`) for dev; tighten `main.py` before hardening. Health check is `GET /api/health` (not `/health` — this has bitten the deploy scripts before, see below).

**Process management (`backend/service.sh`)**: the staging server has no systemd and the deploy user (`infocodes`, uid=2001) has no root, so the backend is supervised by a hand-rolled PID-file script instead of a systemd unit — `./service.sh {start|stop|restart|status}`. It refuses to start if port 8000 is already held by an unrelated process, and identifies "its" process by checking `/proc/<pid>/cmdline` (falls back to `ps` where `/proc` isn't available) rather than `pkill -f main.py`, because the server hosts multiple unrelated Python apps under `/infocodes` and a name-based kill could hit the wrong one.

The staging shell has `http_proxy`/`https_proxy` set to a corporate proxy, and `curl` honors that even for `localhost`/`127.0.0.1` — the proxy then returns `403 Forbidden` for loopback destinations, making a perfectly healthy backend look dead. `service.sh`'s healthcheck curls always pass `--noproxy '*'`; do the same in any ad-hoc `curl` against localhost on that server, or the check will fail for the wrong reason.

## Deployment

Full details in `DEPLOYMENT.md` (manual/reference walkthrough) and `STAGING_DEPLOYMENT.md` (the actual staging flow) — read those before changing deploy behavior. Key facts that aren't obvious from a typical FastAPI+Nginx setup:

- Everything runs as the unprivileged `infocodes` user (uid=2001, no root, no sudo, no systemd) on `10.132.68.85:8081` / `infocodes.si.orange.es`. Never add `sudo` back into `deploy.sh` or the docs.
- Nginx is a **self-contained install under `/infocodes/nginx`**, not the OS package: binary at `/infocodes/nginx/sbin/nginx`, config at `/infocodes/nginx/conf/nginx.conf`, error log at `/infocodes/nginx/logs/error.log`, access log at `/infocodes/var/log/nginx/infocodes.access.log`. Reload with `/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload` (there is no `nginx` systemd unit to restart).
- That Nginx instance is shared with other apps (`/static`, `/dashboards`, `/data` locations already in `nginx.conf` alongside this app's `/reportes-incidencias` and `/api`). The repo's `nginx.conf` is the full merged config for the shared server — `deploy.sh` backs up the live config before overwriting it.
- App deploy path on the server is `/infocodes/cso-incident-masivas-report`.
- `deploy.sh` automates the whole flow: git clone/pull → venv + deps → DB init → backup+apply `nginx.conf` (roll back automatically if `nginx -t` fails) → `backend/service.sh restart` → verify frontend files exist. Re-running it is how you ship an update; it's idempotent.

## Data model notes

Incident fields (`app/app.js` `seed()` / `backend/schemas.py`) map directly to slide content — when adding a field, check both the FastAPI schema/model and the render/export paths in `app.js` (`areaOf()`, `metricsArr()`, `titleOrCat()`, the PPTX/PDF builders) since there's no shared type definition between frontend and backend. Severity is one of `SL1`/`SL2`/`SL3` (colors hardcoded in the `SEV` map in `app.js`); `group` determines whether an incident is bucketed as "IT" or "RED" via a regex on the group name (`areaOf()`), not an explicit field.
