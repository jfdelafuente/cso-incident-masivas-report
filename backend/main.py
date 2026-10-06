from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime
from pathlib import Path
import json
import os
import sys

from models import Base, Report
from schemas import ReportCreate, ReportUpdate, ReportResponse

# ============ Legacy PPTX Export ============
SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

try:
    from export_legacy_pptx import generate_legacy_pptx_bytes
    LEGACY_PPTX_AVAILABLE = True
except Exception as e:
    generate_legacy_pptx_bytes = None
    LEGACY_PPTX_AVAILABLE = False

# Database setup
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    db_file = Path(__file__).resolve().parent / "reports.db"
    DATABASE_URL = f"sqlite:///{db_file}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(title="Reportes de Incidencias API", version="1.0.0")

# CORS configuration - allow frontend
allowed_origins_env = os.environ.get("CORS_ORIGINS", "")
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()] or [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://10.132.68.85:8081",
    "http://infocodes.si.orange.es:8081",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============ Release Dashboard CSV Upload ============
# Repo hermano: mismo padre en local (proyectos/) y en producción (/infocodes/)
RELEASE_DASHBOARD_ROOT = Path(os.environ.get(
    "RELEASE_DASHBOARD_ROOT",
    str(Path(__file__).resolve().parent.parent.parent / "release-dashboard-application")
))

# La orquestación "CSV guardado -> conversor -> resultado" vive una sola vez
# en converters/cli/upload_csv.py (repo release-dashboard-application), para
# que este backend y el servidor de desarrollo de ese repo (serve_app.py)
# compartan exactamente el mismo contrato de éxito/error.
sys.path.insert(0, str(RELEASE_DASHBOARD_ROOT / "converters" / "cli"))
try:
    from upload_csv import run_upload  # noqa: E402
    from generate_postmortem_report import generate_report, generate_all_reports  # noqa: E402
    DASHBOARD_INTEGRATION_AVAILABLE = True
except ImportError:
    run_upload = None
    generate_report = None
    generate_all_reports = None
    DASHBOARD_INTEGRATION_AVAILABLE = False

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB límite

@app.post("/api/upload")
async def upload_dashboard_csv(
    file: UploadFile = File(...),
    type: str = Form("massive"),
    release_name: str = Form(None),
):
    """Guarda un CSV de Release Dashboard en data/input y lo convierte a JSON"""
    if not DASHBOARD_INTEGRATION_AVAILABLE:
        return JSONResponse(status_code=503, content={"success": False, "error": "Módulo de integración con Release Dashboard no disponible"})

    filename = Path(file.filename).name
    if not filename.lower().endswith(".csv"):
        return JSONResponse(status_code=400, content={"success": False, "error": "El archivo debe tener extensión .csv"})

    if type == "postmortem" and not release_name:
        return JSONResponse(status_code=400, content={"success": False, "error": "Falta el nombre de la release (release_name)"})

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        return JSONResponse(status_code=413, content={"success": False, "error": f"El archivo supera el tamaño máximo permitido ({MAX_UPLOAD_SIZE // (1024 * 1024)}MB)"})

    input_dir = RELEASE_DASHBOARD_ROOT / "data" / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    csv_path = input_dir / filename
    csv_path.write_bytes(content)

    result = run_upload(csv_path, type, RELEASE_DASHBOARD_ROOT, release_name)
    return JSONResponse(status_code=200 if result["success"] else 500, content=result)

# ============ Informe PPT de Postmortem por Release ============
# Misma orquestación compartida que /api/upload: la lógica vive una sola vez
# en converters/cli/generate_postmortem_report.py (repo release-dashboard-application).

@app.get("/api/reports/postmortem/{release_name}")
def download_postmortem_report(release_name: str):
    """Genera (o regenera) el informe .pptx de una release y lo devuelve como descarga."""
    if not DASHBOARD_INTEGRATION_AVAILABLE:
        raise HTTPException(status_code=503, detail="Módulo de generación de informes postmortem no disponible")

    try:
        result = generate_report(release_name, project_root=RELEASE_DASHBOARD_ROOT)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo generar el informe: {e}")

    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])

    pptx_path = Path(result["path"])
    return Response(
        content=pptx_path.read_bytes(),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{pptx_path.name}"'},
    )

@app.post("/api/reports/postmortem/batch")
def generate_postmortem_reports_batch():
    """Genera el informe de todas las releases con datos de postmortem disponibles."""
    if not DASHBOARD_INTEGRATION_AVAILABLE:
        raise HTTPException(status_code=503, detail="Módulo de generación de informes postmortem no disponible")
    return generate_all_reports(project_root=RELEASE_DASHBOARD_ROOT)

# ============ CRUD Operations ============

