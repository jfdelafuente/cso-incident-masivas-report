import time
import threading
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import BackgroundTasks, HTTPException

from schemas import (
    ExecutiveReportRequestSchema,
    ExecutiveReportResponseSchema,
    ExecutiveReportStatusResponseSchema,
)

# Carga del motor autónomo de informes ejecutivos (report_generator/)
try:
    from report_generator import (
        get_executive_reports_dir,
        get_executive_report_path,
        sanitize_incident_ref,
        cleanup_old_executive_reports,
        ExecutiveIncidentData,
        extract_fields_from_jira_description,
        ExecutiveReportBuilder,
        ConfluenceParser,
    )
    EXECUTIVE_REPORT_AVAILABLE = True
except ImportError as e:
    get_executive_reports_dir = None
    get_executive_report_path = None
    sanitize_incident_ref = None
    cleanup_old_executive_reports = None
    ExecutiveIncidentData = None
    extract_fields_from_jira_description = None
    ExecutiveReportBuilder = None
    ConfluenceParser = None
    EXECUTIVE_REPORT_AVAILABLE = False
    print(f"  [Executive Report] Aviso: Módulo de informe ejecutivo no disponible: {e}")

EXECUTIVE_REPORT_PREFIX = "/api/v1/reports/executive-incident"

_EXECUTIVE_REPORT_JOBS: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()


class ExecutiveReportService:
    @staticmethod
    def is_available() -> bool:
        return EXECUTIVE_REPORT_AVAILABLE

    @staticmethod
    def get_reports_dir() -> Optional[str]:
        if EXECUTIVE_REPORT_AVAILABLE and get_executive_reports_dir:
            return str(get_executive_reports_dir())
        return None

    @staticmethod
    def sanitize_ref(incident_ref: str) -> str:
        if sanitize_incident_ref:
            return sanitize_incident_ref(incident_ref)
        return incident_ref.strip()

    @staticmethod
    def get_file_path(incident_ref: str) -> Optional[Path]:
        if EXECUTIVE_REPORT_AVAILABLE and get_executive_report_path:
            return get_executive_report_path(incident_ref)
        return None

    @classmethod
    def get_job(cls, incident_ref: str) -> Optional[Dict[str, Any]]:
        with _jobs_lock:
            return _EXECUTIVE_REPORT_JOBS.get(incident_ref)

    @classmethod
    def set_job(cls, incident_ref: str, job_data: Dict[str, Any]) -> None:
        with _jobs_lock:
            _EXECUTIVE_REPORT_JOBS[incident_ref] = job_data

    @classmethod
    def execute_generation(
        cls, incident_ref: str, payload: ExecutiveReportRequestSchema, req_id: str
    ) -> ExecutiveReportResponseSchema:
        """Ejecuta la extracción de datos y la construcción de la presentación PowerPoint."""
        data_dict = payload.data.model_dump() if payload.data else {}
        if not data_dict.get("incidentRef"):
            data_dict["incidentRef"] = incident_ref
        if payload.title and not data_dict.get("title"):
            data_dict["title"] = payload.title
        if payload.confluenceUrl and not data_dict.get("sourceUrl"):
            data_dict["sourceUrl"] = payload.confluenceUrl

        if payload.model_extra:
            for k, v in payload.model_extra.items():
                if v and k not in data_dict:
                    data_dict[k] = v

        raw_content = payload.rawContent or data_dict.get("rawContent") or ""
        confluence_url = payload.confluenceUrl or data_dict.get("sourceUrl") or ""

        if raw_content:
            try:
                parser = ConfluenceParser()
                parsed_data = parser.parse(raw_content, fallback_ref=incident_ref, source_url=confluence_url)
                base_dict = parsed_data.to_dict()
                for k, v in data_dict.items():
                    if v and k != "rawContent":
                        base_dict[k] = v
                data_dict = base_dict
            except Exception as pe:
                print(f"  [{req_id}] Aviso al parsear contenido Confluence: {pe}")
        elif confluence_url and not data_dict.get("impactText"):
            try:
                import urllib.request
                req = urllib.request.Request(confluence_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=4.0) as resp:
                    html_content = resp.read().decode("utf-8", errors="ignore")
                    parser = ConfluenceParser()
                    parsed_data = parser.parse(html_content, fallback_ref=incident_ref, source_url=confluence_url)
                    base_dict = parsed_data.to_dict()
                    for k, v in data_dict.items():
                        if v:
                            base_dict[k] = v
                    data_dict = base_dict
            except Exception as ce:
                print(f"  [{req_id}] Nota: No se pudo obtener Confluence automáticamente ({ce}). Se usarán datos base.")

        jira_desc = data_dict.get("description") or ""
        if jira_desc and (not data_dict.get("impactText") or not data_dict.get("causeText") or not data_dict.get("solutionText")):
            extracted = extract_fields_from_jira_description(jira_desc)
            for ek, ev in extracted.items():
                if not data_dict.get(ek):
                    data_dict[ek] = ev

        target_path = cls.get_file_path(incident_ref)
        incident_data = ExecutiveIncidentData.from_dict(data_dict)
        builder = ExecutiveReportBuilder()
        metadata = builder.generate(incident_data, target_path)

        if cleanup_old_executive_reports:
            try:
                cleaned = cleanup_old_executive_reports(max_age_days=14, keep_min=5)
                if cleaned:
                    print(f"  [{req_id}] [Cleanup] Eliminados {len(cleaned)} informes ejecutivos antiguos: {', '.join(cleaned)}")
            except Exception as clean_err:
                print(f"  [{req_id}] [Cleanup] Aviso no bloqueante: {clean_err}")

        cls.set_job(incident_ref, {
            "status": "READY",
            "startedAt": time.time(),
            "requestId": req_id,
            "error": None,
            "filename": metadata.filename,
            "sizeBytes": metadata.size_bytes,
        })

        return ExecutiveReportResponseSchema(
            success=True,
            status="READY",
            incidentRef=metadata.incident_ref,
            filename=metadata.filename,
            downloadUrl=f"{EXECUTIVE_REPORT_PREFIX}/{metadata.incident_ref}",
            generatedAt=metadata.generated_at,
            sizeBytes=metadata.size_bytes,
            slideCount=metadata.slide_count,
            cached=False,
            requestId=req_id,
        )

    @classmethod
    def background_generate(
        cls, incident_ref: str, payload: ExecutiveReportRequestSchema, req_id: str
    ) -> None:
        """Tarea en segundo plano para evitar bloqueos y errores 504 Gateway Time-out."""
        try:
            cls.execute_generation(incident_ref, payload, req_id)
            print(f"  [{req_id}] [Async PPTX] Generación completada para {incident_ref}")
        except Exception as exc:
            err_msg = f"Error generando informe ejecutivo PowerPoint: {exc}"
            print(f"  [{req_id}] [Async PPTX] ERROR en {incident_ref}: {err_msg}")
            cls.set_job(incident_ref, {
                "status": "FAILED",
                "startedAt": time.time(),
                "requestId": req_id,
                "error": err_msg,
            })

    @classmethod
    def cleanup(cls, max_age_days: int = 14, keep_min: int = 5) -> List[str]:
        if not EXECUTIVE_REPORT_AVAILABLE or not cleanup_old_executive_reports:
            raise RuntimeError("Módulo de informe ejecutivo no disponible")
        return cleanup_old_executive_reports(max_age_days=max_age_days, keep_min=keep_min)

