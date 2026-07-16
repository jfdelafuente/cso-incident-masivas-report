# Contracts: Dashboard del Resumen Ejecutivo

No se definen contratos nuevos en esta carpeta.

Esta feature no añade, modifica ni elimina ningún endpoint de `backend/main.py`, ni cambia la forma de `IncidentBase`/`ReportResponse` en `backend/schemas.py`. Es una mejora puramente de presentación sobre la respuesta ya existente de `GET /api/reports/{id}`: toda la lógica nueva (`highlightIncident()`) se ejecuta en el frontend, sobre datos que el cliente ya recibe hoy.

Si una fase posterior de esta feature necesitara mover la selección de la incidencia destacada al backend (por ejemplo, para cachearla), este README debería sustituirse por el contrato del campo/endpoint afectado.