@app.post("/api/reports", response_model=ReportResponse)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    """Create a new report for a specific week. Also used to import a
    previously-exported report (see ReportCreate's field aliases) -- there's
    no separate import endpoint since it would do exactly the same thing."""
    report_id = f"{report.year}-W{str(report.week).zfill(2)}"

    existing = db.query(Report).filter(Report.id == report_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Report for {report_id} already exists")

    db_report = Report(
        id=report_id,
        year=report.year,
        week=report.week,
        range=report.range,
        dept=report.dept,
        incidents=[inc.model_dump() for inc in report.incidents],
        status=report.status,
        created_by=report.created_by,
        notes=report.notes,
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report.to_dict()

@app.get("/api/reports", response_model=list)
def list_reports(db: Session = Depends(get_db)):
    """List all reports, ordered by year and week (descending)"""
    reports = db.query(Report).order_by(desc(Report.year), desc(Report.week)).all()
    return [r.to_dict() for r in reports]

@app.get("/api/reports/{report_id}", response_model=ReportResponse)
def get_report(report_id: str, db: Session = Depends(get_db)):
    """Get a specific report by ID (format: YYYY-WXX)"""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.to_dict()

@app.put("/api/reports/{report_id}", response_model=ReportResponse)
def update_report(report_id: str, update: ReportUpdate, db: Session = Depends(get_db)):
    """Update a report's incidents, status, notes, range, or dept"""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if update.range is not None:
        report.range = update.range
    if update.dept is not None:
        report.dept = update.dept
    if update.incidents is not None:
        report.incidents = [inc.model_dump() for inc in update.incidents]
    if update.status is not None:
        report.status = update.status
    if update.notes is not None:
        report.notes = update.notes

    report.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(report)
    return report.to_dict()

@app.delete("/api/reports/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    """Delete a report"""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    db.delete(report)
    db.commit()
    return {"message": f"Report {report_id} deleted successfully"}

# ============ Additional Operations ============

@app.post("/api/reports/{report_id}/duplicate", response_model=ReportResponse)
def duplicate_report(report_id: str, new_week: int = Query(...), db: Session = Depends(get_db)):
    """Duplicate a report to a new week"""
    source_report = db.query(Report).filter(Report.id == report_id).first()
    if not source_report:
        raise HTTPException(status_code=404, detail="Source report not found")

    new_report_id = f"{source_report.year}-W{str(new_week).zfill(2)}"
    existing = db.query(Report).filter(Report.id == new_report_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Report for {new_report_id} already exists")

    new_report = Report(
        id=new_report_id,
        year=source_report.year,
        week=new_week,
        range=source_report.range,
        dept=source_report.dept,
        incidents=source_report.incidents.copy() if source_report.incidents else [],
        status="draft",
        created_by=source_report.created_by,
        notes=f"Duplicated from {report_id}",
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    return new_report.to_dict()

@app.get("/api/reports/{report_id}/export")
def export_report(report_id: str, db: Session = Depends(get_db)):
    """Export a report as JSON"""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return report.to_dict()
 
@app.get("/api/reports/{report_id}/legacy-pptx")
@app.get("/api/reports/{report_id}/export/legacy-pptx")
def download_legacy_pptx(report_id: str, db: Session = Depends(get_db)):
    """Exporta el reporte en formato PPTX antiguo (legacy) y lo devuelve como archivo descargable."""
    if not LEGACY_PPTX_AVAILABLE:
        raise HTTPException(status_code=503, detail="Módulo de exportación PPTX legacy no disponible en el servidor")

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report_dict = report.to_dict()
    try:
        content = generate_legacy_pptx_bytes(report_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PowerPoint legacy: {e}")

    year = report_dict.get("year", 2026)
    week = str(report_dict.get("week", 1)).zfill(2)
    filename = f"{year}W{week}_ReporteIncidencias_Legacy.pptx"

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.post("/api/reports/export/legacy-pptx")
def export_custom_legacy_pptx(report_data: dict):
    """Genera una presentación PPTX en formato antiguo (legacy) a partir de un JSON de reporte arbitrario."""
    if not LEGACY_PPTX_AVAILABLE:
        raise HTTPException(status_code=503, detail="Módulo de exportación PPTX legacy no disponible en el servidor")

    try:
        content = generate_legacy_pptx_bytes(report_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PowerPoint legacy: {e}")

    meta = report_data.get("meta") if isinstance(report_data.get("meta"), dict) else {}
    year = report_data.get("year") or meta.get("year", 2026)
    week_val = report_data.get("week") if report_data.get("week") is not None else meta.get("week", "")
    week_str = f"W{str(week_val).zfill(2)}" if week_val != "" else ""
    filename = f"{year}{week_str}_ReporteIncidencias_Legacy.pptx"

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

# ============ Health Check ============

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "Reportes de Incidencias API"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("BACKEND_PORT", os.environ.get("PORT", 8000)))
    reload_env = os.environ.get("RELOAD", "true").lower() in ("true", "1", "yes")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload_env)
