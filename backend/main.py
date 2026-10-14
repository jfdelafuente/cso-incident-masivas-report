from fastapi import FastAPI, HTTPException, Query, Depends, UploadFile, File, Form, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime
from pathlib import Path
import json
import os
import sys
import time
import uuid

from models import Base, Report
from schemas import (
    ReportCreate,
    ReportUpdate,
    ReportResponse,
    ExecutiveReportRequestSchema,
    ExecutiveReportResponseSchema,
    ExecutiveReportStatusResponseSchema,
)

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
# Prioridad de resolución de la base de datos:
# 1. Variable de entorno DATABASE_URL (si viene explícita)
# 2. En producción Linux con /infocodes:
#    /infocodes/var/data/cso-incident-masivas-report/reports.db
#    (con migración automática transparente desde backend/reports.db si procede)
# 3. Entorno local/desarrollo: backend/reports.db
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    legacy_db_file = Path(__file__).resolve().parent / "reports.db"
    prod_var_data = Path("/infocodes/var/data/cso-incident-masivas-report")
    if os.name != "nt" and Path("/infocodes").is_dir():
        try:
            prod_var_data.mkdir(parents=True, exist_ok=True)
            prod_db_file = prod_var_data / "reports.db"
            if legacy_db_file.is_file() and not prod_db_file.exists():
                import shutil
                shutil.copy2(legacy_db_file, prod_db_file)
                print(f"[Database] Migrada base de datos de {legacy_db_file} -> {prod_db_file}")
            db_file = prod_db_file
        except Exception as e:
            print(f"[Database] Aviso: No se pudo usar directorio persistente {prod_var_data}: {e}; usando ruta local.")
            db_file = legacy_db_file
    else:
        db_file = legacy_db_file
    DATABASE_URL = f"sqlite:///{db_file}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(title="Reportes de Incidencias API", version="1.2.0")

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
    expose_headers=["X-Request-ID", "X-Process-Time"],
)


# ============ Fase 2.3: Trazabilidad End-to-End (X-Request-ID) ============
@app.middleware("http")
async def trace_request_middleware(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:10]}"
    request.state.request_id = req_id
    start_ts = time.perf_counter()
    try:
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start_ts) * 1000.0
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Process-Time"] = f"{elapsed_ms:.1f}ms"
        if request.url.path.startswith("/api/"):
            print(f"  [{req_id}] {request.method} {request.url.path} -> {response.status_code} ({elapsed_ms:.1f}ms)")
        return response
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start_ts) * 1000.0
        print(f"  [{req_id}] ERROR {request.method} {request.url.path} ({elapsed_ms:.1f}ms): {exc}")
        raise


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:10]}"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============ Health Probes ============

