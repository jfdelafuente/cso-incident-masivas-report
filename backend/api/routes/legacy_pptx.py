from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from core.database import get_db
from models import Report
from services.legacy_pptx_service import LegacyPptxService

router = APIRouter(tags=["Legacy PowerPoint Export"])


@router.get("/api/reports/{report_id}/legacy-pptx")
@router.get("/api/reports/{report_id}/export/legacy-pptx", include_in_schema=False)
def download_legacy_pptx(report_id: str, db: Session = Depends(get_db)):
    """Exporta el reporte en formato PPTX aplicando la plantilla corporativa oficial."""
    if not LegacyPptxService.is_available():
        raise HTTPException(status_code=503, detail="Módulo de exportación PPTX legacy no disponible en el servidor")

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report_dict = report.to_dict()
    try:
        content = LegacyPptxService.generate_pptx_bytes(report_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PowerPoint legacy: {e}")

    filename = LegacyPptxService.get_filename(report_dict)

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/reports/export/legacy-pptx")
def export_custom_legacy_pptx(report_data: dict):
    """Genera una presentación PPTX corporativa a partir de un JSON arbitrario."""
    if not LegacyPptxService.is_available():
        raise HTTPException(status_code=503, detail="Módulo de exportación PPTX legacy no disponible en el servidor")

    try:
        content = LegacyPptxService.generate_pptx_bytes(report_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PowerPoint legacy: {e}")

    filename = LegacyPptxService.get_filename(report_data)

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

