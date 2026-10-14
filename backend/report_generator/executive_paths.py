"""
Gestión de rutas y archivos para el informe ejecutivo de incidencias postmortem.
Feature 010: 010-incident-executive-report
"""

import os
import shutil
import time
from pathlib import Path
from typing import List, Optional

try:
    from .executive_models import sanitize_incident_ref
except (ImportError, ValueError):
    from executive_models import sanitize_incident_ref

# Directorio base del repositorio cso-incident-masivas-report
PROJECT_ROOT = Path(__file__).resolve().parents[2]
LEGACY_REPORTS_DIR = Path(__file__).resolve().parent.parent / "data" / "reports" / "executive"
DEFAULT_PROD_REPORTS_DIR = Path("/infocodes/var/storage/executive_pptx")

_migration_checked = False


def get_executive_template_path() -> Path:
    """
    Retorna la ruta absoluta a la plantilla de referencia PowerPoint.
    Busca primero en assets del generador y como respaldo en la raíz del proyecto.
    """
    assets_path = Path(__file__).resolve().parent / "assets" / "executive_template.pptx"
    if assets_path.is_file():
        return assets_path

    backup_root_template = PROJECT_ROOT / "20260609 Incidencia IVR ExMM.pptx"
    if backup_root_template.is_file():
        return backup_root_template

    raise FileNotFoundError(f"Plantilla PowerPoint no encontrada en {assets_path}")


def _migrate_legacy_reports_if_needed(target_dir: Path) -> None:
    """
    Migra de forma transparente y sin pérdida de datos los archivos .pptx existentes
    desde el directorio legado dentro del repositorio (backend/data/reports/executive/)
    hacia el nuevo directorio externo (ej. /infocodes/var/storage/executive_pptx/).
    """
    global _migration_checked
    if _migration_checked:
        return
    _migration_checked = True

    try:
        if target_dir.resolve() == LEGACY_REPORTS_DIR.resolve():
            return
        if not LEGACY_REPORTS_DIR.is_dir():
            return
        target_dir.mkdir(parents=True, exist_ok=True)
        for item in LEGACY_REPORTS_DIR.iterdir():
            if item.is_file() and item.suffix.lower() == ".pptx" and not item.name.startswith("."):
                dest = target_dir / item.name
                if not dest.exists():
                    shutil.copy2(item, dest)
                    print(f"[Storage] Migrado informe ejecutivo legado {item.name} -> {dest}")
    except Exception as e:
        print(f"[Storage] Aviso: No se pudo completar la migración de informes legados: {e}")


def get_executive_reports_dir() -> Path:
    """
    Retorna la ruta al directorio de persistencia de informes ejecutivos, creándolo si no existe.
    Orden de prioridad (Fase 1.2):
    1. Variable de entorno EXECUTIVE_REPORTS_OUTPUT_DIR o EXECUTIVE_REPORTS_DIR
    2. /infocodes/var/storage/executive_pptx (si existe /infocodes en Linux)
    3. <repo>/backend/data/reports/executive (entorno de desarrollo local)
    """
    env_dir = (
        os.environ.get("EXECUTIVE_REPORTS_OUTPUT_DIR", "").strip()
        or os.environ.get("EXECUTIVE_REPORTS_DIR", "").strip()
    )
    if env_dir:
        reports_dir = Path(env_dir).resolve()
    elif os.name != "nt" and Path("/infocodes").is_dir():
        reports_dir = DEFAULT_PROD_REPORTS_DIR
    else:
        reports_dir = LEGACY_REPORTS_DIR

    reports_dir.mkdir(parents=True, exist_ok=True)
    _migrate_legacy_reports_if_needed(reports_dir)
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


