# Backend - Reportes de Incidencias API

FastAPI backend para gestión de informes semanales de incidencias IT + RED.

## 🚀 Instalación

### 1. Crear entorno virtual (recomendado)

```bash
cd backend
python -m venv venv

# En Windows:
venv\Scripts\activate

# En Mac/Linux:
source venv/bin/activate
```

### 2. Instalar dependencias

```bash
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
```

## 🏃 Ejecutar el servidor

```bash
python main.py
```

O con uvicorn directamente:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

El servidor estará disponible en: **http://localhost:8000**

## 📚 API Documentation

Una vez que el servidor esté corriendo:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 📋 Endpoints

### Reportes (CRUD)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/reports` | Crear nuevo informe |
| GET | `/api/reports` | Listar todos los informes |
| GET | `/api/reports/{report_id}` | Obtener informe específico |
| PUT | `/api/reports/{report_id}` | Actualizar informe |
| DELETE | `/api/reports/{report_id}` | Eliminar informe |

### Operaciones adicionales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/reports/{report_id}/duplicate?new_week=27` | Duplicar informe a nueva semana |
| GET | `/api/reports/{report_id}/export` | Exportar como JSON |
| POST | `/api/reports/import` | Importar desde JSON |
| GET | `/api/health` | Health check |

## 🗄️ Base de datos

- **Tipo**: SQLite
- **Archivo**: `reports.db` (se crea automáticamente)
- **ORM**: SQLAlchemy

## 📝 Estructura del informe

```json
{
  "id": "2026-W26",
  "year": 2026,
  "week": 26,
  "range": "22 – 26 junio 2026",
  "dept": "Customer & Service Operations",
  "incidents": [...],
  "status": "draft",
  "createdBy": "usuario",
  "createdAt": "2026-07-03T10:00:00",
  "updatedAt": "2026-07-03T10:30:00",
  "notes": "..."
}
```

## 🔄 CORS

El backend acepta requests desde cualquier origen (CORS habilitado para desarrollo).

En producción, ajusta `allow_origins` en `main.py`.

## 🐛 Troubleshooting

**Error: "ModuleNotFoundError"**
- Verifica que el entorno virtual está activado
- Ejecuta: `pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt`

**Error: "Address already in use"**
- El puerto 8000 está ocupado
- Cambia el puerto: `uvicorn main:app --port 8001`

**Error: "database is locked"**
- SQLite tiene una limitación con concurrencia
- En producción, considera migrar a PostgreSQL
