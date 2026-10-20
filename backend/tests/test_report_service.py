import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from models import Base
from schemas import ReportCreate, ReportUpdate, IncidentBase
from services.report_service import ReportService, build_report_id


class TestReportService(unittest.TestCase):
    def setUp(self):
        # Base de datos SQLite en memoria aislada para cada test
        self.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.SessionLocal()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    def test_build_report_id(self):
        self.assertEqual(build_report_id(2026, 42), "2026-W42")
        self.assertEqual(build_report_id(2026, 5), "2026-W05")

    def test_create_and_get_report(self):
        payload = ReportCreate(
            year=2026,
            week=42,
            range="12/10 - 18/10",
            dept="Operaciones",
            incidents=[
                IncidentBase(
                    title="Caída de nodo FTTH",
                    severity="CRITICA",
                    category="Pérdida de servicio FTTH",
                    group="RED",
                )
            ],
            status="draft",
            notes="Informe inicial",
        )
        created = ReportService.create_report(payload, self.db)
        self.assertEqual(created["id"], "2026-W42")
        self.assertEqual(created["year"], 2026)
        self.assertEqual(created["week"], 42)
        self.assertEqual(len(created["incidents"]), 1)
        self.assertEqual(created["incidents"][0]["title"], "Caída de nodo FTTH")

        # Recuperar
        retrieved = ReportService.get_report("2026-W42", self.db)
        self.assertEqual(retrieved["id"], "2026-W42")
        self.assertEqual(retrieved["notes"], "Informe inicial")

    def test_create_duplicate_raises_409(self):
        payload = ReportCreate(
            year=2026,
            week=42,
            range="12/10 - 18/10",
            dept="Operaciones",
        )
        ReportService.create_report(payload, self.db)

        with self.assertRaises(HTTPException) as ctx:
            ReportService.create_report(payload, self.db)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_update_report(self):
        payload = ReportCreate(year=2026, week=42, range="12/10 - 18/10", dept="Operaciones")
        ReportService.create_report(payload, self.db)

        update_payload = ReportUpdate(status="published", notes="Aprobado por dirección")
        updated = ReportService.update_report("2026-W42", update_payload, self.db)
        self.assertEqual(updated["status"], "published")
        self.assertEqual(updated["notes"], "Aprobado por dirección")

    def test_duplicate_report_to_new_week(self):
        payload = ReportCreate(year=2026, week=42, range="12/10 - 18/10", dept="Operaciones")
        ReportService.create_report(payload, self.db)

        duplicated = ReportService.duplicate_report("2026-W42", 43, self.db)
        self.assertEqual(duplicated["id"], "2026-W43")
        self.assertEqual(duplicated["week"], 43)
        self.assertEqual(duplicated["status"], "draft")

    def test_delete_report(self):
        payload = ReportCreate(year=2026, week=42, range="12/10 - 18/10", dept="Operaciones")
        ReportService.create_report(payload, self.db)

        del_resp = ReportService.delete_report("2026-W42", self.db)
        self.assertIn("deleted successfully", del_resp["message"])

        with self.assertRaises(HTTPException) as ctx:
            ReportService.get_report("2026-W42", self.db)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()

