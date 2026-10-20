import sys
from pathlib import Path
from typing import Dict, Any, Optional
from core.config import settings

# Enlace dinámico con release-dashboard-application
root = settings.RELEASE_DASHBOARD_ROOT

if str(root / "converters" / "cli") not in sys.path:
    sys.path.append(str(root / "converters" / "cli"))
if str(root / "converters" / "src") not in sys.path:
    sys.path.append(str(root / "converters" / "src"))
if str(root) not in sys.path:
    sys.path.append(str(root))

rd_rg_dir = root / "converters" / "src" / "report_generator"
if rd_rg_dir.is_dir():
    try:
        import report_generator
        if str(rd_rg_dir) not in report_generator.__path__:
            report_generator.__path__.append(str(rd_rg_dir))
    except Exception as e:
        print(f"  [Integración] Aviso: No se pudo enlazar report_generator.__path__: {e}")

try:
    from upload_csv import run_upload
    from generate_postmortem_report import generate_report, generate_all_reports
    DASHBOARD_INTEGRATION_AVAILABLE = True
except Exception as e:
    run_upload = None
    generate_report = None
    generate_all_reports = None
    DASHBOARD_INTEGRATION_AVAILABLE = False
    print(f"  [Integración] Aviso: Módulos de Release Dashboard no disponibles ({e})")


class DashboardService:
    @staticmethod
    def is_available() -> bool:
        return DASHBOARD_INTEGRATION_AVAILABLE

    @staticmethod
    def get_root() -> Path:
        return settings.RELEASE_DASHBOARD_ROOT

    @classmethod
    def process_csv_upload(
        cls, filename: str, content: bytes, upload_type: str, release_name: Optional[str]
    ) -> Dict[str, Any]:
        if not DASHBOARD_INTEGRATION_AVAILABLE or run_upload is None:
            raise RuntimeError("Módulo de integración con Release Dashboard no disponible")

        input_dir = settings.RELEASE_DASHBOARD_ROOT / "data" / "input"
        input_dir.mkdir(parents=True, exist_ok=True)
        csv_path = input_dir / filename
        csv_path.write_bytes(content)

        return run_upload(csv_path, upload_type, settings.RELEASE_DASHBOARD_ROOT, release_name)

    @classmethod
    def generate_postmortem(cls, release_name: str) -> Dict[str, Any]:
        if not DASHBOARD_INTEGRATION_AVAILABLE or generate_report is None:
            raise RuntimeError("Módulo de generación de informes postmortem no disponible")
        return generate_report(release_name, project_root=settings.RELEASE_DASHBOARD_ROOT)

    @classmethod
    def generate_all_postmortems(cls) -> Dict[str, Any]:
        if not DASHBOARD_INTEGRATION_AVAILABLE or generate_all_reports is None:
            raise RuntimeError("Módulo de generación de informes postmortem no disponible")
        return generate_all_reports(project_root=settings.RELEASE_DASHBOARD_ROOT)

