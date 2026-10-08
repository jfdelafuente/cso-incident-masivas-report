from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple

try:
    from bs4 import BeautifulSoup, Tag
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False
    BeautifulSoup = Any
    Tag = Any

try:
    from .executive_models import (
        ExecutiveIncidentData,
        ExecutiveActionPoint,
        ExecutiveTimelineEvent,
        sanitize_incident_ref,
    )
except (ImportError, ValueError):
    from executive_models import (
        ExecutiveIncidentData,
        ExecutiveActionPoint,
        ExecutiveTimelineEvent,
        sanitize_incident_ref,
    )


class _HTMLTableExtractor(HTMLParser):
    """Extrae todas las tablas y párrafos/encabezados estructurados de un documento HTML (fallback sin BS4)."""

    def __init__(self):
        super().__init__()
        self.tables: List[List[List[str]]] = []
        self._current_table: Optional[List[List[str]]] = None
        self._current_row: Optional[List[str]] = None
        self._current_cell: Optional[str] = None
        self.text_blocks: List[Tuple[str, str]] = []
        self._current_heading: Optional[str] = None
        self._current_heading_tag: Optional[str] = None
        self._current_p: Optional[str] = None

    def handle_starttag(self, tag: str, attrs):
        t = tag.lower()
        if t == "table":
            self._current_table = []
        elif t == "tr" and self._current_table is not None:
            self._current_row = []
        elif t in ("td", "th") and self._current_row is not None:
            self._current_cell = ""
        elif t in ("h1", "h2", "h3", "h4"):
            self._current_heading_tag = t
            self._current_heading = ""
        elif t == "p":
            self._current_p = ""

    def handle_endtag(self, tag: str):
        t = tag.lower()
        if t == "table" and self._current_table is not None:
            if self._current_table:
                self.tables.append(self._current_table)
            self._current_table = None
        elif t == "tr" and self._current_row is not None and self._current_table is not None:
            if any(cell.strip() for cell in self._current_row):
                self._current_table.append(self._current_row)
            self._current_row = None
        elif t in ("td", "th") and self._current_cell is not None and self._current_row is not None:
            self._current_row.append(self._current_cell.strip())
            self._current_cell = None
        elif t in ("h1", "h2", "h3", "h4") and self._current_heading is not None:
            text = self._current_heading.strip()
            if text:
                self.text_blocks.append((self._current_heading_tag or "h2", text))
            self._current_heading = None
            self._current_heading_tag = None
        elif t == "p" and self._current_p is not None:
            text = self._current_p.strip()
            if text:
                self.text_blocks.append(("p", text))
            self._current_p = None

    def handle_data(self, data: str):
        if self._current_cell is not None:
            self._current_cell += data
        if self._current_heading is not None:
            self._current_heading += data
        if self._current_p is not None:
            self._current_p += data


