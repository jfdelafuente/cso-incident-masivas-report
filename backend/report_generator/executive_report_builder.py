"""
Generador de informes ejecutivos PowerPoint basados en la plantilla corporativa Orange.
Feature 010: 010-incident-executive-report
"""

import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

import pptx
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

try:
    from .executive_models import (
        ExecutiveIncidentData,
        ExecutiveActionPoint,
        ExecutiveTimelineEvent,
        ReportMetadata,
    )
    from .executive_paths import (
        get_executive_template_path,
        get_executive_report_path,
        get_executive_report_filename,
    )
except (ImportError, ValueError):
    from executive_models import (
        ExecutiveIncidentData,
        ExecutiveActionPoint,
        ExecutiveTimelineEvent,
        ReportMetadata,
    )
    from executive_paths import (
        get_executive_template_path,
        get_executive_report_path,
        get_executive_report_filename,
    )


def extract_business_areas(business_impact: str) -> List[str]:
    """
    Extrae los nombres clave de áreas de negocio afectadas (ej. 'Ventas', 'Provisión', 'Atención al Cliente')
    a partir del texto de impacto en negocio, omitiendo descripciones operacionales largas.
    """
    if not business_impact or business_impact.strip() in ["—", "-", "N/A", "None"]:
        return []

    cleaned = re.sub(r'^(?:###?\s*)?Impacto\s+(?:en|de)\s+Negocio\s*[:\n]?', '', business_impact.strip(), flags=re.I)
    cleaned = cleaned.replace('**', '').replace('__', '')

    areas: List[str] = []
    matches = re.findall(
        r'(?:^|[\n\r•\-\*]|(?:Afecci[oó]n\s+(?:a|en)|Afectaci[oó]n\s+(?:a|en)|Impacto\s+en))\s*([A-Za-zÀ-ÿ\s/()]{2,40}?)\s*:\s*',
        cleaned,
        flags=re.I
    )
    for a in matches:
        a = a.strip()
        a = re.sub(r'^(?:Afecci[oó]n\s+(?:a|en)|Afectaci[oó]n\s+(?:a|en)|Impacto\s+en)\s+', '', a, flags=re.I).strip()
        if a and a.lower() not in ['negocio', 'impacto', 'clientes', 'general', 'servicio', 'servicios', 'nota'] and a not in areas:
            areas.append(a)

    if not areas:
        parts = [p.strip().rstrip('.') for p in re.split(r'[,;]\s*|\s+y\s+', cleaned) if p.strip()]
        cleaned_parts = []
        for p in parts:
            p_clean = re.sub(r'^(?:Afecci[oó]n\s+(?:a|en)|Afectaci[oó]n\s+(?:a|en)|Impacto\s+en)\s+', '', p, flags=re.I).strip()
            if p_clean and p_clean.lower() not in ['negocio', 'impacto'] and len(p_clean) < 40:
                cleaned_parts.append(p_clean)
        if cleaned_parts:
            areas = cleaned_parts

    return areas


def format_impact_content(impact_raw: str, business_impact_raw: str = "") -> Tuple[str, str]:
    """
    Formatea la sección de impacto para la presentación ejecutiva:
    - main_impact: Texto completo del impacto general (sin truncar).
    - business_summary: Referencia concisa de áreas afectadas (ej: 'Impacto en Negocio: Ventas, Provisión y Facturación.').
    """
    if not impact_raw:
        return ("Detalle de impacto no disponible.", "")

    # Retrocompatibilidad: si el impacto de negocio venía embebido dentro de impact_raw
    split_m = re.split(r'(?:###?\s*)?Impacto\s+(?:en|de)\s+Negocio\s*[:\n]?', impact_raw, flags=re.I)
    main_text = split_m[0].strip()
    embedded_biz = split_m[1].strip() if len(split_m) > 1 else ""

    main_clean = re.sub(r'^#{1,6}\s+.*$', '', main_text, flags=re.MULTILINE)
    main_lines = [l.strip() for l in main_clean.splitlines() if l.strip()]
    main_impact = " ".join(main_lines) if main_lines else (main_text or "Detalle de impacto no disponible.")

    biz_source = business_impact_raw if (business_impact_raw and business_impact_raw.strip() not in ["—", "-", "N/A"]) else embedded_biz
    areas = extract_business_areas(biz_source)

    business_summary = ""
    if areas:
        if len(areas) > 4:
            areas_str = ", ".join(areas[:3]) + ", etc."
        elif len(areas) > 1:
            areas_str = ", ".join(areas[:-1]) + " y " + areas[-1]
        else:
            areas_str = areas[0]
        business_summary = f"Impacto en Negocio: {areas_str}."

    return (main_impact, business_summary)


