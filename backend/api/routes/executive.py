import time
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from core.middleware import get_request_id
from schemas import (
    ExecutiveReportRequestSchema,
    ExecutiveReportResponseSchema,
    ExecutiveReportStatusResponseSchema,
)
from services.executive_service import ExecutiveReportService, EXECUTIVE_REPORT_PREFIX

router = APIRouter(tags=["Executive Reports"])


@router.post(
    "/api/v1/reports/executive-incident",
    response_model=ExecutiveReportResponseSchema,
    summary="Generar informe ejecutivo PowerPoint (.pptx)",
    description="Genera o recupera el informe ejecutivo en PowerPoint para una incidencia postmortem. Soporta modo asíncrono (asyncMode=true -> 202 Accepted) con BackgroundTasks.",
)
@router.post(
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
    if not ExecutiveReportService.is_available():
        raise HTTPException(status_code=503, detail=f"Módulo de informe ejecutivo no disponible (Ref: {req_id})")

    incident_ref = ExecutiveReportService.sanitize_ref(payload.incidentRef)
    if not incident_ref:
        raise HTTPException(status_code=400, detail=f"Falta el código de incidencia (incidentRef) (Ref: {req_id})")

    target_path = ExecutiveReportService.get_file_path(incident_ref)
    if target_path and target_path.is_file() and not payload.force:
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
    ExecutiveReportService.set_job(incident_ref, {
        "status": "PROCESSING",
        "startedAt": time.time(),
        "requestId": req_id,
        "error": None,
    })

    filename = target_path.name if target_path else f"Informe_Ejecutivo_{incident_ref}.pptx"

    if use_async:
        background_tasks.add_task(
            ExecutiveReportService.background_generate, incident_ref, payload, req_id
        )
        accepted = ExecutiveReportResponseSchema(
            success=True,
            status="PROCESSING",
            incidentRef=incident_ref,
            filename=filename,
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
        return ExecutiveReportService.execute_generation(incident_ref, payload, req_id)
    except Exception as e:
        err_msg = f"Error generando informe ejecutivo PowerPoint: {e}"
        ExecutiveReportService.set_job(incident_ref, {
            "status": "FAILED",
            "startedAt": time.time(),
            "requestId": req_id,
            "error": err_msg,
        })
        print(f"  [{req_id}] {err_msg}")
        raise HTTPException(status_code=500, detail=f"{err_msg} (Ref: {req_id})")


@router.get(
    "/api/v1/reports/executive-incident/{incident_ref}/status",
    response_model=ExecutiveReportStatusResponseSchema,
    summary="Estado de disponibilidad del informe ejecutivo",
    description="Comprueba el estado del informe ejecutivo .pptx (NOT_FOUND, PROCESSING, READY, FAILED).",
)
@router.get(
    "/api/reports/executive-incident/{incident_ref}/status",
    response_model=ExecutiveReportStatusResponseSchema,
    include_in_schema=False,
)
def get_executive_report_status(incident_ref: str, request: Request):
    """Comprueba si el informe ejecutivo para una incidencia está en curso, fallido o listo en disco."""
    req_id = get_request_id(request)
    if not ExecutiveReportService.is_available():
        raise HTTPException(status_code=503, detail=f"Módulo de informe ejecutivo no disponible (Ref: {req_id})")

    clean_ref = ExecutiveReportService.sanitize_ref(incident_ref)
    job = ExecutiveReportService.get_job(clean_ref)
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

    report_path = ExecutiveReportService.get_file_path(clean_ref)
    if report_path and report_path.is_file():
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


@router.get(
    "/api/v1/reports/executive-incident/{incident_ref}",
    summary="Descarga del informe ejecutivo PowerPoint (.pptx)",
    description="Devuelve el archivo binario PowerPoint generado (.pptx) para una incidencia.",
)
@router.get(
    "/api/reports/executive-incident/{incident_ref}",
    include_in_schema=False,
)
def download_executive_report(incident_ref: str):
    """Descarga el informe ejecutivo PowerPoint."""
    if not ExecutiveReportService.is_available():
        raise HTTPException(status_code=503, detail="Módulo de informe ejecutivo no disponible")

    clean_ref = ExecutiveReportService.sanitize_ref(incident_ref)
    report_path = ExecutiveReportService.get_file_path(clean_ref)
    if not report_path or not report_path.is_file():
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


@router.post("/api/v1/reports/executive-incident/cleanup")
@router.post("/api/reports/executive-incident/cleanup", include_in_schema=False)
def cleanup_executive_reports(max_age_days: int = Query(14, ge=1), keep_min: int = Query(5, ge=0)):
    """Limpia informes ejecutivos PowerPoint antiguos de disco conservando los más recientes."""
    if not ExecutiveReportService.is_available():
        raise HTTPException(status_code=503, detail="Módulo de informe ejecutivo no disponible")

    try:
        cleaned = ExecutiveReportService.cleanup(max_age_days=max_age_days, keep_min=keep_min)
        return {
            "success": True,
            "deletedCount": len(cleaned),
            "deletedFiles": cleaned,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error durante la limpieza: {e}")

