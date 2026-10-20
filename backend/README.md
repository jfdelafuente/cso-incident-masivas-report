# Backend — Reportes de Incidencias API (FastAPI)

API REST desarrollada con **FastAPI** para la gestión persistente de informes semanales de incidencias IT + RED, generación de presentaciones PowerPoint editables y motor unificado de Informes Ejecutivos para aplicaciones de ORANGE.

---

## 🚀 Instalación y Desarrollo Local

### 1. Entorno Virtual

```bash
cd backend
python -m venv venv

# En Windows:
venv\Scripts\activate

# En Mac/Linux:
source venv/bin/activate
```

### 2. Dependencias

```bash
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
```

### 3. Configuración de Entorno (.env)

Copia `.env.example` a `.env` si necesitas sobreescribir los valores por defecto:

```bash
cp .env.example .env
```

Variables soportadas:
- `ENVIRONMENT`: `development` | `production`
- `BACKEND_PORT`: Puerto HTTP (por defecto `8000`).
- `DATABASE_URL`: Cadena de conexión SQLite (ej. `sqlite:///reports.db` en local, `sqlite:////infocodes/var/data/cso-incident-masivas-report/reports.db` en servidor).
- `EXECUTIVE_REPORTS_OUTPUT_DIR`: Ruta de almacenamiento de los ficheros `.pptx` ejecutivos (por defecto `/infocodes/var/storage/executive_pptx` en producción).
- `RELEASE_DASHBOARD_ROOT`: Ruta raíz del proyecto hermano `release-dashboard-application` para conversores de CSV y postmortems.
- `CORS_ORIGINS`: Lista de orígenes autorizados separados por coma.

### 4. Arrancar el Servidor

```bash
python main.py
# o bien:
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Documentación interactiva Swagger: **http://localhost:8000/docs**
- Documentación alternativa ReDoc: **http://localhost:8000/redoc**

### 5. Ejecutar la Batería de Tests Unitarios

El backend cuenta con una suite de pruebas automatizadas (in-memory SQLite, sin dependencias externas):

```bash
python tests/run_all.py
```

---

## 🏛️ Estructura y Arquitectura Modular

El backend sigue un diseño desacoplado en capas de responsabilidad única:

```
backend/
├── main.py              # Punto de entrada ASGI (~55 líneas), compatibilidad de deploy y arranque uvicorn
├── models.py            # Modelos ORM SQLAlchemy (ReportModel, etc.)
├── schemas.py           # Esquemas de validación Pydantic v2
├── core/                # Infraestructura central y configuración
│   ├── config.py        # Settings centralizados (rutas /infocodes, CORS, BD, variables de entorno)
│   ├── database.py      # Motor SQLAlchemy, SessionLocal, init_db() y get_db()
│   └── middleware.py    # Configuración CORS, tiempos de respuesta y trazabilidad (X-Request-ID)
├── services/            # Lógica de negocio independiente del transporte HTTP
│   ├── report_service.py      # CRUD de informes semanales y duplicación
│   ├── legacy_pptx_service.py # Generación de PowerPoint semanal vía scripts/
│   ├── executive_service.py   # Motor de informes ejecutivos (Jira/Confluence/postmortems)
│   └── dashboard_service.py   # Conversores CSV y postmortems de releases
├── api/                 # Capa de transporte y controladores HTTP (FastAPI APIRouters)
│   ├── router.py        # Agregador central api_router
│   └── routes/          # Rutas agrupadas por dominio
│       ├── health.py        # /healthz, /readyz, /api/health
│       ├── reports.py       # CRUD /api/reports
│       ├── legacy_pptx.py   # /api/reports/{id}/legacy-pptx
│       ├── executive.py     # /api/v1/reports/executive-incident
│       └── dashboard.py     # /api/upload y /api/reports/postmortem
└── tests/               # Pruebas unitarias
    ├── run_all.py
    ├── test_core_and_probes.py
    └── test_report_service.py
