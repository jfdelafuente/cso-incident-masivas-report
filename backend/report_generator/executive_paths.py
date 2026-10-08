"""
Gestión de rutas y archivos para el informe ejecutivo de incidencias postmortem.
Feature 010: 010-incident-executive-report
"""

import os
import time
from pathlib import Path
from typing import List, Optional

try:
    from .executive_models import sanitize_incident_ref
except (ImportError, ValueError):
    from executive_models import sanitize_incident_ref

# Directorio base del repositorio cso-incident-masivas-report
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def get_executive_template_path() -> Path:
    """
    Retorna la ruta absoluta a la plantilla de referencia PowerPoint.
    Busca primero en assets del generador y como respaldo en la raíz del proyecto.
    """
    assets_path = Path(__file__).resolve().parent / "assets" / "executive_template.pptx"
    if assets_path.is_file():
        return assets_path

    backups = [
        PROJECT_ROOT / "20260609 Incidencia IVR ExMM.pptx",
        PROJECT_ROOT.parent / "release-dashboard-application" / "converters" / "src" / "report_generator" / "assets" / "executive_template.pptx",
    ]
    for b in backups:
        if b.is_file():
            return b

    raise FileNotFoundError(f"Plantilla PowerPoint no encontrada en {assets_path}")


def get_executive_reports_dir() -> Path:
    """
    Retorna la ruta al directorio de persistencia de informes ejecutivos, creándolo si no existe.
    Permite configurar mediante EXECUTIVE_REPORTS_DIR.
    """
    env_dir = os.environ.get("EXECUTIVE_REPORTS_DIR")
    if env_dir:
        reports_dir = Path(env_dir)
    else:
        reports_dir = Path(__file__).resolve().parent.parent / "data" / "reports" / "executive"
    reports_dir.mkdir(parents=True, exist_ok=True)
    return reports_dir


def get_executive_report_filename(incident_ref: str) -> str:
    """
    Retorna el nombre del archivo de informe generado: RESUMEN_EJECUTIVO_{incidentRef}.pptx
    """
    clean_ref = sanitize_incident_ref(incident_ref)
    return f"RESUMEN_EJECUTIVO_{clean_ref}.pptx"


def get_executive_report_path(incident_ref: str) -> Path:
    """
    Retorna la ruta completa al archivo de informe para una incidencia dada.
    """
    return get_executive_reports_dir() / get_executive_report_filename(incident_ref)


def cleanup_old_executive_reports(max_age_days: int = 14, keep_min: int = 5) -> List[str]:
    """
    Elimina archivos de informe ejecutivo generados con antigüedad superior a max_age_days,
    asegurando conservar al menos keep_min archivos más recientes.
    Ignora archivos especiales como .gitkeep y directorios.
    Retorna la lista de nombres de archivos eliminados.
    """
    reports_dir = get_executive_reports_dir()
    if not reports_dir.is_dir():
        return []

    pptx_files = [
        f for f in reports_dir.iterdir()
        if f.is_file() and f.suffix.lower() == ".pptx" and not f.name.startswith(".")
    ]
    # Ordenar por fecha de modificación descendente (más nuevos primero)
    pptx_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    removed: List[str] = []
    now = time.time()
    cutoff_time = now - (max_age_days * 86400)

    # Conservar al menos keep_min archivos más nuevos
    candidates_to_clean = pptx_files[keep_min:]
    for file_path in candidates_to_clean:
        try:
            if file_path.stat().st_mtime < cutoff_time:
                file_path.unlink()
                removed.append(file_path.name)
        except Exception as e:
            print(f"[Cleanup] No se pudo eliminar informe antiguo {file_path.name}: {e}")

    return removed


