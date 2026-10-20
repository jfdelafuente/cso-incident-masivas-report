# 📡 Referencia de la API REST

Documentación detallada de los endpoints expuestos por el backend FastAPI (`backend/main.py`).

---

## 🩺 1. Sondas de Salud y Diagnóstico

| Método | Endpoint | Descripción | Respuesta Exitosa |
|---|---|---|---|
| `GET` | `/healthz`<br>`/api/health` | **Liveness Probe**: Comprueba si el servidor web está activo y respondiendo. | `200 OK` `{"status":"ok", ...}` |
| `GET` | `/readyz` | **Readiness Probe**: Comprueba la conectividad con la base de datos SQLite y la disponibilidad de los motores de generación PPTX. | `200 OK` `{"status":"ready", "database":"ok", "legacyPptxEngine":"available", ...}` |

---

## 📊 2. Reportes Semanales (CRUD)

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/reports` | Crea un nuevo informe semanal (`id` formato `YYYY-Www`). Devuelve `409 Conflict` si ya existe esa semana. |
| `GET` | `/api/reports` | Lista todos los informes guardados (resumen ordenado por fecha descendente). |
| `GET` | `/api/reports/{report_id}` | Obtiene el detalle completo del informe y su array de incidencias. |
| `PUT` | `/api/reports/{report_id}` | Actualiza el informe (incidencias, rango, notas, estado `draft`/`reviewed`/`published`). |
| `DELETE` | `/api/reports/{report_id}` | Elimina el informe de la base de datos. |
| `POST` | `/api/reports/{report_id}/duplicate?new_week=ww` | Clona un informe existente asignándole una nueva semana. |
| `GET` | `/api/reports/{report_id}/export` | Exporta el payload íntegro en formato JSON. |

---

## 📑 3. Exportación PowerPoint Semanal

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/reports/{report_id}/legacy-pptx` | Genera y descarga el archivo `.pptx` del informe semanal aplicando la plantilla oficial corporativa (`legacy_template.pptx`). |
| `POST` | `/api/reports/export/legacy-pptx` | Genera y descarga al vuelo el archivo `.pptx` a partir de un payload JSON en el body, sin requerir persistirlo previamente en base de datos. |

---

## 🎯 4. Motor de Informes Ejecutivos Postmortem (SSOT)

Servicio autónomo consumido por **Gestión de Problemas Dashboard** (`/problemas`):

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/v1/reports/executive-incident`<br>*(alias: `/api/reports/executive-incident`)* | Genera o recupera de caché el informe PowerPoint de una incidencia postmortem a partir de datos estructurados de Jira/Confluence.<br>Soporta parámetro `async=true` (devuelve `202 Accepted` y procesa en segundo plano con `BackgroundTasks`). |
| `GET` | `/api/v1/reports/executive-incident/{incident_ref}/status`<br>*(alias: `/api/reports/executive-incident/{incident_ref}/status`)* | Consulta el estado del informe (`PROCESSING`, `READY`, `FAILED`, `NOT_FOUND`). |
| `GET` | `/api/v1/reports/executive-incident/{incident_ref}`<br>*(alias: `/api/reports/executive-incident/{incident_ref}`)* | Descarga directa del archivo binario `.pptx` generado para la incidencia indicada. |
| `POST` | `/api/v1/reports/executive-incident/cleanup` | Purga archivos PPTX ejecutivos generados en disco más antiguos que `max_age_days` (por defecto 14 días), conservando un mínimo de `keep_min` archivos. |

---

## 🚀 5. Integración con Release Dashboard

Servicio consumido por **Release Dashboard Application** (`/dashboards`):

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/upload` | Carga de archivo CSV de releases (máx. 10 MB) para procesamiento y extracción. |
| `GET` | `/api/reports/postmortem/{release_name}` | Genera y devuelve el informe postmortem de una release concreta. |
| `POST` | `/api/reports/postmortem/batch` | Genera postmortems en lote para todas las releases registradas. |

---

## 🏷️ 6. Cabeceras HTTP de Diagnóstico

Todas las respuestas de la API incluyen cabeceras estándar para trazabilidad y observabilidad:
* `X-Request-ID`: Identificador unívoco de la petición para seguimiento en logs.
* `X-Process-Time`: Duración del procesamiento en el servidor (ej. `3.4ms`).

