from pathlib import Path
from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import JSONResponse

from core.config import settings
from services.dashboard_service import DashboardService

router = APIRouter(tags=["Release Dashboard Integration"])


@router.post("/api/upload")
async def upload_dashboard_csv(
    file: UploadFile = File(...),
    type: str = Form("massive"),
    release_name: str = Form(None),
):
    """Guarda un CSV de Release Dashboard en data/input y lo convierte a JSON."""
    if not DashboardService.is_available():
        return JSONResponse(
            status_code=503,
            content={"success": False, "error": "Módulo de integración con Release Dashboard no disponible"}
        )

    filename = Path(file.filename).name
    if not filename.lower().endswith(".csv"):
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "El archivo debe tener extensión .csv"}
        )

    if type == "postmortem" and not release_name:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Falta el nombre de la release (release_name)"}
        )

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        max_mb = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
        return JSONResponse(
            status_code=413,
            content={"success": False, "error": f"El archivo supera el tamaño máximo permitido ({max_mb}MB)"}
        )

    try:
        result = DashboardService.process_csv_upload(filename, content, type, release_name)
        status_code = 200 if result.get("success") else 500
        return JSONResponse(status_code=status_code, content=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@router.get("/api/reports/postmortem/{release_name}")
def download_postmortem_report(release_name: str):
    """Genera (o regenera) el informe .pptx de una release y lo devuelve como descarga."""
    if not DashboardService.is_available():
        raise HTTPException(status_code=503, detail="Módulo de generación de informes postmortem no disponible")

    try:
        result = DashboardService.generate_postmortem(release_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo generar el informe: {e}")

    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Error desconocido"))

    pptx_path = Path(result["path"])
    return Response(
        content=pptx_path.read_bytes(),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{pptx_path.name}"'},
    )


@router.post("/api/reports/postmortem/batch")
def generate_postmortem_reports_batch():
    """Genera el informe de todas las releases con datos de postmortem disponibles."""
    if not DashboardService.is_available():
        raise HTTPException(status_code=503, detail="Módulo de generación de informes postmortem no disponible")
    return DashboardService.generate_all_postmortems()

