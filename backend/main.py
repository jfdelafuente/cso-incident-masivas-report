from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime
from pathlib import Path
import json
import os
import subprocess
import sys

from models import Base, Report
from schemas import ReportCreate, ReportUpdate, ReportResponse, IncidentBase

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

DASHBOARD_CONVERTER_SCRIPTS = {
    "massive": RELEASE_DASHBOARD_ROOT / "converters" / "cli" / "convert_incidents.py",
    "postmortem": RELEASE_DASHBOARD_ROOT / "converters" / "cli" / "convert_postmortems.py",
}

@app.post("/api/upload")
async def upload_dashboard_csv(file: UploadFile = File(...), type: str = Form("massive")):
    """Guarda un CSV de Release Dashboard en data/input y lo convierte a JSON"""
    filename = Path(file.filename).name
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="El archivo debe tener extensión .csv")

    script_path = DASHBOARD_CONVERTER_SCRIPTS.get(type, DASHBOARD_CONVERTER_SCRIPTS["massive"])
    if not script_path.exists():
        raise HTTPException(status_code=500, detail=f"Converter no encontrado: {script_path}")

    input_dir = RELEASE_DASHBOARD_ROOT / "data" / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    csv_path = input_dir / filename
    csv_path.write_bytes(await file.read())

    result = subprocess.run(
        [sys.executable, str(script_path), str(csv_path)],
        capture_output=True,
        text=True,
        cwd=str(RELEASE_DASHBOARD_ROOT)
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"El CSV se guardó pero falló la conversión a JSON: {(result.stdout + result.stderr)[-2000:]}"
        )

    return {"success": True, "message": f"{filename} guardado en data/input/ y convertido correctamente"}

# ============ CRUD Operations ============

@app.post("/api/reports", response_model=ReportResponse)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    """Create a new report for a specific week"""
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
        incidents=report.incidents if report.incidents else [],
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

@app.post("/api/reports/import")
def import_report(report_data: dict, db: Session = Depends(get_db)):
    """Import a report from JSON"""
    required_fields = ['year', 'week', 'range', 'dept']
    missing = [f for f in required_fields if f not in report_data]
    if missing:
        raise HTTPException(status_code=400, detail=f"Faltan campos obligatorios en el JSON: {', '.join(missing)}")

    report_id = f"{report_data['year']}-W{str(report_data['week']).zfill(2)}"

    existing = db.query(Report).filter(Report.id == report_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Report for {report_id} already exists")

    try:
        db_report = Report(
            id=report_id,
            year=report_data['year'],
            week=report_data['week'],
            range=report_data['range'],
            dept=report_data['dept'],
            incidents=report_data.get('incidents', []),
            status=report_data.get('status', 'draft'),
            created_by=report_data.get('createdBy'),
            notes=report_data.get('notes'),
        )
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
        return db_report.to_dict()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============ Health Check ============

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "Reportes de Incidencias API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
