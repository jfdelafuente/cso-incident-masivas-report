from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db, check_db_ready
from services.legacy_pptx_service import LegacyPptxService
from services.executive_service import ExecutiveReportService

router = APIRouter(tags=["Health & Probes"])


@router.get("/healthz")
def healthz():
    """Liveness probe: verifica que el servicio web está activo y respondiendo."""
    return {
        "status": "ok",
        "service": "cso-incident-reporting-backend",
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/readyz")
def readyz():
    """Readiness probe: verifica dependencias (base de datos y motor PPTX)."""
    db_ok = check_db_ready()
    reports_dir = ExecutiveReportService.get_reports_dir()

    return {
        "status": "ready" if db_ok else "degraded",
        "database": "ok" if db_ok else "error",
        "legacyPptxEngine": "available" if LegacyPptxService.is_available() else "unavailable",
        "executiveReportEngine": "available" if ExecutiveReportService.is_available() else "unavailable",
        "executiveReportsDir": reports_dir,
    }


@router.get("/api/health")
def health_check():
    """Health check legacy endpoint."""
    return {"status": "ok", "service": "Reportes de Incidencias API"}

