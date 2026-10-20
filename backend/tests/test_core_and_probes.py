import unittest
from core.config import settings
from core.database import check_db_ready
from core.middleware import get_request_id
from services.legacy_pptx_service import LegacyPptxService
from services.executive_service import ExecutiveReportService


class DummyState:
    request_id = None


class DummyRequest:
    def __init__(self, headers=None, state=None):
        self.headers = headers or {}
        self.state = state or DummyState()


class TestCoreAndProbes(unittest.TestCase):
    def test_settings_loaded(self):
        self.assertEqual(settings.PROJECT_NAME, "Reportes de Incidencias API")
        self.assertTrue(settings.DATABASE_URL.startswith("sqlite:///"))
        self.assertGreater(len(settings.ALLOWED_ORIGINS), 0)

    def test_database_ready(self):
        # La BD SQLite por defecto debe responder OK
        self.assertTrue(check_db_ready())

    def test_request_id_extraction(self):
        # Con cabecera existente
        req = DummyRequest(headers={"X-Request-ID": "test-req-123"})
        self.assertEqual(get_request_id(req), "test-req-123")

        # Sin cabecera -> genera uno nuevo con prefijo req-
        req2 = DummyRequest()
        generated_id = get_request_id(req2)
        self.assertTrue(generated_id.startswith("req-"))

    def test_legacy_pptx_filename(self):
        fn = LegacyPptxService.get_filename({"year": 2026, "week": 42})
        self.assertEqual(fn, "2026W42_ReporteIncidencias_Legacy.pptx")

        fn2 = LegacyPptxService.get_filename({"meta": {"year": 2026, "week": 3}})
        self.assertEqual(fn2, "2026W03_ReporteIncidencias_Legacy.pptx")

    def test_executive_service_helpers(self):
        clean_ref = ExecutiveReportService.sanitize_ref(" INC00123 / TEST ")
        self.assertNotIn(" ", clean_ref)

        ExecutiveReportService.set_job("INC001", {"status": "READY", "requestId": "req-1"})
        job = ExecutiveReportService.get_job("INC001")
        self.assertIsNotNone(job)
        self.assertEqual(job["status"], "READY")


if __name__ == "__main__":
    unittest.main()

