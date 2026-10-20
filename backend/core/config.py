import os
from pathlib import Path
from typing import List


def find_release_dashboard_root() -> Path:
    """Localiza la raíz del proyecto hermano release-dashboard-application."""
    # 1. Variable de entorno explícita (si apunta a la raíz del proyecto y existe 'current', priorizar 'current')
    env_root = os.environ.get("RELEASE_DASHBOARD_ROOT")
    if env_root:
        p = Path(env_root).resolve()
        if (p / "current").is_dir():
            return p / "current"
        if p.exists():
            return p

    # 2. Ruta estándar de producción en el VPS (prioriza release activa 'current')
    prod_current = Path("/infocodes/project/release-dashboard-application/current")
    if prod_current.exists():
        return prod_current
    prod_standard = Path("/infocodes/project/release-dashboard-application")
    if prod_standard.exists():
        return prod_standard

    # 3. Búsqueda dinámica ascendente (soporta releases/<timestamp>/backend)
    curr = Path(__file__).resolve().parent.parent
    for _ in range(6):
        candidate = curr / "release-dashboard-application"
        if candidate.is_dir():
            if (candidate / "current").is_dir():
                return candidate / "current"
            return candidate
        if curr.parent == curr:
            break
        curr = curr.parent

    # 4. Fallback por defecto relativo
    default_rel = Path(__file__).resolve().parent.parent.parent / "release-dashboard-application"
    if (default_rel / "current").is_dir():
        return default_rel / "current"
    return default_rel


def resolve_database_url() -> str:
    """
    Prioridad de resolución de la base de datos:
    1. Variable de entorno DATABASE_URL (si viene explícita)
    2. En producción Linux con /infocodes:
       /infocodes/var/data/cso-incident-masivas-report/reports.db
       (con migración automática transparente desde backend/reports.db si procede)
    3. Entorno local/desarrollo: backend/reports.db
    """
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        return env_url

    backend_dir = Path(__file__).resolve().parent.parent
    legacy_db_file = backend_dir / "reports.db"
    prod_var_data = Path("/infocodes/var/data/cso-incident-masivas-report")

    if os.name != "nt" and Path("/infocodes").is_dir():
        try:
            prod_var_data.mkdir(parents=True, exist_ok=True)
            prod_db_file = prod_var_data / "reports.db"
            if legacy_db_file.is_file() and not prod_db_file.exists():
                import shutil
                shutil.copy2(legacy_db_file, prod_db_file)
                print(f"[Database] Migrada base de datos de {legacy_db_file} -> {prod_db_file}")
            db_file = prod_db_file
        except Exception as e:
            print(f"[Database] Aviso: No se pudo usar directorio persistente {prod_var_data}: {e}; usando ruta local.")
            db_file = legacy_db_file
    else:
        db_file = legacy_db_file

    return f"sqlite:///{db_file}"


class Settings:
    PROJECT_NAME: str = "Reportes de Incidencias API"
    VERSION: str = "2.1.0"

    # Servidor
    PORT: int = int(os.environ.get("BACKEND_PORT", os.environ.get("PORT", 8000)))
    RELOAD: bool = os.environ.get("RELOAD", "true").lower() in ("true", "1", "yes")

    # Rutas base
    BACKEND_DIR: Path = Path(__file__).resolve().parent.parent
    ROOT_DIR: Path = BACKEND_DIR.parent
    SCRIPTS_DIR: Path = ROOT_DIR / "scripts"

    # Base de datos
    DATABASE_URL: str = resolve_database_url()

    # CORS
    _cors_env: str = os.environ.get("CORS_ORIGINS", "")
    ALLOWED_ORIGINS: List[str] = [
        o.strip() for o in _cors_env.split(",") if o.strip()
    ] or [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://10.132.68.85:8081",
        "http://infocodes.si.orange.es:8081",
    ]

    # Integración con Release Dashboard
    RELEASE_DASHBOARD_ROOT: Path = find_release_dashboard_root()
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10 MB límite


settings = Settings()

