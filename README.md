# Automatización de reportes semanales — Reportes de Incidencias

Herramienta interna de MASORANGE que convierte el listado semanal de incidencias IT + RED en un dossier de slides con estilo corporativo (vista web, PDF y PowerPoint editable), sustituyendo el PowerPoint que antes se montaba a mano.

Frontend en HTML/CSS/JS puro (sin build) + backend FastAPI con SQLite para persistencia.

## Empezar

- **Ejecutar en local**: ver [`START_LOCAL.md`](START_LOCAL.md).
- **Arquitectura del código** (frontend/backend, cómo encajan las piezas): ver [`CLAUDE.md`](CLAUDE.md).

## Desplegar y operar

- **Desplegar/actualizar en staging**: ver [`STAGING_DEPLOYMENT.md`](STAGING_DEPLOYMENT.md) (flujo real, `deploy.sh`) y [`DEPLOYMENT.md`](DEPLOYMENT.md) (referencia manual paso a paso).
- **Operación del día a día** (arrancar/parar el backend, backups, restauración, rotación de logs, chequeo de salud, resolución de problemas): ver [`MANUAL_OPERADOR.md`](MANUAL_OPERADOR.md).

## Estructura

- `app/` — frontend estático (dashboard, editor, vista previa).
- `backend/` — API FastAPI + SQLite (`service.sh` para gestionarla, `maintenance.sh` para backup/mantenimiento).
- `deploy.sh`, `nginx.conf` — despliegue a staging.

No hay build de frontend, ni suite de tests, ni linter configurado en este repo.
