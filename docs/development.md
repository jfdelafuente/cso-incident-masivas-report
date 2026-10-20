# 💻 Guía de Desarrollo Local

Instrucciones para levantar el entorno de desarrollo y probar la API y generadores localmente.

---

## 🏗️ Arquitectura de Desarrollo

Este repositorio contiene el **Backend FastAPI** y los **generadores PPTX**. El **Frontend web oficial** reside integrado en el repositorio hermano:
`release-dashboard-application/dashboards/reportes-incidencias/`

```
┌──────────────────────────────────────────────┐       HTTP REST
│ release-dashboard-application                │ ──────────────────► ┌──────────────────────────────────────────┐
│ dashboards/reportes-incidencias/             │   (:8081 / :8089)   │ cso-incident-masivas-report              │
│ (Frontend HTML/JS/CSS con topbar unificada)  │                     │ backend/main.py (:8000)                  │
└──────────────────────────────────────────────┘                     │ - SQLite local (reports.db)              │
                                                                     │ - Motor report_generator/                │
                                                                     └──────────────────────────────────────────┘
```

---

## 🚀 1. Arranque Rápido del Backend

### En Windows (PowerShell / Doble Clic):
Ejecuta [`start-local.bat`](../start-local.bat) en la raíz o [`backend/start-backend.bat`](../backend/start-backend.bat):
```powershell
.\start-local.bat
```
*(Crea o activa automáticamente el entorno virtual `backend/venv`, instala dependencias e inicia el servidor en el puerto 8000)*.

### En Linux / Mac / WSL:
Ejecuta [`start-local.sh`](../start-local.sh) o [`backend/start-backend.sh`](../backend/start-backend.sh):
```bash
chmod +x start-local.sh
./start-local.sh
```

---

## ⚙️ 2. Configuración Manual Paso a Paso

Si prefieres gestionar el entorno manualmente:

### Paso 1: Crear y activar entorno virtual
```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate

# Linux / Mac:
source venv/bin/activate
```

### Paso 2: Instalar dependencias
```bash
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
```

### Paso 3: Configurar variables (.env)
Opcionalmente crea un archivo `.env` en `backend/` basándote en `.env.example`:
```ini
ENVIRONMENT=development
BACKEND_PORT=8000
DATABASE_URL=sqlite:///reports.db
EXECUTIVE_REPORTS_OUTPUT_DIR=data/reports/executive
CORS_ORIGINS=http://localhost:8080,http://localhost:8081,http://127.0.0.1:8080,http://127.0.0.1:8081
```

### Paso 4: Iniciar el servidor
```bash
python main.py
# o bien con recarga en caliente:
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Paso 5: Ejecutar los tests unitarios
```bash
python tests/run_all.py
```

---

## 📍 3. Endpoints de Documentación y Sondas

Una vez arrancado el servicio en `http://localhost:8000`:
- **Documentación Swagger UI interactiva**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Documentación ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Sonda de Liveness**: `GET http://localhost:8000/healthz`
- **Sonda de Readiness**: `GET http://localhost:8000/readyz`

---

## 🔗 4. Conexión con el Frontend Oficial

Para probar la interfaz gráfica completa en desarrollo:
1. Dirígete al repositorio `release-dashboard-application`.
2. Inicia el servidor estático del frontend (`python serve_app.py` o similar).
3. Accede a `http://localhost:8081/dashboards/reportes-incidencias/`.
4. El cliente HTTP del frontend (`api-client.js`) detectará `localhost` y se comunicará automáticamente con tu backend en `http://localhost:8000`.