@app.get("/healthz")
def healthz():
    """Liveness probe: verifica que el servicio está activo y respondiendo."""
    return {
        "status": "ok",
        "service": "cso-incident-reporting-backend",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/readyz")
def readyz(db: Session = Depends(get_db)):
    """Readiness probe: verifica dependencias (base de datos y motor PPTX)."""
    db_ok = True
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    reports_dir = str(get_executive_reports_dir()) if (EXECUTIVE_REPORT_AVAILABLE and get_executive_reports_dir) else None

    return {
        "status": "ready" if db_ok else "degraded",
        "database": "ok" if db_ok else "error",
        "executiveReportEngine": "available" if EXECUTIVE_REPORT_AVAILABLE else "unavailable",
        "executiveReportsDir": reports_dir,
    }

# Single Source of Truth (Fase 1.1): Motor autónomo de informes ejecutivos en report_generator/
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from report_generator import (
        get_executive_reports_dir,
        get_executive_report_path,
        sanitize_incident_ref,
        cleanup_old_executive_reports,
        ExecutiveIncidentData,
        extract_fields_from_jira_description,
        ExecutiveReportBuilder,
        ConfluenceParser,
    )
    EXECUTIVE_REPORT_AVAILABLE = True
except ImportError as e:
    get_executive_reports_dir = None
    cleanup_old_executive_reports = None
    print(f"  Aviso: Módulo de informe ejecutivo no disponible: {e}")
    EXECUTIVE_REPORT_AVAILABLE = False

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
# Se usa append al final del path para evitar suplantar paquetes propios del backend.
if str(RELEASE_DASHBOARD_ROOT / "converters" / "cli") not in sys.path:
    sys.path.append(str(RELEASE_DASHBOARD_ROOT / "converters" / "cli"))
if str(RELEASE_DASHBOARD_ROOT) not in sys.path:
    sys.path.append(str(RELEASE_DASHBOARD_ROOT))

try:
    from upload_csv import run_upload  # noqa: E402
    from generate_postmortem_report import generate_report, generate_all_reports  # noqa: E402
    DASHBOARD_INTEGRATION_AVAILABLE = True
except ImportError:
    run_upload = None
    generate_report = None
    generate_all_reports = None
    DASHBOARD_INTEGRATION_AVAILABLE = False

print(f"  [Integración] Release Dashboard Root: {RELEASE_DASHBOARD_ROOT} (existe: {RELEASE_DASHBOARD_ROOT.exists()})")
print(f"  [Integración] Subida CSV & Postmortems: {'OK' if DASHBOARD_INTEGRATION_AVAILABLE else 'NO DISPONIBLE'}")
print(f"  [Integración] Informes Ejecutivos PPT: {'OK' if EXECUTIVE_REPORT_AVAILABLE else 'NO DISPONIBLE'}")
if EXECUTIVE_REPORT_AVAILABLE and get_executive_reports_dir:
    print(f"  [Almacenamiento] Directorio Informes Ejecutivos PPT: {get_executive_reports_dir()}")

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

# ============ Executive Incident Report (PPTX) — Fase 2.1 Async + Fase 2.3 Trace ============

EXECUTIVE_REPORT_PREFIX = "/api/v1/reports/executive-incident"

# Registro en memoria del estado de generación por incident_ref:
# { incident_ref: {"status": "PROCESSING" | "READY" | "FAILED", "startedAt": float, "requestId": str, "error": str | None} }
_EXECUTIVE_REPORT_JOBS: dict = {}


def _execute_report_generation(incident_ref: str, payload: ExecutiveReportRequestSchema, req_id: str) -> ExecutiveReportResponseSchema:
    """Ejecuta la extracción de Confluence/Jira y la construcción del .pptx (síncrono o en BackgroundTasks)."""
    data_dict = payload.data.model_dump() if payload.data else {}
    if not data_dict.get("incidentRef"):
        data_dict["incidentRef"] = incident_ref
    if payload.title and not data_dict.get("title"):
        data_dict["title"] = payload.title
    if payload.confluenceUrl and not data_dict.get("sourceUrl"):
        data_dict["sourceUrl"] = payload.confluenceUrl

    if payload.model_extra:
        for k, v in payload.model_extra.items():
            if v and k not in data_dict:
                data_dict[k] = v

    raw_content = payload.rawContent or data_dict.get("rawContent") or ""
    confluence_url = payload.confluenceUrl or data_dict.get("sourceUrl") or ""

    if raw_content:
        try:
            parser = ConfluenceParser()
            parsed_data = parser.parse(raw_content, fallback_ref=incident_ref, source_url=confluence_url)
            base_dict = parsed_data.to_dict()
            for k, v in data_dict.items():
                if v and k != "rawContent":
                    base_dict[k] = v
            data_dict = base_dict
        except Exception as pe:
            print(f"  [{req_id}] Aviso al parsear contenido Confluence: {pe}")
    elif confluence_url and not data_dict.get("impactText"):
        try:
            import urllib.request
            req = urllib.request.Request(confluence_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                html_content = resp.read().decode("utf-8", errors="ignore")
                parser = ConfluenceParser()
                parsed_data = parser.parse(html_content, fallback_ref=incident_ref, source_url=confluence_url)
                base_dict = parsed_data.to_dict()
                for k, v in data_dict.items():
                    if v:
                        base_dict[k] = v
                data_dict = base_dict
        except Exception as ce:
            print(f"  [{req_id}] Nota: No se pudo obtener Confluence automáticamente ({ce}). Se usarán datos base.")

    jira_desc = data_dict.get("description") or ""
    if jira_desc and (not data_dict.get("impactText") or not data_dict.get("causeText") or not data_dict.get("solutionText")):
        extracted = extract_fields_from_jira_description(jira_desc)
        for ek, ev in extracted.items():
            if not data_dict.get(ek):
                data_dict[ek] = ev

    target_path = get_executive_report_path(incident_ref)
    incident_data = ExecutiveIncidentData.from_dict(data_dict)
    builder = ExecutiveReportBuilder()
    metadata = builder.generate(incident_data, target_path)

    if cleanup_old_executive_reports:
        try:
            cleaned = cleanup_old_executive_reports(max_age_days=14, keep_min=5)
            if cleaned:
                print(f"  [{req_id}] [Cleanup] Eliminados {len(cleaned)} informes ejecutivos antiguos: {', '.join(cleaned)}")
        except Exception as clean_err:
            print(f"  [{req_id}] [Cleanup] Aviso no bloqueante: {clean_err}")

    _EXECUTIVE_REPORT_JOBS[incident_ref] = {
        "status": "READY",
        "startedAt": time.time(),
        "requestId": req_id,
        "error": None,
        "filename": metadata.filename,
        "sizeBytes": metadata.size_bytes,
    }

    return ExecutiveReportResponseSchema(
        success=True,
        status="READY",
        incidentRef=metadata.incident_ref,
        filename=metadata.filename,
        downloadUrl=f"{EXECUTIVE_REPORT_PREFIX}/{metadata.incident_ref}",
        generatedAt=metadata.generated_at,
        sizeBytes=metadata.size_bytes,
        slideCount=metadata.slide_count,
        cached=False,
        requestId=req_id,
    )


def _background_generate_executive_report(incident_ref: str, payload: ExecutiveReportRequestSchema, req_id: str) -> None:
    """Tarea en segundo plano (Fase 2.1) para evitar bloqueos y errores 504 Gateway Time-out."""
    try:
        _execute_report_generation(incident_ref, payload, req_id)
        print(f"  [{req_id}] [Async PPTX] Generación completada para {incident_ref}")
    except Exception as exc:
        err_msg = f"Error generando informe ejecutivo PowerPoint: {exc}"
        print(f"  [{req_id}] [Async PPTX] ERROR en {incident_ref}: {err_msg}")
        _EXECUTIVE_REPORT_JOBS[incident_ref] = {
            "status": "FAILED",
            "startedAt": time.time(),
            "requestId": req_id,
            "error": err_msg,
        }


@app.post(
    "/api/v1/reports/executive-incident",
    response_model=ExecutiveReportResponseSchema,
    summary="Generar informe ejecutivo PowerPoint (.pptx)",
    description="Genera o recupera el informe ejecutivo en PowerPoint para una incidencia postmortem. Soporta modo asíncrono (asyncMode=true -> 202 Accepted) con BackgroundTasks.",
    tags=["Executive Reports"],
)
@app.post(
    "/api/reports/executive-incident",
    response_model=ExecutiveReportResponseSchema,
    include_in_schema=False,
)
async def generate_executive_report(
    payload: ExecutiveReportRequestSchema,
    background_tasks: BackgroundTasks,
    request: Request,
    async_query: bool = Query(default=False, alias="async"),
):
    """Genera el informe ejecutivo en PowerPoint para una incidencia postmortem."""
    req_id = get_request_id(request)
    if not EXECUTIVE_REPORT_AVAILABLE:
        raise HTTPException(status_code=503, detail=f"Módulo de informe ejecutivo no disponible (Ref: {req_id})")

    incident_ref = sanitize_incident_ref(payload.incidentRef)
    if not incident_ref:
        raise HTTPException(status_code=400, detail=f"Falta el código de incidencia (incidentRef) (Ref: {req_id})")

    force = payload.force
    target_path = get_executive_report_path(incident_ref)

    if target_path.is_file() and not force:
        return ExecutiveReportResponseSchema(
            success=True,
            status="READY",
            incidentRef=incident_ref,
            filename=target_path.name,
            downloadUrl=f"{EXECUTIVE_REPORT_PREFIX}/{incident_ref}",
            sizeBytes=target_path.stat().st_size,
            cached=True,
            requestId=req_id,
        )

    use_async = bool(payload.asyncMode or async_query)
    _EXECUTIVE_REPORT_JOBS[incident_ref] = {
        "status": "PROCESSING",
        "startedAt": time.time(),
        "requestId": req_id,
        "error": None,
    }

    if use_async:
        background_tasks.add_task(_background_generate_executive_report, incident_ref, payload, req_id)
        accepted = ExecutiveReportResponseSchema(
            success=True,
            status="PROCESSING",
            incidentRef=incident_ref,
            filename=target_path.name,
            downloadUrl=f"{EXECUTIVE_REPORT_PREFIX}/{incident_ref}",
            cached=False,
            requestId=req_id,
        )
        return JSONResponse(
            status_code=202,
            content=accepted.model_dump(),
            headers={"X-Request-ID": req_id},
        )

    try:
        return _execute_report_generation(incident_ref, payload, req_id)
    except Exception as e:
        err_msg = f"Error generando informe ejecutivo PowerPoint: {e}"
        _EXECUTIVE_REPORT_JOBS[incident_ref] = {
            "status": "FAILED",
            "startedAt": time.time(),
            "requestId": req_id,
            "error": err_msg,
        }
        print(f"  [{req_id}] {err_msg}")
        raise HTTPException(
            status_code=500,
            detail=f"{err_msg} (Ref: {req_id})"
        )


@app.get(
    "/api/v1/reports/executive-incident/{incident_ref}/status",
    response_model=ExecutiveReportStatusResponseSchema,
    summary="Estado de disponibilidad del informe ejecutivo",
    description="Comprueba el estado del informe ejecutivo .pptx (NOT_FOUND, PROCESSING, READY, FAILED).",
    tags=["Executive Reports"],
)
@app.get(
    "/api/reports/executive-incident/{incident_ref}/status",
    response_model=ExecutiveReportStatusResponseSchema,
    include_in_schema=False,
)
def get_executive_report_status(incident_ref: str, request: Request):
    """Comprueba si el informe ejecutivo para una incidencia está en curso, fallido o listo en disco."""
    req_id = get_request_id(request)
    if not EXECUTIVE_REPORT_AVAILABLE:
        raise HTTPException(status_code=503, detail=f"Módulo de informe ejecutivo no disponible (Ref: {req_id})")

    clean_ref = sanitize_incident_ref(incident_ref)
    job = _EXECUTIVE_REPORT_JOBS.get(clean_ref)
    if job:
        job_status = job.get("status")
        job_age = time.time() - float(job.get("startedAt", 0))
        if job_status == "PROCESSING" and job_age < 120:
            return ExecutiveReportStatusResponseSchema(
                exists=False,
                status="PROCESSING",
                incidentRef=clean_ref,
                requestId=job.get("requestId") or req_id,
            )
        if job_status == "FAILED" and job_age < 300:
            return ExecutiveReportStatusResponseSchema(
                exists=False,
                status="FAILED",
                incidentRef=clean_ref,
                error=job.get("error") or "Error al generar la presentación PowerPoint",
                requestId=job.get("requestId") or req_id,
            )

    report_path = get_executive_report_path(clean_ref)
    if report_path.is_file():
        return ExecutiveReportStatusResponseSchema(
            exists=True,
            status="READY",
            incidentRef=clean_ref,
            filename=report_path.name,
            downloadUrl=f"{EXECUTIVE_REPORT_PREFIX}/{clean_ref}",
            sizeBytes=report_path.stat().st_size,
            requestId=req_id,
        )
    return ExecutiveReportStatusResponseSchema(
        exists=False,
        status="NOT_FOUND",
        incidentRef=clean_ref,
        requestId=req_id,
    )

@app.get(
    "/api/v1/reports/executive-incident/{incident_ref}",
    summary="Descarga del informe ejecutivo PowerPoint (.pptx)",
    description="Devuelve el archivo binario PowerPoint generado (.pptx) para una incidencia.",
    tags=["Executive Reports"],
)
@app.get(
    "/api/reports/executive-incident/{incident_ref}",
    include_in_schema=False,
)
def download_executive_report(incident_ref: str):
    """Descarga el informe ejecutivo PowerPoint."""
    if not EXECUTIVE_REPORT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Módulo de informe ejecutivo no disponible")

    clean_ref = sanitize_incident_ref(incident_ref)
    report_path = get_executive_report_path(clean_ref)
    if not report_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"No existe informe generado para la incidencia {clean_ref}. Debe solicitarlo primero."
        )

    content = report_path.read_bytes()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={
            "Content-Disposition": f'attachment; filename="{report_path.name}"',
            "Content-Length": str(len(content)),
            "Access-Control-Allow-Origin": "*",
        },
    )

@app.post("/api/v1/reports/executive-incident/cleanup")
@app.post("/api/reports/executive-incident/cleanup")
def cleanup_executive_reports(max_age_days: int = Query(14, ge=1), keep_min: int = Query(5, ge=0)):
    """Limpia informes ejecutivos PowerPoint antiguos de disco conservando los más recientes."""
    if not EXECUTIVE_REPORT_AVAILABLE or not cleanup_old_executive_reports:
        raise HTTPException(status_code=503, detail="Módulo de informe ejecutivo no disponible")

    try:
        cleaned = cleanup_old_executive_reports(max_age_days=max_age_days, keep_min=keep_min)
        return {
            "success": True,
            "deletedCount": len(cleaned),
            "deletedFiles": cleaned,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error durante la limpieza: {e}")

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
    backend_dir = str(Path(__file__).resolve().parent)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=reload_env,
        reload_dirs=[backend_dir] if reload_env else None,
    )

