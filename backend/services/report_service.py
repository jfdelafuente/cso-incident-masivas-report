from datetime import datetime
from typing import List, Optional
from sqlalchemy import desc
from sqlalchemy.orm import Session
from fastapi import HTTPException

from models import Report
from schemas import ReportCreate, ReportUpdate


def build_report_id(year: int, week: int) -> str:
    """Genera la clave primaria estándar del reporte (YYYY-Www)."""
    return f"{year}-W{str(week).zfill(2)}"


class ReportService:
    @staticmethod
    def create_report(report_in: ReportCreate, db: Session) -> dict:
        """Crea un nuevo reporte semanal para un año y semana dados."""
        report_id = build_report_id(report_in.year, report_in.week)

        existing = db.query(Report).filter(Report.id == report_id).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Report for {report_id} already exists")

        db_report = Report(
            id=report_id,
            year=report_in.year,
            week=report_in.week,
            range=report_in.range,
            dept=report_in.dept,
            incidents=[inc.model_dump() for inc in report_in.incidents],
            status=report_in.status,
            created_by=report_in.created_by,
            notes=report_in.notes,
        )
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
        return db_report.to_dict()

    @staticmethod
    def list_reports(db: Session) -> List[dict]:
        """Lista todos los reportes ordenados por año y semana descendente."""
        reports = db.query(Report).order_by(desc(Report.year), desc(Report.week)).all()
        return [r.to_dict() for r in reports]

    @staticmethod
    def get_report(report_id: str, db: Session) -> dict:
        """Obtiene el detalle completo de un reporte por su ID."""
        report = db.query(Report).filter(Report.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        return report.to_dict()

    @staticmethod
    def update_report(report_id: str, update_in: ReportUpdate, db: Session) -> dict:
        """Actualiza los campos de un reporte existente."""
        report = db.query(Report).filter(Report.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        if update_in.range is not None:
            report.range = update_in.range
        if update_in.dept is not None:
            report.dept = update_in.dept
        if update_in.incidents is not None:
            report.incidents = [inc.model_dump() for inc in update_in.incidents]
        if update_in.status is not None:
            report.status = update_in.status
        if update_in.notes is not None:
            report.notes = update_in.notes

        report.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(report)
        return report.to_dict()

    @staticmethod
    def delete_report(report_id: str, db: Session) -> dict:
        """Elimina un reporte de la base de datos."""
        report = db.query(Report).filter(Report.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")

        db.delete(report)
        db.commit()
        return {"message": f"Report {report_id} deleted successfully"}

    @staticmethod
    def duplicate_report(report_id: str, new_week: int, db: Session) -> dict:
        """Duplica un reporte existente a una nueva semana."""
        source_report = db.query(Report).filter(Report.id == report_id).first()
        if not source_report:
            raise HTTPException(status_code=404, detail="Source report not found")

        new_report_id = build_report_id(source_report.year, new_week)
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