```

---

## 📋 Catálogo de Endpoints

### 1. Reportes Semanales (CRUD)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/reports` | Crear nuevo informe semanal (id format `YYYY-Www`) |
| `GET` | `/api/reports` | Listar todos los informes guardados |
| `GET` | `/api/reports/{report_id}` | Obtener detalle de un informe concreto |
| `PUT` | `/api/reports/{report_id}` | Actualizar datos, incidencias, rango, notas o estado |
| `DELETE` | `/api/reports/{report_id}` | Eliminar informe de la base de datos |
| `POST` | `/api/reports/{report_id}/duplicate?new_week=ww` | Duplicar informe hacia una nueva semana |
| `GET` | `/api/reports/{report_id}/export` | Exportar payload completo en JSON |

### 2. Exportación PowerPoint Semanal

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/reports/{report_id}/legacy-pptx` | Genera y descarga el archivo `.pptx` del informe semanal usando la plantilla corporativa oficial |

### 3. Motor de Informes Ejecutivos (Single Source of Truth)

Servicio utilizado por **Gestión de Problemas** y **Release Dashboard**:

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/reports/executive-incident`<br>*(alias `/api/reports/executive-incident`)* | Genera (o recupera de caché) el PowerPoint ejecutivo a partir de Jira/Confluence. Admite parámetro `async=true` para encolado en segundo plano (devuelve `202 Accepted`) |
| `GET` | `/api/v1/reports/executive-incident/{incident_ref}/status`<br>*(alias `/api/reports/executive-incident/{incident_ref}/status`)* | Consulta si el informe ya está generado en disco (`READY`), en proceso (`PROCESSING`) o no encontrado |
| `GET` | `/api/v1/reports/executive-incident/{incident_ref}`<br>*(alias `/api/reports/executive-incident/{incident_ref}`)* | Descarga directa del archivo PowerPoint ejecutivo generado (.pptx) |
| `POST` | `/api/v1/reports/executive-incident/cleanup` | Purga manual o automática de ficheros antiguos generados en disco |

### 4. Integración Release Dashboard & Postmortems

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/upload` | Carga de CSV de Release Dashboard (con límite de tamaño 10 MB) y conversión |
| `GET` | `/api/reports/postmortem/{release_name}` | Genera y descarga el informe postmortem de una release |
| `POST` | `/api/reports/postmortem/batch` | Generación por lotes de postmortems para todas las releases disponibles |

### 5. Sondas de Salud y Observabilidad

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/healthz` | **Liveness probe**: Verifica que FastAPI está vivo y respondiendo |
| `GET` | `/readyz` | **Readiness probe**: Verifica conexión a base de datos y disponibilidad del motor PPTX |
| `GET` | `/api/health` | **Health check legacy**: Endpoint histórico para compatibilidad con Nginx y proxies previos |

---

## 🗄️ Arquitectura de Persistencia Desacoplada (`/infocodes/var/`)

En el entorno de producción (`/infocodes`), el backend opera de forma **stateless** (sin estado propio dentro del código):

1. **Base de Datos SQLite**:
   - Ruta: `/infocodes/var/data/cso-incident-masivas-report/reports.db`
   - Migración transparente: Al arrancar por primera vez, si detecta una base legacy en `backend/reports.db`, la migra automáticamente sin pérdida de datos.
2. **Almacenamiento de Informes PPTX**:
   - Ruta: `/infocodes/var/storage/executive_pptx/`
   - Directorio compartido con la aplicación `gestion-problemas-dashboard`.
3. **Control del Proceso (PID)**:
   - Ruta: `/infocodes/var/run/cso-backend.pid`
4. **Copias de Seguridad**:
   - Ruta: `/infocodes/var/backups/cso-incident-masivas-report/`
5. **Logs de Aplicación**:
   - Ruta: `/infocodes/logs/cso-incident-masivas-report/backend.log`

---

## 🔍 Trazabilidad y Cabeceras HTTP

Todas las peticiones entrantes son interceptadas por el middleware de traza que inyecta:
- `X-Request-ID`: Identificador único de solicitud (reutiliza el enviado por el cliente o genera uno nuevo `req-xxxxxxxxxx`).
- `X-Process-Time`: Tiempo total de ejecución en el servidor (ej. `12.4ms`).
