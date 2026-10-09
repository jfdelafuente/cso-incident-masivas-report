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
    clean_lines = []
    for line in raw_text.splitlines():
        line_s = line.strip()
        if not line_s:
            continue
        # Descartar cabeceras tipo INC000004151436 o *INC000004151436 - ...*
        if re.match(r'^\*?INC\d+.*?(\*|$)', line_s, flags=re.IGNORECASE):
            sub_part = re.sub(r'^\*?INC\d+.*?(?:[-:]\s*|\*\s*)', '', line_s, flags=re.IGNORECASE).strip()
            if sub_part and len(sub_part) > 25:
                clean_lines.append(sub_part)
            continue
        # Limpiar prefijo tipo "*Resumen ejecutivo:*" si está en una línea suelta
        if re.match(r'^\*?Resumen\s+ejecutivo\s*[:\*]*\s*$', line_s, flags=re.IGNORECASE):
            continue
        clean_lines.append(line_s)

    if not clean_lines:
        return {}

    full_text = "\n".join(clean_lines).strip()
    impact = ""
    cause = ""
    solution = ""

    # Función auxiliar para limpieza de fragmentos y normalización de mayúsculas/puntuación
    def clean_chunk(text: str) -> str:
        if not text:
            return ""
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        cleaned = " ".join(lines)
        cleaned = re.sub(r'[*_#]+', '', cleaned)
        cleaned = re.sub(r'\s{2,}', ' ', cleaned)
        t = cleaned.strip(" \t\r\n:;-|")
        if t:
            t = t[0].upper() + t[1:]
            if not t.endswith(('.', '!', '?')):
                t += '.'
        return t

    # 2. Patrones explícitos con etiquetas (Impacto:, Causa:, Solución:, etc.)
    impact_m = re.search(
        r'(?:^|\n)(?:[-*#\s]*)(?:Resumen\s+ejecutivo|Impacto|Afectaci[oó]n|Detalle\s+de\s+Impacto)\s*[:\-\*]+\s*(.+?)(?=(?:\n(?:[-*#\s]*)(?:Causa|Soluci[oó]n|Resoluci[oó]n|Acci[oó]n)|$))',
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
    if not ((impact and cause) or (impact and solution) or (cause and solution)):
        # 3. Análisis semántico / narrativo en texto libre
        CAUSE_PATTERN = (
            r'(?:[.,;\n]|^|\b)\s*(?P<marker>(?:'
            r'(?:La\s+)?investigaci[oó]n\s+(?:identific[oó]|determin[oó]|concluy[oó])\b|'
            r'(?:El\s+)?an[aá]lisis\s+(?:determin[oó]|identific[oó]|concluy[oó]|mostr[oó])\b|'
            r'(?:El\s+)?origen\s+(?:es|fue|ha\s+sido|del\s+fallo|de\s+la\s+incidencia|del\s+problema)\b|'
            r'La\s+causa\s+(?:ra[ií]z\s+)?(?:es|fue|ha\s+sido|identificada\s+es|identificada\s+fue|identificada)\b|'
            r'A\s+ra[ií]z\s+de\b|A\s+consecuencia\s+de\b|Motivado\s+por\b|Producido\s+por\b|Causado\s+por\b|Provocado\s+por\b|'
            r'Debido\s+a\b|A\s+causa\s+de\b|'
            r'Tras\s+(?:la\s+)?(?:revisi[oó]n|an[aá]lisis|investigaci[oó]n|diagn[oó]stico)\b|'
            r'Se\s+(?:ha\s+)?(?:detect[oó]|identific[oó]|comprob[oó]|observ[oó]|descubri[oó])\b|'
            r'detectan\s+error\b|'
            r'Causa(?:\s+ra[ií]z)?\s*[:\-]'
            r'))'
        )

        SOLUTION_PATTERN = (
            r'(?:[.,;\n]|^|\b)\s*(?P<marker>(?:'
            r'(?:Como\s+)?medida\s+(?:correctiva|de\s+contingencia|preventiva|adoptada)\b|'
            r'(?:Como\s+)?soluci[oó]n\b|'
            r'Para\s+(?:resolver|mitigar|recuperar|solucionar|restablecer)\b|'
            r'Se\s+(?:procedi[oó]\s+a|procede\s+a|realiz[oó]|realizaron|aplic[oó]|aplica|conmut[oó]|conmuta|sustituy[oó]|sustituye|reinici[oó]|reinicia|modific[oó]|modifica|corrigi[oó]|corrige|restableci[oó]|restablece|recuper[oó]|recupera|escal[oó]\s+a|escala\s+a)\b|'
            r'(?:realizando|ejecutando)\s+reinicio\b|'
            r'quedando\s+(?:la\s+incidencia\s+)?resuelta\b|dando\s+por\s+resuelta\b|'
            r'confirmando\s+(?:el\s+)?correcto\s+funcionamiento\b|'
            r'restableci[oó]ndose\s+el\s+servicio\b|recuper[aá]ndose\s+el\s+servicio\b|'
            r'volvieron\s+a\s+valores\s+normales\b|'
            r'Una\s+vez\s+(?:hecho\s+esto|realizado)\b|'
            r'Finalmente\b|Actualmente\s+la\s+incidencia\s+est[aá]\s+resuelta\b|'
            r'Soluci[oó]n(?:\s+aplicada)?\s*[:\-]'
            r'))'
        )

        cause_match = re.search(CAUSE_PATTERN, full_text, flags=re.IGNORECASE)
        solution_match = re.search(SOLUTION_PATTERN, full_text, flags=re.IGNORECASE)

        if cause_match and solution_match:
            if cause_match.start() < solution_match.start():
                impact = full_text[:cause_match.start()].strip()
                cause = full_text[cause_match.start('marker'):solution_match.start()].strip()
                solution = full_text[solution_match.start('marker'):].strip()
            else:
                impact = full_text[:solution_match.start()].strip()
                solution = full_text[solution_match.start('marker'):cause_match.start()].strip()
                cause = full_text[cause_match.start('marker'):].strip()
        elif cause_match and not solution_match:
            impact = full_text[:cause_match.start()].strip()
            cause_full = full_text[cause_match.start('marker'):].strip()
            sol_sub = re.search(SOLUTION_PATTERN, cause_full, flags=re.IGNORECASE)
            if sol_sub and sol_sub.start('marker') > 25:
                cause = cause_full[:sol_sub.start()].strip()
                solution = cause_full[sol_sub.start('marker'):].strip()
            else:
                cause = cause_full
        elif solution_match and not cause_match:
            impact_full = full_text[:solution_match.start()].strip()
            solution = full_text[solution_match.start('marker'):].strip()
            c_sub = re.search(CAUSE_PATTERN, impact_full, flags=re.IGNORECASE)
            if c_sub:
                impact = impact_full[:c_sub.start()].strip()
                cause = impact_full[c_sub.start('marker'):].strip()
            else:
                causal_m = re.search(r'(?:[.,;\n]|^)\s*(?:debido\s+a|por\s+(?:fallo|problema|error|llenado|ca[ií]da|saturaci[oó]n|indisponibilidad))\b', impact_full, flags=re.IGNORECASE)
                if causal_m and causal_m.start() > 25:
                    impact = impact_full[:causal_m.start()].strip()
                    cause = impact_full[causal_m.start():].strip()
                else:
                    impact = impact_full

    # Fallbacks inteligentes si algún campo queda vacío
    if not impact:
        if clean_lines:
            impact = clean_lines[0]
        else:
            impact = full_text

    if not cause:
        if len(clean_lines) >= 3 and not solution:
            cause = clean_lines[1]
            solution = " ".join(clean_lines[2:])
        elif len(clean_lines) >= 2:
            cause = clean_lines[1]
        else:
            sents = [s.strip() for s in re.split(r'\.\s+', impact) if s.strip()]
            if len(sents) >= 3 and not solution:
                impact = sents[0] + "."
                cause = sents[1] + "."
                solution = ". ".join(sents[2:]) + "."
            elif len(sents) >= 2:
                cause = sents[-1] + "."
                impact = ". ".join(sents[:-1]) + "."
            else:
                cause = "Análisis e investigación técnica realizada sobre el servicio afectado."

    if not solution:
        if cause and any(w in cause.lower() for w in ['resuel', 'recuper', 'reinic', 'restitu', 'normaliz', 'solvent', 'conmut']):
            sents = [s.strip() for s in re.split(r'\.\s+', cause) if s.strip()]
            if len(sents) >= 2:
                solution = sents[-1] + "."
                cause = ". ".join(sents[:-1]) + "."
        if not solution:
            solution = "Incidencia resuelta y servicio restablecido tras las actuaciones operativas."

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