def _set_run_text_preserving_style(paragraph, text: str):
    """Establece texto en un párrafo preservando la tipografía, tamaño y color del primer run."""
    if not paragraph.runs:
        paragraph.text = text
        return

    first_run = paragraph.runs[0]
    font_name = first_run.font.name
    font_size = first_run.font.size
    bold = first_run.font.bold
    italic = first_run.font.italic
    color_rgb = None
    try:
        if first_run.font.color and first_run.font.color.type == 1:
            color_rgb = first_run.font.color.rgb
    except Exception:
        pass

    # Reemplazar texto
    paragraph.text = text
    if paragraph.runs:
        r = paragraph.runs[0]
        if font_name:
            r.font.name = font_name
        if font_size:
            r.font.size = font_size
        if bold is not None:
            r.font.bold = bold
        if italic is not None:
            r.font.italic = italic
        if color_rgb:
            r.font.color.rgb = color_rgb


def _set_cell_text(cell, text: str, font_size_pt: Optional[float] = None, bold: Optional[bool] = None):
    """Escribe texto en una celda de tabla preservando el estilo base del formato."""
    p = cell.text_frame.paragraphs[0] if cell.text_frame.paragraphs else cell.text_frame.add_paragraph()
    _set_run_text_preserving_style(p, text)
    if font_size_pt and p.runs:
        p.runs[0].font.size = Pt(font_size_pt)
    if bold is not None and p.runs:
        p.runs[0].font.bold = bold


