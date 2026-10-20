from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from schemas import ReportCreate, ReportUpdate, ReportResponse
from services.report_service import ReportService

router = APIRouter(prefix="/api/reports", tags=["Weekly Reports"])


@router.post("", response_model=ReportResponse)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    """Crea un nuevo reporte semanal o importa un reporte JSON existente."""
    return ReportService.create_report(report, db)


@router.get("", response_model=list)
def list_reports(db: Session = Depends(get_db)):
    """Lista todos los reportes ordenados por año y semana en orden descendente."""
    return ReportService.list_reports(db)


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(report_id: str, db: Session = Depends(get_db)):
    """Obtiene el detalle completo de un reporte por su ID (formato YYYY-WXX)."""
    return ReportService.get_report(report_id, db)


@router.put("/{report_id}", response_model=ReportResponse)
def update_report(report_id: str, update: ReportUpdate, db: Session = Depends(get_db)):
    """Actualiza incidencias, notas, estado, departamento o rango de un reporte."""
    return ReportService.update_report(report_id, update, db)


@router.delete("/{report_id}")
def delete_report(report_id: str, db: Session = Depends(get_db)):
    """Elimina un reporte de la base de datos."""
    return ReportService.delete_report(report_id, db)


@router.post("/{report_id}/duplicate", response_model=ReportResponse)
def duplicate_report(report_id: str, new_week: int = Query(...), db: Session = Depends(get_db)):
    """Duplica un reporte existente asignándolo a una nueva semana."""
    return ReportService.duplicate_report(report_id, new_week, db)


@router.get("/{report_id}/export")
def export_report(report_id: str, db: Session = Depends(get_db)):
    """Exporta el informe íntegro en formato JSON."""
    return ReportService.get_report(report_id, db)

