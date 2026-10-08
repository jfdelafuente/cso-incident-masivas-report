"""
Módulo autónomo de generación de informes ejecutivos PowerPoint para incidencias postmortem.
"""

from .executive_models import (
    ExecutiveIncidentData,
    ExecutiveActionPoint,
    ExecutiveTimelineEvent,
    ReportMetadata,
    sanitize_incident_ref,
    extract_fields_from_jira_description,
)
from .executive_paths import (
    get_executive_template_path,
    get_executive_reports_dir,
    get_executive_report_filename,
    get_executive_report_path,
    cleanup_old_executive_reports,
)
from .executive_report_builder import ExecutiveReportBuilder
from .confluence_parser import ConfluenceParser

__all__ = [
    "ExecutiveIncidentData",
    "ExecutiveActionPoint",
    "ExecutiveTimelineEvent",
    "ReportMetadata",
    "sanitize_incident_ref",
    "extract_fields_from_jira_description",
    "get_executive_template_path",
    "get_executive_reports_dir",
    "get_executive_report_filename",
    "get_executive_report_path",
    "cleanup_old_executive_reports",
    "ExecutiveReportBuilder",
    "ConfluenceParser",
]
