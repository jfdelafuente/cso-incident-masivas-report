# Contracts: Agrupar incidencias por categorización en una slide

No aplica — esta feature no añade ni modifica ninguna API del backend, ni ningún contrato externo. Es un cambio puramente de renderizado en el frontend (`app/report-render.js`, `app/app.js`, `app/home.js`): agrupa incidencias ya existentes en menos slides, sin tocar `backend/main.py`, `backend/schemas.py` ni el modelo de datos de `reports.db`.

La única "interfaz" nueva es interna al frontend: la función `groupIncidentsForSlides(incidents)` añadida a `window.ReportRender` (ver `data-model.md`), consumida por `app.js`, `home.js` y `buildPptxDeck()` — no es un contrato expuesto a otros sistemas, solo un helper compartido entre scripts del mismo frontend.
