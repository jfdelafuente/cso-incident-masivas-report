"""
Modelos de datos para el informe ejecutivo de incidencias postmortem.
Feature 010: 010-incident-executive-report
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


def sanitize_incident_ref(ref: str) -> str:
    """Normaliza y sanitiza el código o identificador de incidencia."""
    if not ref:
        return "INCIDENCIA"
    cleaned = re.sub(r'[^a-zA-Z0-9_\-]', '', str(ref).strip())
    return cleaned if cleaned else "INCIDENCIA"


@dataclass
class ExecutiveActionPoint:
    """Representa una fila en la tabla de Puntos de Acción Relevantes de la diapositiva 1."""
    pain_point: str = ""
    description: str = ""
    owner: str = ""
    forecast: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ExecutiveActionPoint:
        if not isinstance(data, dict):
            return cls()
        return cls(
            pain_point=str(data.get("painPoint") or data.get("pain_point") or data.get("tipo") or "Otros").strip(),
            description=str(data.get("description") or data.get("descripcion") or data.get("accion") or "").strip(),
            owner=str(data.get("owner") or data.get("responsable") or "—").strip(),
            forecast=str(data.get("forecast") or data.get("fecha") or data.get("estado") or "—").strip(),
        )

    def to_dict(self) -> Dict[str, str]:
        return {
            "painPoint": self.pain_point,
            "description": self.description,
            "owner": self.owner,
            "forecast": self.forecast,
        }


@dataclass
class ExecutiveTimelineEvent:
    """Representa un hito o evento en la tabla cronológica de las diapositivas 2 y 3."""
    time: str = ""
    event: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ExecutiveTimelineEvent:
        if not isinstance(data, dict):
            return cls()
        return cls(
            time=str(data.get("time") or data.get("hora") or "").strip(),
            event=str(data.get("event") or data.get("evento") or data.get("descripcion") or "").strip(),
        )

    def to_dict(self) -> Dict[str, str]:
        return {
            "time": self.time,
            "event": self.event,
        }


def extract_fields_from_jira_description(desc: str) -> Dict[str, str]:
    """
    Extrae impacto, causa y solución a partir del texto de descripción de una incidencia de Jira.
    Soporta formato con etiquetas explícitas (*Impacto:*, Causa raíz:, etc.),
    división por párrafos secuenciales y extracción semántica en narrativas continuas de un solo bloque.
    """
    if not desc or not desc.strip():
        return {}

    raw_text = desc.strip()

    # 1. Limpieza de cabeceras de incidencia tipo *INC12345 - Titulo* o INC12345 - ...
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    if not lines:
        return {}

    # Si la primera línea es únicamente una cabecera de título (ej: *INC...* o INC... breve y hay más líneas)
    if len(lines) > 1 and (
        re.match(r'^\*INC\d+.*?(\*|$)', lines[0], flags=re.IGNORECASE)
        or (re.match(r'^INC\d+\b', lines[0], flags=re.IGNORECASE) and len(lines[0]) < 100 and not lines[0].endswith('.'))
    ):
        lines = lines[1:]

    if not lines:
        return {}

    # Si la primera línea restante empieza con el prefijo INCxxxx - , remover solo el prefijo
    lines[0] = re.sub(r'^(?:\*?INC\d+\*?\s*[-–:]\s*)', '', lines[0], flags=re.IGNORECASE).strip()

    full_text = "\n".join(lines).strip()
    impact = ""
    cause = ""
    solution = ""

    # Función auxiliar para limpieza de fragmentos y normalización de mayúsculas/puntuación
    def clean_chunk(text: str) -> str:
        t = re.sub(r'^[,\s;:*\-]+', '', text).strip()
        t = re.sub(r'[,\s;:*\-]+$', '', t).strip()
        if t:
            t = t[0].upper() + t[1:]
            if not t.endswith(('.', '!', '?')):
                t += '.'
        return t

    # 2. Patrones explícitos con etiquetas (Impacto:, Causa:, Solución:, etc.)
    impact_m = re.search(
        r'(?:^|\n)(?:[-*#\s]*)(?:Impacto|Afectaci[oó]n|Detalle\s+de\s+Impacto)\s*[:\-\*]+\s*(.+?)(?=(?:\n(?:[-*#\s]*)(?:Causa|Soluci[oó]n|Resoluci[oó]n|Acci[oó]n)|$))',
        full_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if impact_m:
        impact = impact_m.group(1).strip()

    cause_m = re.search(
        r'(?:^|\n)(?:[-*#\s]*)(?:Causa(?:\s+ra[ií]z)?|Motivo|Origen)\s*[:\-\*]+\s*(.+?)(?=(?:\n(?:[-*#\s]*)(?:Impacto|Soluci[oó]n|Resoluci[oó]n|Acci[oó]n)|$))',
        full_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if cause_m:
        cause = cause_m.group(1).strip()

    solution_m = re.search(
        r'(?:^|\n)(?:[-*#\s]*)(?:Soluci[oó]n(?:\s+aplicada)?|Resoluci[oó]n|Medida|Acci[oó]n)\s*[:\-\*]+\s*(.+?)(?=(?:\n(?:[-*#\s]*)(?:Impacto|Causa|Puntos)|$))',
        full_text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if solution_m:
        solution = solution_m.group(1).strip()

    # Si ya se encontraron al menos 2 campos explícitos, devolverlos normalizados
    if (impact and cause) or (impact and solution) or (cause and solution):
        res = {}
        if impact: res["impactText"] = clean_chunk(impact)
        if cause: res["causeText"] = clean_chunk(cause)
        if solution: res["solutionText"] = clean_chunk(solution)
        return res

    # 3. Análisis semántico / narrativo en texto libre (párrafo único o continuo)
    # Expresiones regulares de transición:
    CAUSE_PATTERN = r'(?:[.,;\n]|^|\b)\s*(?P<marker>(?:Tras\s+(?:la\s+)?(?:revisi[oó]n|an[aá]lisis|investigaci[oó]n|diagn[oó]stico)\b|Se\s+(?:ha\s+)?detect[oó]\b|Se\s+(?:ha\s+)?identific[oó]\b|Se\s+(?:ha\s+)?comprob[oó]\b|Se\s+(?:ha\s+)?observ[oó]\b|Debido\s+a\b|A\s+causa\s+de\b|Motivado\s+por\b|Producido\s+por\b|El\s+origen\s+(?:es|fue|ha\s+sido)\b|La\s+causa\s+(?:ra[ií]z\s+)?(?:es|fue|ha\s+sido)\b|Causa\s*[:\-]))'
    
    SOLUTION_PATTERN = r'(?:[.,;\n]|^|\b)\s*(?P<marker>(?:Finalmente\b|Se\s+procedi[oó]\s+a\b|Se\s+procede\s+a\b|Se\s+sustituy[oó]\b|Se\s+sustituye\b|Se\s+reinici[oó]\b|Se\s+reinicia\b|Se\s+realiz[oó]\s+un\s+reinicio\b|Se\s+realizaron\s+reinicios\b|Se\s+escal[oó]\s+a\b|Se\s+escala\s+a\b|Como\s+soluci[oó]n\b|Como\s+medida\b|Para\s+resolver\b|Para\s+mitigar\b|Para\s+recuperar\b|Para\s+solucionar\b|Se\s+aplic[oó]\b|Se\s+aplica\b|Se\s+corrige\b|Se\s+corrigi[oó]\b|Se\s+restableci[oó]\b|Se\s+recuper[oó]\b|Resuelto\b|Soluci[oó]n\s*[:\-]))'

    cause_match = re.search(CAUSE_PATTERN, full_text, flags=re.IGNORECASE)
    solution_match = re.search(SOLUTION_PATTERN, full_text, flags=re.IGNORECASE)

    if cause_match and solution_match:
        if cause_match.start() < solution_match.start():
            impact = full_text[:cause_match.start()].strip()
            cause_start = cause_match.start('marker')
            cause = full_text[cause_start:solution_match.start()].strip()
            sol_start = solution_match.start('marker')
            solution = full_text[sol_start:].strip()
        else:
            impact = full_text[:solution_match.start()].strip()
            sol_start = solution_match.start('marker')
            solution = full_text[sol_start:cause_match.start()].strip()
            cause_start = cause_match.start('marker')
            cause = full_text[cause_start:].strip()

    elif cause_match and not solution_match:
        impact = full_text[:cause_match.start()].strip()
        cause_start = cause_match.start('marker')
        cause = full_text[cause_start:].strip()

    elif solution_match and not cause_match:
        impact = full_text[:solution_match.start()].strip()
        sol_start = solution_match.start('marker')
        solution = full_text[sol_start:].strip()

    # Si aún no se ha podido extraer causa/solución y hay párrafos
    if not cause and not solution:
        if len(lines) >= 3:
            impact = lines[0]
            cause = lines[1]
            solution = " ".join(lines[2:])
        elif len(lines) == 2:
            impact = lines[0]
            cause = lines[1]
            solution = lines[1]
        elif len(lines) == 1:
            sentences = [s.strip() for s in re.split(r'\.\s+', full_text) if s.strip()]
            if len(sentences) >= 3:
                impact = sentences[0] + "."
                cause = sentences[1] + "."
                solution = ". ".join(sentences[2:])
            elif len(sentences) == 2:
                impact = sentences[0] + "."
                if any(w in sentences[1].lower() for w in ["reinic", "sustitu", "resuel", "escal", "aplic", "soluc"]):
                    solution = sentences[1] + "."
                else:
                    cause = sentences[1] + "."
            else:
                impact = full_text

    result = {}
    if impact:
        imp_clean = clean_chunk(impact)
        if imp_clean:
            result['impactText'] = imp_clean
    if cause:
        cau_clean = clean_chunk(cause)
        if cau_clean:
            result['causeText'] = cau_clean
    if solution:
        sol_clean = clean_chunk(solution)
        if sol_clean:
            result['solutionText'] = sol_clean
    return result


@dataclass
class ExecutiveIncidentData:
    """Datos completos extraídos para elaborar el informe ejecutivo en PowerPoint."""
    incident_ref: str
    title: str = "Incidencia"
    start_time: str = ""
    duration: str = ""
    impact_text: str = ""
    business_impact: str = ""
    cause_text: str = ""
    solution_text: str = ""
    action_points: List[ExecutiveActionPoint] = field(default_factory=list)
    timeline_events: List[ExecutiveTimelineEvent] = field(default_factory=list)
    source_url: str = ""

    def __post_init__(self):
        self.incident_ref = sanitize_incident_ref(self.incident_ref)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ExecutiveIncidentData:
        if not isinstance(data, dict):
            return cls(incident_ref="DESCONOCIDO")

        ref = str(data.get("incidentRef") or data.get("incident_ref") or data.get("id") or "INCIDENCIA").strip()
        title = str(data.get("title") or data.get("titulo") or "Incidencia").strip()
        start_time = str(data.get("startTime") or data.get("start_time") or data.get("inicio") or "").strip()
        duration = str(data.get("duration") or data.get("duracion") or "").strip()
        impact = str(data.get("impactText") or data.get("impact_text") or data.get("impacto") or "").strip()
        business_impact = str(data.get("businessImpact") or data.get("business_impact") or data.get("impacto_negocio") or "").strip()
        cause = str(data.get("causeText") or data.get("cause_text") or data.get("causa") or "").strip()
        solution = str(data.get("solutionText") or data.get("solution_text") or data.get("solucion") or "").strip()
        source_url = str(data.get("sourceUrl") or data.get("source_url") or data.get("confluenceUrl") or "").strip()

        # Fallback a descripción de Jira si faltan impacto, causa o solución
        jira_desc = str(data.get("description") or "").strip()
        if jira_desc and (not impact or not cause or not solution):
            extracted = extract_fields_from_jira_description(jira_desc)
            if not impact and extracted.get("impactText"):
                impact = extracted["impactText"]
            if not cause and extracted.get("causeText"):
                cause = extracted["causeText"]
            if not solution and extracted.get("solutionText"):
                solution = extracted["solutionText"]

        raw_actions = data.get("actionPoints") or data.get("action_points") or data.get("puntos_accion") or []
        action_points = [ExecutiveActionPoint.from_dict(item) for item in raw_actions if isinstance(item, dict)]

        raw_timeline = data.get("timelineEvents") or data.get("timeline_events") or data.get("cronologia") or []
        timeline_events = [ExecutiveTimelineEvent.from_dict(item) for item in raw_timeline if isinstance(item, dict)]

        return cls(
            incident_ref=ref,
            title=title,
            start_time=start_time,
            duration=duration,
            impact_text=impact,
            business_impact=business_impact,
            cause_text=cause,
            solution_text=solution,
            action_points=action_points,
            timeline_events=timeline_events,
            source_url=source_url,
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "incidentRef": self.incident_ref,
            "title": self.title,
            "startTime": self.start_time,
            "duration": self.duration,
            "impactText": self.impact_text,
            "businessImpact": self.business_impact,
            "causeText": self.cause_text,
            "solutionText": self.solution_text,
            "sourceUrl": self.source_url,
            "actionPoints": [ap.to_dict() for ap in self.action_points],
            "timelineEvents": [te.to_dict() for te in self.timeline_events],
        }


@dataclass
class ReportMetadata:
    """Metadatos de persistencia del informe en disco."""
    incident_ref: str
    filename: str
    file_path: str
    generated_at: str
    size_bytes: int
    slide_count: int = 3

    def to_dict(self) -> Dict[str, Any]:
        return {
            "incidentRef": self.incident_ref,
            "filename": self.filename,
            "filePath": self.file_path,
            "generatedAt": self.generated_at,
            "sizeBytes": self.size_bytes,
            "slideCount": self.slide_count,
        }

