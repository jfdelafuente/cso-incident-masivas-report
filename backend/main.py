"""Punto de entrada principal del backend FastAPI — Reportes de Incidencias.

Arquitectura modular por capas:
- core/: Configuración, base de datos y middlewares de trazabilidad
- models.py: Modelos ORM SQLAlchemy
- schemas.py: Esquemas Pydantic v2
- services/: Capa de lógica de negocio desacoplada de la capa de transporte
- api/: Controladores y routers de endpoints REST (FastAPI APIRouter)
- report_generator/: Motor autónomo de Informes Ejecutivos PPTX
"""

import sys
from pathlib import Path

# Asegurar que el directorio backend esté en sys.path
_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from fastapi import FastAPI
from core.config import settings
from core.database import engine, SessionLocal, init_db, get_db
from core.middleware import setup_middlewares
from models import Base
from api.router import api_router

# Exportaciones para retrocompatibilidad con scripts de despliegue y mantenimiento
__all__ = ["app", "Base", "engine", "SessionLocal", "get_db"]


def create_application() -> FastAPI:
    """Fábrica de la aplicación FastAPI."""
    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # 1. Configurar Middlewares (CORS, Trazabilidad X-Request-ID, X-Process-Time)
    setup_middlewares(application)

    # 2. Inicializar tablas en base de datos si no existen
    init_db()

    # 3. Registrar routers modulares de la API
    application.include_router(api_router)

    return application


app = create_application()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.RELOAD,
        reload_dirs=[str(settings.BACKEND_DIR)] if settings.RELOAD else None,
    )