class ExecutiveReportBuilder:
    """Construye y rellena la presentación ejecutiva .pptx a partir de datos estructurados."""

    def __init__(self, template_path: Optional[Path] = None):
        self.template_path = Path(template_path) if template_path else get_executive_template_path()

    def generate(self, data: ExecutiveIncidentData, output_path: Optional[Path] = None) -> ReportMetadata:
        """
        Carga la plantilla PowerPoint, rellena las diapositivas con los datos del postmortem
        y guarda el informe en la ruta especificada.
        """
        if not self.template_path.is_file():
            raise FileNotFoundError(f"Plantilla base PowerPoint no encontrada: {self.template_path}")

        prs = pptx.Presentation(str(self.template_path))

        # Título estándar reutilizado en todas las diapositivas
        title_text = f"RESUMEN EJECUTIVO INCIDENCIA- TT {data.incident_ref} - {data.title}"

        # 1. Rellenar Diapositiva 1 (Resumen, impacto, causa, solución y acciones)
        self._populate_slide_1(prs.slides[0], data, title_text)

        # 2. Rellenar Diapositivas 2 y 3+ (Cronología de eventos)
        self._populate_timeline_slides(prs, data.timeline_events, title_text)

        # Guardar archivo con tolerancia a bloqueos de Windows (PermissionError)
        dest_path = Path(output_path) if output_path else get_executive_report_path(data.incident_ref)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            prs.save(str(dest_path))
        except PermissionError:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            fallback_name = f"{dest_path.stem}_{timestamp}{dest_path.suffix}"
            dest_path = dest_path.parent / fallback_name
            prs.save(str(dest_path))
            print(f"[AVISO] El fichero estaba en uso por otra aplicación. Se guardó como: {dest_path.name}")

        size_bytes = dest_path.stat().st_size
        generated_at = datetime.now(timezone.utc).isoformat()

        return ReportMetadata(
            incident_ref=data.incident_ref,
            filename=dest_path.name,
            file_path=str(dest_path),
            generated_at=generated_at,
            size_bytes=size_bytes,
            slide_count=len(prs.slides),
        )

    def _populate_slide_1(self, slide, data: ExecutiveIncidentData, title_text: str):
        """Cumplimenta las formas de texto y la tabla de acciones en la primera diapositiva."""
        for shape in slide.shapes:
            # 1. Título principal
            if shape.shape_id == 4 or (shape.has_text_frame and "RESUMEN EJECUTIVO INCIDENCIA" in shape.text_frame.text):
                _set_run_text_preserving_style(shape.text_frame.paragraphs[0], title_text)

            # 2. Subtítulo (Inicio y Duración)
            elif shape.shape_id == 3 or (shape.has_text_frame and "Inicio:" in shape.text_frame.text):
                tf = shape.text_frame
                start_str = f"Inicio: {data.start_time or 'No especificado'}"
                dur_str = f"Duración: {data.duration or 'No especificada'}"
                if len(tf.paragraphs) >= 2:
                    _set_run_text_preserving_style(tf.paragraphs[0], start_str)
                    _set_run_text_preserving_style(tf.paragraphs[1], dur_str)
                    for extra_p in tf.paragraphs[2:]:
                        extra_p.text = ""
                else:
                    _set_run_text_preserving_style(tf.paragraphs[0], f"{start_str}\n{dur_str}")

            # Limpiar TextBox 11 si existe para evitar textos residuales
            elif shape.shape_id == 9 and shape.has_text_frame:
                shape.text_frame.clear()

            # 3. IMPACTO (shape_id 11 - CuadroTexto 10)
            elif shape.shape_id == 11:
                # Fijar coordenadas y dimensiones para evitar solapamientos con Causa y Solución
                shape.left = Inches(0.40)
                shape.top = Inches(0.91)
                shape.width = Inches(9.20)
                shape.height = Inches(0.58)

                tf = shape.text_frame
                tf.word_wrap = True
                tf.margin_left = Pt(2)
                tf.margin_right = Pt(2)
                tf.margin_top = Pt(1)
                tf.margin_bottom = Pt(1)
                tf.clear()

                main_impact, biz_summary = format_impact_content(data.impact_text, data.business_impact)

                total_chars = len(main_impact) + len(biz_summary)
                if total_chars > 360:
                    font_size = Pt(7.5)
                elif total_chars > 260:
                    font_size = Pt(8.0)
                else:
                    font_size = Pt(8.5)

                p1 = tf.paragraphs[0]
                p1.space_after = Pt(2) if biz_summary else Pt(0)
                p1.line_spacing = 1.05
                run1 = p1.add_run()
                run1.text = main_impact
                run1.font.size = font_size
                run1.font.bold = False

                if biz_summary:
                    p2 = tf.add_paragraph()
                    p2.space_after = Pt(0)
                    p2.line_spacing = 1.05
                    label_match = re.match(r'^(Impacto\s+en\s+Negocio\s*:\s*)(.*)', biz_summary, flags=re.I)
                    if label_match:
                        lbl_run = p2.add_run()
                        lbl_run.text = label_match.group(1)
                        lbl_run.font.size = font_size
                        lbl_run.font.bold = True

                        val_run = p2.add_run()
                        val_run.text = label_match.group(2)
                        val_run.font.size = font_size
                        val_run.font.bold = False
                    else:
                        r2 = p2.add_run()
                        r2.text = biz_summary
                        r2.font.size = font_size
                        r2.font.bold = False

            # 4. CAUSA (shape_id 22 - CuadroTexto 21)
            elif shape.shape_id == 22:
                shape.left = Inches(0.40)
                shape.top = Inches(1.95)
                shape.width = Inches(4.70)
                shape.height = Inches(1.25)

                tf = shape.text_frame
                tf.word_wrap = True
                tf.margin_left = Pt(2)
                tf.margin_right = Pt(2)
                tf.margin_top = Pt(1)
                tf.margin_bottom = Pt(1)
                tf.clear()

                txt = data.cause_text or "Detalle de causa raíz no disponible."
                font_size = Pt(7.5) if len(txt) > 300 else Pt(8.5)

                p = tf.paragraphs[0]
                p.space_after = Pt(2)
                p.line_spacing = 1.05
                run = p.add_run()
                run.text = txt
                run.font.size = font_size
                run.font.bold = False

            # 5. SOLUCION (shape_id 23 - CuadroTexto 22)
            elif shape.shape_id == 23:
                shape.left = Inches(5.25)
                shape.top = Inches(1.95)
                shape.width = Inches(4.45)
                shape.height = Inches(1.25)

                tf = shape.text_frame
                tf.word_wrap = True
                tf.margin_left = Pt(2)
                tf.margin_right = Pt(2)
                tf.margin_top = Pt(1)
                tf.margin_bottom = Pt(1)
                tf.clear()

                txt = data.solution_text or "Detalle de solución aplicada no disponible."
                font_size = Pt(7.5) if len(txt) > 300 else Pt(8.5)

                p = tf.paragraphs[0]
                p.space_after = Pt(2)
                p.line_spacing = 1.05
                run = p.add_run()
                run.text = txt
                run.font.size = font_size
                run.font.bold = False

            # 6. TABLA DE PUNTOS DE ACCION (4 columnas: Pain Point | Description | Owner | Forecast)
            elif shape.has_table and len(shape.table.columns) == 4:
                table = shape.table
                actions = data.action_points
                # Fila 0 es la cabecera. Filas de datos a partir de índice 1
                target_count = len(actions)

                # Ajustar cantidad de filas de la tabla si hay menos o más
                while len(table.rows) - 1 < target_count:
                    # Clonar la última fila existente
                    sample_tr = deepcopy(table.rows[len(table.rows) - 1]._tr)
                    table._tbl.append(sample_tr)

                while len(table.rows) - 1 > target_count and len(table.rows) > 2:
                    # Eliminar fila sobrante
                    last_tr = table.rows[len(table.rows) - 1]._tr
                    last_tr.getparent().remove(last_tr)

                # Si no hay acciones, dejamos 1 fila indicativa
                if not actions and len(table.rows) > 1:
                    _set_cell_text(table.rows[1].cells[0], "—")
                    _set_cell_text(table.rows[1].cells[1], "Sin puntos de acción registrados")
                    _set_cell_text(table.rows[1].cells[2], "—")
                    _set_cell_text(table.rows[1].cells[3], "—")
                else:
                    for i, ap in enumerate(actions):
                        r_idx = i + 1
                        if r_idx < len(table.rows):
                            _set_cell_text(table.rows[r_idx].cells[0], ap.pain_point or "Otros")
                            _set_cell_text(table.rows[r_idx].cells[1], ap.description or "")
                            _set_cell_text(table.rows[r_idx].cells[2], ap.owner or "—")
                            _set_cell_text(table.rows[r_idx].cells[3], ap.forecast or "—")

    def _populate_timeline_slides(self, prs, events: List[ExecutiveTimelineEvent], title_text: str):
        """
        Rellena las diapositivas de cronología (Slide 2 y Slide 3) distribuyendo los eventos.
        Si hay más de 37 eventos, clona diapositivas adicionales.
        """
        if len(prs.slides) < 2:
            return

        # Capacidad estimada por diapositiva: ~18 filas para slide 2, ~19 para slide 3
        # Repartición de eventos
        chunk_size = 18
        chunks: List[List[ExecutiveTimelineEvent]] = []
        if not events:
            chunks = [[]]
        else:
            for i in range(0, len(events), chunk_size):
                chunks.append(events[i:i + chunk_size])

        # Asegurar al menos 2 diapositivas de cronología si venían en la plantilla
        timeline_slides = [prs.slides[1]]
        if len(prs.slides) >= 3:
            timeline_slides.append(prs.slides[2])

        # Si hay más chunks que diapositivas disponibles, clonamos la última diapositiva
        while len(timeline_slides) < len(chunks):
            # Clonar la última diapositiva
            slide_layout = prs.slide_layouts[6] if len(prs.slide_layouts) > 6 else prs.slide_layouts[0]
            new_slide = prs.slides.add_slide(slide_layout)
            # Copiar formas de la diapositiva de referencia
            ref_slide = timeline_slides[-1]
            for shape in ref_slide.shapes:
                if shape.has_table:
                    # Copiar tabla
                    t = shape.table
                    rows = len(t.rows)
                    cols = len(t.columns)
                    new_table_shape = new_slide.shapes.add_table(rows, cols, shape.left, shape.top, shape.width, shape.height)
                    for r_idx in range(rows):
                        for c_idx in range(cols):
                            new_table_shape.table.cell(r_idx, c_idx).text = t.cell(r_idx, c_idx).text
                elif shape.has_text_frame:
                    new_tx = new_slide.shapes.add_textbox(shape.left, shape.top, shape.width, shape.height)
                    new_tx.text_frame.text = shape.text_frame.text
            timeline_slides.append(new_slide)

        # Rellenar cada diapositiva con su respectivo chunk de eventos
        for idx, slide in enumerate(timeline_slides):
            # Actualizar título
            for shape in slide.shapes:
                if shape.shape_id == 4 or (shape.has_text_frame and "RESUMEN EJECUTIVO INCIDENCIA" in shape.text_frame.text):
                    _set_run_text_preserving_style(shape.text_frame.paragraphs[0], title_text)

            chunk = chunks[idx] if idx < len(chunks) else []

            # Encontrar tabla de cronología (2 columnas: Hora | Evento)
            for shape in slide.shapes:
                if shape.has_table and len(shape.table.columns) == 2:
                    table = shape.table
                    # Fila 0 es cabecera ("Hora", "Evento")
                    target_rows = max(len(chunk), 1)

                    # Ajustar número de filas
                    while len(table.rows) - 1 < target_rows:
                        sample_tr = deepcopy(table.rows[len(table.rows) - 1]._tr)
                        table._tbl.append(sample_tr)

                    while len(table.rows) - 1 > target_rows and len(table.rows) > 2:
                        last_tr = table.rows[len(table.rows) - 1]._tr
                        last_tr.getparent().remove(last_tr)

                    if not chunk:
                        if len(table.rows) > 1:
                            _set_cell_text(table.rows[1].cells[0], "—")
                            _set_cell_text(table.rows[1].cells[1], "Sin eventos cronológicos registrados")
                    else:
                        for e_idx, event in enumerate(chunk):
                            r_idx = e_idx + 1
                            if r_idx < len(table.rows):
                                _set_cell_text(table.rows[r_idx].cells[0], event.time or "")
                                _set_cell_text(table.rows[r_idx].cells[1], event.event or "")
