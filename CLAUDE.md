# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Automatización de reportes semanales" — an internal MASORANGE tool that turns a weekly list of IT/RED incidents into a styled slide deck (web preview, PDF, and editable PowerPoint), replacing a manually-built PowerPoint. Vanilla HTML/CSS/JS frontend + a small FastAPI backend for persistence. No frontend build step, no test suite, no linter configured.

The original Claude Design handoff bundle (HTML/CSS/JS mockups + the design conversation that produced them, explaining *why* the UI looks the way it does) lived in `project/`/`chats/` early in this repo's history and was removed once no longer needed — check `git log` before that removal if you need the original design rationale. The real implementation lives in `app/` and `backend/`.

## Running locally

Frontend (static files, no build step):
```bash
cd app && python -m http.server 8080   # or start-local.sh / start-local.bat from repo root
```
Open http://localhost:8080 (serves `index.html`, the dashboard — see Architecture below). A VS Code launch config for this exists at `.claude/launch.json`. Note: unlike the editor (`editor.html`), the dashboard has no offline/seeded fallback — if the backend isn't running you'll get "no se puede conectar al backend" alerts and an empty list, so start the backend too (see below) even for a quick frontend-only look.

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

- `index.html` + `home.js` (`HomePage` object) — the landing page / dashboard: lists/creates/duplicates/deletes reports via `ApiClient`, imports/exports JSON/CSV, links to `editor.html?report=<id>` and `preview.html?report=<id>`. This is the only page that treats the backend as the source of truth. (Renamed from `home.html` — Nginx's `index` directive and `try_files` fallback in `nginx.conf` already point at literal `index.html`, so nothing there needed to change, only the internal links in `home.js`/`preview.html`/`editor.html`.)
- `editor.html` (renamed from `index.html`) + `app.js` (`App`, an IIFE) + `editor.js` (`ReportEditor`) — the report editor/deck. This is two scripts cooperating on one page:
  - `app.js` owns rendering, in-memory state, and PDF/PPTX export (via the `pptxgenjs` CDN bundle loaded in `editor.html`). It persists to `localStorage['mo_inc_report_v1']` and can run **standalone** with no backend (seeded with demo data in `seed()`).
  - `editor.js` bridges that page to the backend: reads `?report=<id>` from the URL, loads/saves via `ApiClient`, and mutates `App.state` directly, then re-writes the same localStorage key so `app.js` stays in sync. It polls for `App` to exist (`setTimeout` retry loop) because there's no module system enforcing load order — if you add a new script here, replicate that pattern rather than assuming `app.js` has already run.
  - `?view` query param puts the editor in read-only mode (disables all inputs/buttons via `disableEditControls()`).
- `preview.html` — standalone read-only slide viewer/export page, same `pptxgenjs` dependency, links back to `index.html`.
- `api-client.js` — thin fetch wrapper (`ApiClient`) used by `home.js` and `editor.js`. Not used by `app.js` directly. Its default `baseURL` is environment-sensitive: an absolute `http://localhost:8000` when the page itself is served from `localhost`/`127.0.0.1` (local dev, frontend and backend on different ports), otherwise `''` (relative), so requests go through `/api` on the *same origin* the page was loaded from and let Nginx's `/api` proxy reach the backend. Don't hardcode `http://localhost:8000` anywhere in the frontend — from a remote browser that resolves to the visitor's own machine, not the server.

**Backend** (`backend/`): FastAPI app in `main.py`, SQLAlchemy models in `models.py`, Pydantic schemas in `schemas.py`, SQLite file `reports.db` (created automatically, gitignored). Report primary key is `"{year}-W{week:02d}"` (e.g. `2026-W26`), not an autoincrement id — creating a duplicate year/week returns 409. CORS is wide open (`allow_origins=["*"]`) for dev; tighten `main.py` before hardening. Health check is `GET /api/health` (not `/health` — this has bitten the deploy scripts before, see below).

**Process management (`backend/service.sh`)**: the staging server has no systemd and the deploy user (`infocodes`, uid=2001) has no root, so the backend is supervised by a hand-rolled PID-file script instead of a systemd unit — `./service.sh {start|stop|restart|status}`. It refuses to start if port 8000 is already held by an unrelated process, and identifies "its" process by checking `/proc/<pid>/cmdline` (falls back to `ps` where `/proc` isn't available) rather than `pkill -f main.py`, because the server hosts multiple unrelated Python apps under `/infocodes` and a name-based kill could hit the wrong one. `backend.log` lives in `/infocodes/logs/cso-incident-masivas-report/` (outside the repo tree, same rationale as the backup directory below — not the `backend/` dir itself, so it survives repo operations and stays out of what `deploy.sh` clones/pulls); `service.sh start` creates that directory if missing.

The staging shell has `http_proxy`/`https_proxy` set to a corporate proxy, and `curl` honors that even for `localhost`/`127.0.0.1` — the proxy then returns `403 Forbidden` for loopback destinations, making a perfectly healthy backend look dead. `service.sh`'s healthcheck curls always pass `--noproxy '*'`; do the same in any ad-hoc `curl` against localhost on that server, or the check will fail for the wrong reason.

**Maintenance (`backend/maintenance.sh`)**: same subcommand-script pattern as `service.sh` — `./maintenance.sh {backup|restore|rotate-logs|healthcheck}`. `backup` uses SQLite's Online Backup API (`sqlite3 reports.db ".backup 'dest'"`, safe on a live DB, unlike `cp`) into `/infocodes/backups/cso-incident-masivas-report/` (outside the repo tree), keeping the last 7. `rotate-logs` copy-truncates `backend.log` (in `/infocodes/logs/cso-incident-masivas-report/`) without restarting the backend (its append-mode fd survives truncation of the same inode). Cron-driven runs of `maintenance.sh` redirect their own stdout/stderr to `maintenance.log` in that same directory (not `backend.log` — see `MANUAL_OPERADOR.md` for the exact cron lines). `healthcheck` is the single command for "is everything OK" (backend, nginx, disk, DB integrity, log size, backup staleness). Day-2 operator procedures (cron lines, restore walkthrough, troubleshooting) live in `MANUAL_OPERADOR.md`, not here — read that before writing new ops tooling so you don't duplicate it. Note: the actual SQLite table is `reports` (plural, see `models.py`'s `__tablename__`) — `DEPLOYMENT.md` used to say `report` (singular) in its example queries, which was a real bug (`no such table: report`).

## Deployment

Full details in `DEPLOYMENT.md` (manual/reference walkthrough) and `STAGING_DEPLOYMENT.md` (the actual staging flow) — read those before changing deploy behavior. Key facts that aren't obvious from a typical FastAPI+Nginx setup:

- Everything runs as the unprivileged `infocodes` user (uid=2001, no root, no sudo, no systemd) on `10.132.68.85:8081` / `infocodes.si.orange.es`. Never add `sudo` back into `deploy.sh` or the docs.
- Nginx is a **self-contained install under `/infocodes/nginx`**, not the OS package: binary at `/infocodes/nginx/sbin/nginx`, config at `/infocodes/nginx/conf/nginx.conf`, error log at `/infocodes/nginx/logs/error.log`, access log at `/infocodes/var/log/nginx/infocodes.access.log`. Reload with `/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload` (there is no `nginx` systemd unit to restart).
- That Nginx instance is shared with other apps (`/static`, `/dashboards`, `/data` locations already in `nginx.conf` alongside this app's `/reportes-incidencias` and `/api`). The repo's `nginx.conf` is the full merged config for the shared server — `deploy.sh` backs up the live config before overwriting it.
- App deploy path on the server is `/infocodes/project/cso-incident-masivas-report`.
- `deploy.sh` automates the whole flow: git clone/pull → venv + deps → DB init → backup+apply `nginx.conf` (roll back automatically if `nginx -t` fails) → `backend/service.sh restart` → verify frontend files exist. Re-running it is how you ship an update; it's idempotent.

## Data model notes

Incident fields (`app/app.js` `seed()` / `backend/schemas.py`) map directly to slide content — when adding a field, check both the FastAPI schema/model and the render/export paths in `app.js` (`areaOf()`, `metricsArr()`, `titleOrCat()`, the PPTX/PDF builders) since there's no shared type definition between frontend and backend. Severity is one of `SL1`/`SL2`/`SL3` (colors hardcoded in the `SEV` map in `app.js`); `group` determines whether an incident is bucketed as "IT" or "RED" via a regex on the group name (`areaOf()`), not an explicit field.

`IncidentBase` fields in `schemas.py` should always have defaults (booleans especially — `ministry`/`platform` learned this the hard way). `PUT /api/reports/{id}` (used by the editor's auto-save) validates its `incidents` payload against `IncidentBase` just like create/response do, so a required field with no default there means *any* incident ever saved without it (an old client, a partial CSV import, a schema field added after data already existed) permanently 500s every future `GET` of that report, since `ReportResponse` re-validates on the way out.

Some incident fields hold delimited multi-line text parsed client-side into structured rows — `metrics` (`"label | value"` per line, parsed by `metricsArr()`) and `actionPoints` (`"AP | Tipo de AP | Descripción"` per line, parsed by `actionPointsArr()`), both rendered as small card lists rather than plain paragraphs. `actionPoints` pairs with `solution` the same way `metrics` pairs with `impact`: one column, structured cards then/or free text stacked together under a single header.

`app/report-render.js` is the single source of truth for anything derived from the incident list (aggregate stats or picks), shared by `app.js`, `home.js` and `buildPptxDeck()` so the editor, the dashboard's exports, and the PPTX never disagree — `computeStats()` (totals/severity/marca counts), `weekdayBreakdown()`, `sortIncidents()`/`compareIncidents()`, and `highlightIncident(incidents, area)` (the executive summary's "incidencia más destacada" per IT/RED: highest severity within that area's own scale, tied-broken by duration, then by order of appearance — unless one or more incidents in that area have `featured: true`, in which case the pick is restricted to just those, letting a report author manually pin a specific incident instead of whatever the automatic ranking would choose). Add any new incident-derived aggregate here, not inside `app.js`/`home.js` directly.

**`app/home.js` duplicates significant chunks of `app.js`** rather than importing/sharing them — most notably its own copies of `metricsArr()`/`actionPointsArr()`, and entirely separate PDF (`downloadPDF()`, via `html2pdf()`) and PPTX (`downloadPPTX()`, mirroring `exportPPTX()`'s per-incident-slide loop almost line-for-line) builders, used for the "download without opening the editor" buttons on the dashboard. When you touch an incident field's rendering or export logic in `app.js`, grep `home.js` for the same field name too — it's very easy to update one and silently leave the other stale (as already happened once: `home.js`'s `downloadPDF()` never rendered `metrics` at all, unlike its PPTX builder).

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/002-junior-ops-deploy-docs/plan.md`
<!-- SPECKIT END -->
