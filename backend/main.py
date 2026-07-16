from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime
from pathlib import Path
import json
import os
import sys

from models import Base, Report
from schemas import ReportCreate, ReportUpdate, ReportResponse

# Database setup
DATABASE_URL = "sqlite:///./reports.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(title="Reportes de Incidencias API", version="1.0.0")

# CORS configuration - allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
from upload_csv import run_upload  # noqa: E402

@app.post("/api/upload")
async def upload_dashboard_csv(
    file: UploadFile = File(...),
    type: str = Form("massive"),
    release_name: str = Form(None),
):
    """Guarda un CSV de Release Dashboard en data/input y lo convierte a JSON"""
    filename = Path(file.filename).name
    if not filename.lower().endswith(".csv"):
        return JSONResponse(status_code=400, content={"success": False, "error": "El archivo debe tener extensión .csv"})

    if type == "postmortem" and not release_name:
        return JSONResponse(status_code=400, content={"success": False, "error": "Falta el nombre de la release (release_name)"})

    input_dir = RELEASE_DASHBOARD_ROOT / "data" / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    csv_path = input_dir / filename
    csv_path.write_bytes(await file.read())

    result = run_upload(csv_path, type, RELEASE_DASHBOARD_ROOT, release_name)
    return JSONResponse(status_code=200 if result["success"] else 500, content=result)

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
    """Update a report's incidents, status, or notes"""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

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

# ============ Health Check ============

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "Reportes de Incidencias API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