class ConfluenceParser:
    """Parser para contenido HTML o texto plano proveniente de páginas de postmortem Confluence."""

    def parse(self, raw_content: str, fallback_ref: str = "", source_url: str = "") -> ExecutiveIncidentData:
        if not raw_content:
            return ExecutiveIncidentData(
                incident_ref=fallback_ref or "INCIDENCIA",
                title="Incidencia " + (fallback_ref or ""),
                source_url=source_url,
            )

        # Si detectamos etiquetas HTML, usamos extractor estructurado
        is_html = "<html" in raw_content.lower() or "<table" in raw_content.lower() or "<h" in raw_content.lower() or "<p" in raw_content.lower()

        if is_html:
            return self._parse_html(raw_content, fallback_ref, source_url)
        else:
            return self._parse_plain_text(raw_content, fallback_ref, source_url)

    def _parse_html(self, html_str: str, fallback_ref: str, source_url: str) -> ExecutiveIncidentData:
        if BS4_AVAILABLE:
            try:
                return self._parse_html_bs4(html_str, fallback_ref, source_url)
            except Exception:
                pass  # Fallback a extractor clásico si ocurre algún error imprevisto
        return self._parse_html_legacy(html_str, fallback_ref, source_url)

    def _parse_html_bs4(self, html_str: str, fallback_ref: str, source_url: str) -> ExecutiveIncidentData:
        soup = BeautifulSoup(html_str, "html.parser")

        # 1. Identificar tablas (Action points y Timeline)
        action_points: List[ExecutiveActionPoint] = []
        timeline_events: List[ExecutiveTimelineEvent] = []

        for table in soup.find_all("table"):
            rows = []
            for tr in table.find_all("tr"):
                cells = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
                if any(cells):
                    rows.append(cells)
            if not rows:
                continue

            headers = [c.lower() for c in rows[0]]

            # ¿Es tabla de acciones?
            if any("pain" in h or "acci" in h or "owner" in h or "forecast" in h or "responsable" in h or "medida" in h for h in headers):
                for row in rows[1:]:
                    if len(row) >= 4:
                        action_points.append(
                            ExecutiveActionPoint(
                                pain_point=row[0],
                                description=row[1],
                                owner=row[2],
                                forecast=row[3],
                            )
                        )
                    elif len(row) >= 2:
                        action_points.append(
                            ExecutiveActionPoint(
                                pain_point="Solución" if len(row) > 2 else "Otros",
                                description=row[1] if len(row) > 1 else row[0],
                                owner=row[2] if len(row) > 2 else "—",
                                forecast=row[3] if len(row) > 3 else "—",
                            )
                        )
            # ¿Es tabla de cronología?
            elif any("hora" in h or "time" in h or "evento" in h or "hito" in h or "cronolog" in h for h in headers) or (
                len(rows[0]) == 2 and any(re.search(r'\d{1,2}:\d{2}', r[0]) for r in rows[1:4])
            ):
                for row in rows[1:]:
                    if len(row) >= 2 and row[0]:
                        timeline_events.append(
                            ExecutiveTimelineEvent(
                                time=row[0],
                                event=row[1],
                            )
                        )

        # 2. Extraer Título
        title_clean = ""
        h1 = soup.find("h1")
        if h1:
            title_clean = h1.get_text(strip=True)
        elif soup.title:
            title_clean = soup.title.get_text(strip=True)
        if not title_clean:
            title_clean = f"Incidencia {fallback_ref}"

        # 3. Extraer Referencia
        ref_match = re.search(r'(\d{4}[A-Za-z]\d{4,6})', html_str)
        if not ref_match:
            ref_match = re.search(r'(INC\d+)', html_str, re.IGNORECASE)
        incident_ref = ref_match.group(1) if ref_match else (fallback_ref or "INCIDENCIA")

        # 4. Extraer Inicio y Duración
        clean_text = soup.get_text(separator="\n", strip=True)
        start_time = ""
        m_start = re.search(r'Inicio:\s*([\d\/\-\s:]+)', clean_text, re.IGNORECASE)
        if m_start:
            start_time = m_start.group(1).strip()

        duration = ""
        m_dur = re.search(r'Duraci[oó]n:\s*([^\n\.<]+)', clean_text, re.IGNORECASE)
        if m_dur:
            duration = m_dur.group(1).strip()

        # 5. Extraer Secciones de Texto
        business_impact = self._extract_bs4_section(
            soup,
            ["impacto en negocio", "impacto de negocio", "impacto negocio", "negocio", "business impact"],
        )
        impact_text = self._extract_bs4_section(
            soup,
            ["impacto", "impact"],
            exclude_keywords=["negocio", "business"],
        )
        cause_text = self._extract_bs4_section(
            soup,
            ["causa", "causa raíz", "cause", "root cause"],
        )
        solution_text = self._extract_bs4_section(
            soup,
            ["soluci", "solution", "medida", "resoluc"],
        )

        # Si no había sección dedicada a negocio pero está dentro del impacto, separarlo
        if not business_impact and impact_text:
            impact_clean, biz_clean = self._split_business_impact_inline(impact_text)
            if biz_clean:
                business_impact = biz_clean
                impact_text = impact_clean

        return ExecutiveIncidentData(
            incident_ref=incident_ref,
            title=title_clean,
            start_time=start_time,
            duration=duration,
            impact_text=impact_text,
            business_impact=business_impact,
            cause_text=cause_text,
            solution_text=solution_text,
            action_points=action_points,
            timeline_events=timeline_events,
            source_url=source_url,
        )

    def _extract_bs4_section(
        self,
        soup: BeautifulSoup,
        keywords: List[str],
        exclude_keywords: Optional[List[str]] = None,
    ) -> str:
        """Extrae el contenido textual (párrafos, viñetas li) bajo un encabezado específico."""
        for heading in soup.find_all(["h1", "h2", "h3", "h4", "p"]):
            if heading.name == "p":
                strong = heading.find(["strong", "b"])
                if not strong:
                    continue
                header_text = strong.get_text(strip=True).lower()
            else:
                header_text = heading.get_text(strip=True).lower()

            if any(kw in header_text for kw in keywords):
                if exclude_keywords and any(ex in header_text for ex in exclude_keywords):
                    continue

                lines: List[str] = []
                if heading.name == "p":
                    full_p = heading.get_text(strip=True)
                    rem = re.sub(r'^(?:' + '|'.join(re.escape(k) for k in keywords) + r')\s*[:\-]?\s*', '', full_p, flags=re.I)
                    if rem and rem != full_p:
                        lines.append(rem.strip())

                curr = heading.find_next_sibling()
                while curr and curr.name not in ["h1", "h2", "h3", "h4"]:
                    if curr.name == "p":
                        st = curr.find(["strong", "b"])
                        if st and any(colon in curr.get_text()[:30] for colon in [":", " -"]):
                            st_txt = st.get_text(strip=True).lower()
                            if any(w in st_txt for w in ["causa", "soluci", "impacto", "cronolog", "acci"]):
                                break
                        txt = curr.get_text(strip=True)
                        if txt:
                            lines.append(txt)
                    elif curr.name in ("ul", "ol"):
                        for li in curr.find_all("li"):
                            li_txt = li.get_text(strip=True)
                            if li_txt:
                                lines.append(f"- {li_txt}")
                    elif curr.name == "div":
                        for child in curr.find_all(["p", "li"]):
                            child_txt = child.get_text(strip=True)
                            if child_txt:
                                prefix = "- " if child.name == "li" else ""
                                lines.append(f"{prefix}{child_txt}")
                    curr = curr.find_next_sibling()

                if lines:
                    return "\n".join(lines).strip()

        return ""

    def _split_business_impact_inline(self, impact_text: str) -> Tuple[str, str]:
        """Separa el impacto en negocio si está incrustado como subtítulo dentro del texto de impacto."""
        lines = impact_text.splitlines()
        non_biz: List[str] = []
        biz: List[str] = []
        in_biz = False

        for line in lines:
            l_strip = line.strip()
            if re.match(r'^(?:[-*]\s*)?impacto\s+(?:en|de)\s+negocio\s*[:\-]?', l_strip, re.I):
                in_biz = True
                after = re.sub(r'^(?:[-*]\s*)?impacto\s+(?:en|de)\s+negocio\s*[:\-]?\s*', '', l_strip, flags=re.I)
                if after:
                    biz.append(after)
            elif in_biz:
                if l_strip.startswith(("-", "*", "•")) or re.match(r'^[A-Z][a-zA-Z\s]+:', l_strip):
                    biz.append(l_strip)
                else:
                    in_biz = False
                    non_biz.append(l_strip)
            else:
                non_biz.append(l_strip)

        return "\n".join(non_biz).strip(), "\n".join(biz).strip()

    def _parse_html_legacy(self, html_str: str, fallback_ref: str, source_url: str) -> ExecutiveIncidentData:
        extractor = _HTMLTableExtractor()
        try:
            extractor.feed(html_str)
        except Exception:
            pass

        action_points: List[ExecutiveActionPoint] = []
        timeline_events: List[ExecutiveTimelineEvent] = []

        for table in extractor.tables:
            if not table:
                continue
            headers = [c.lower() for c in table[0]]
            if any("pain" in h or "acci" in h or "owner" in h or "forecast" in h for h in headers):
                for row in table[1:]:
                    if len(row) >= 4:
                        action_points.append(
                            ExecutiveActionPoint(
                                pain_point=row[0],
                                description=row[1],
                                owner=row[2],
                                forecast=row[3],
                            )
                        )
                    elif len(row) >= 2:
                        action_points.append(
                            ExecutiveActionPoint(
                                pain_point="Solución" if len(row) > 2 else "Otros",
                                description=row[1] if len(row) > 1 else row[0],
                                owner=row[2] if len(row) > 2 else "—",
                                forecast=row[3] if len(row) > 3 else "—",
                            )
                        )
            elif any("hora" in h or "time" in h or "evento" in h for h in headers) or (len(table[0]) == 2 and any(re.search(r'\d{1,2}:\d{2}', r[0]) for r in table[1:3])):
                for row in table[1:]:
                    if len(row) >= 2:
                        timeline_events.append(
                            ExecutiveTimelineEvent(
                                time=row[0],
                                event=row[1],
                            )
                        )

        clean_text = re.sub(r'<[^>]+>', ' ', html_str)
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()

        title_match = re.search(r'<h1[^>]*>(.*?)</h1>', html_str, re.IGNORECASE | re.DOTALL)
        if title_match:
            title_clean = re.sub(r'<[^>]+>', '', title_match.group(1)).strip()
        else:
            title_clean = f"Incidencia {fallback_ref}"

        ref_match = re.search(r'\b(\d{4}[A-Za-z]\d{4,6})\b', html_str)
        if not ref_match:
            ref_match = re.search(r'\b(INC\d+)\b', html_str, re.IGNORECASE)
        incident_ref = ref_match.group(1) if ref_match else (fallback_ref or "INCIDENCIA")

        start_time = ""
        m_start = re.search(r'Inicio:\s*([\d\/\-\s:]+)', clean_text, re.IGNORECASE)
        if m_start:
            start_time = m_start.group(1).strip()

        duration = ""
        m_dur = re.search(r'Duraci[oó]n:\s*([^\n\.<]+)', clean_text, re.IGNORECASE)
        if m_dur:
            duration = m_dur.group(1).strip()

        business_impact = self._extract_section(html_str, clean_text, ["impacto en negocio", "impacto de negocio"])
        impact_text = self._extract_section(html_str, clean_text, ["impacto", "impact"])
        cause_text = self._extract_section(html_str, clean_text, ["causa", "causa raíz", "cause"])
        solution_text = self._extract_section(html_str, clean_text, ["soluci", "solution", "medida", "resoluc"])

        return ExecutiveIncidentData(
            incident_ref=incident_ref,
            title=title_clean,
            start_time=start_time,
            duration=duration,
            impact_text=impact_text,
            business_impact=business_impact,
            cause_text=cause_text,
            solution_text=solution_text,
            action_points=action_points,
            timeline_events=timeline_events,
            source_url=source_url,
        )

    def _parse_plain_text(self, text: str, fallback_ref: str, source_url: str) -> ExecutiveIncidentData:
        lines = [line.strip() for line in text.splitlines() if line.strip()]

        ref_match = re.search(r'\b(\d{4}[A-Za-z]\d{4,6})\b', text)
        if not ref_match:
            ref_match = re.search(r'\b(INC\d+)\b', text, re.IGNORECASE)
        incident_ref = ref_match.group(1) if ref_match else (fallback_ref or "INCIDENCIA")

        title = lines[0] if lines else f"Incidencia {incident_ref}"
        if "INCIDENCIA:" in title.upper():
            title = title.split(":", 1)[1].strip()

        start_time = ""
        m_start = re.search(r'Inicio:\s*([\d\/\-\s:]+)', text, re.IGNORECASE)
        if m_start:
            start_time = m_start.group(1).strip()

        duration = ""
        m_dur = re.search(r'Duraci[oó]n:\s*([^\n\.]+)', text, re.IGNORECASE)
        if m_dur:
            duration = m_dur.group(1).strip()

        business_impact = self._extract_section_from_text(lines, ["impacto en negocio", "impacto de negocio", "impacto negocio", "negocio"])
        impact_text = self._extract_section_from_text(lines, ["impacto", "impact"], exclude_keywords=["negocio"])
        cause_text = self._extract_section_from_text(lines, ["causa", "causa raíz", "cause"])
        solution_text = self._extract_section_from_text(lines, ["soluci", "solution", "medida", "resoluc"])

        if not business_impact and impact_text:
            impact_clean, biz_clean = self._split_business_impact_inline(impact_text)
            if biz_clean:
                business_impact = biz_clean
                impact_text = impact_clean

        # Timeline en texto: líneas tipo "15:16 Mensaje"
        timeline_events: List[ExecutiveTimelineEvent] = []
        for line in lines:
            t_match = re.match(r'^(\d{1,2}:\d{2})\s*(?:[-–:]\s*)?(.*)$', line)
            if t_match:
                timeline_events.append(
                    ExecutiveTimelineEvent(
                        time=t_match.group(1),
                        event=t_match.group(2).strip(),
                    )
                )

        return ExecutiveIncidentData(
            incident_ref=incident_ref,
            title=title,
            start_time=start_time,
            duration=duration,
            impact_text=impact_text,
            business_impact=business_impact,
            cause_text=cause_text,
            solution_text=solution_text,
            action_points=[],
            timeline_events=timeline_events,
            source_url=source_url,
        )

    def _extract_section(self, html: str, clean_text: str, keywords: List[str]) -> str:
        for kw in keywords:
            pattern = rf'<h[234][^>]*>[^<]*{kw}[^<]*</h[234]>\s*<p[^>]*>(.*?)</p>'
            m = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
            if m:
                return re.sub(r'<[^>]+>', ' ', m.group(1)).strip()

            text_pattern = rf'{kw}\s*[:\-]?\s*([^\n]+(?:\n[^\n]+)?)'
            tm = re.search(text_pattern, clean_text, re.IGNORECASE)
            if tm:
                return tm.group(1).strip()

        return ""

    def _extract_section_from_text(self, lines: List[str], keywords: List[str], exclude_keywords: Optional[List[str]] = None) -> str:
        known_headers = [
            "inicio:", "duración:", "duracion:", "impacto:", "impacto en negocio:",
            "impacto de negocio:", "causa:", "causa raíz:", "solución:", "solucion:",
            "cronología:", "cronologia:", "puntos de acción:", "puntos de accion:", "acciones:"
        ]
        for idx, line in enumerate(lines):
            line_clean = line.strip()
            line_lower = line_clean.lower()
            if exclude_keywords and any(ex in line_lower for ex in exclude_keywords):
                continue
            if any(line_lower.startswith(kw) or line_lower.startswith(f"{kw}:") or line_lower.startswith(f"# {kw}") for kw in keywords):
                collected = []
                if ":" in line_clean:
                    rest = line_clean.split(":", 1)[1].strip()
                    if rest:
                        collected.append(rest)
                for next_line in lines[idx + 1:]:
                    nl_clean = next_line.strip()
                    nl_lower = nl_clean.lower()
                    if any(nl_lower.startswith(h) for h in known_headers):
                        break
                    if re.match(r'^[A-ZÁÉÍÓÚÑ\s]{3,}:', nl_clean):
                        break
                    if re.match(r'^\d{1,2}:\d{2}', nl_clean):
                        break
                    if nl_clean:
                        collected.append(nl_clean)
                if collected:
                    return "\n".join(collected).strip()
        return ""
