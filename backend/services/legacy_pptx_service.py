import sys
from pathlib import Path
from core.config import settings

# Asegurar que el directorio de scripts esté en sys.path para cargar export_legacy_pptx
if str(settings.SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(settings.SCRIPTS_DIR))

try:
    from export_legacy_pptx import generate_legacy_pptx_bytes
    LEGACY_PPTX_AVAILABLE = True
    print(f"[PPTX Legacy] Módulo export_legacy_pptx cargado correctamente desde {settings.SCRIPTS_DIR}")
except Exception as e:
    generate_legacy_pptx_bytes = None
    LEGACY_PPTX_AVAILABLE = False
    print(f"[PPTX Legacy] Aviso: No se pudo cargar módulo export_legacy_pptx ({e})")


class LegacyPptxService:
    @staticmethod
    def is_available() -> bool:
        return LEGACY_PPTX_AVAILABLE

    @staticmethod
    def generate_pptx_bytes(report_dict: dict) -> bytes:
        if not LEGACY_PPTX_AVAILABLE or generate_legacy_pptx_bytes is None:
            raise RuntimeError("Módulo de exportación PPTX legacy no disponible en el servidor")
        return generate_legacy_pptx_bytes(report_dict)

    @staticmethod
    def get_filename(report_data: dict) -> str:
        meta = report_data.get("meta") if isinstance(report_data.get("meta"), dict) else {}
        year = report_data.get("year") or meta.get("year", 2026)
        week_val = report_data.get("week") if report_data.get("week") is not None else meta.get("week", "")
        week_str = f"W{str(week_val).zfill(2)}" if week_val != "" else ""
        return f"{year}{week_str}_ReporteIncidencias_Legacy.pptx"

