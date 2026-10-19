#!/usr/bin/env python3
"""Import incidents from the old manual-format PPTX (pre-dating this app)
into a JSON payload matching POST /api/reports.

The old deck has no per-incident type information this app tracks
(severity, brands, ministry/platform/external-origin flags, action points) -- those are
always defaulted and MUST be reviewed by hand after import. Everything
else (title, date, duration, ticket(s), the Impacto/Causa/Solución text,
and the metrics lines) is reconstructed from each shape's position on the
slide, since the shapes themselves have no meaningful names (see
dump_pptx_shapes.py, used to reverse-engineer this layout).

Usage:
  python import_pptx.py archivo.pptx -o salida.json
  python import_pptx.py archivo.pptx -o salida.json --year 2026 --week 28 --range "06-12 julio 2026" --dept "Customer & Service Operations"
  python import_pptx.py archivo.pptx --post-url http://localhost:8000   # crea el informe directamente via la API

If --year/--week aren't given, they're parsed from the filename
(pattern "2026W28"). --range defaults to the min-max dates found in the
incidents themselves if omitted.
"""
import argparse
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

try:
    from pptx import Presentation
except ImportError:
    Presentation = None

# Windows consoles default to cp1252, which can't encode the emoji/accented
# characters this script prints -- force UTF-8 regardless of the terminal.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

# Real ticket codes (e.g. "2607C80395", "OPIT-964411", "RED-460322") always
# contain a digit; the column label words below are pure alphabetic and
# would otherwise false-match a plain [A-Za-z0-9\-_]{5,}.
TICKET_RE = re.compile(r"(?=.*\d)[A-Za-z0-9\-_]{5,}")

# Column/field label textboxes -- excluded wherever we're looking for a
# *value* near a label's coordinates.
LABEL_WORDS = (
    "impacto",
    "causa",
    "solución",
    "solucion",
    "solution",
    "id",
    "fecha",
    "duración",
    "duracion",
)


def is_label(text):
    return (text or "").strip().lower() in LABEL_WORDS


def slide_group(title_text):
    """Map the slide's header text to this app's `group` field.
    Falls back to a literal "RED <lo que ponga>" so nothing gets silently
    dropped, but flags it since it's not one of the known conventions."""
    t = title_text.replace("Incidencias RED", "").strip(" ()")
    tl = t.lower()
    if "it mm" in tl:
        return "IT MM", True
    if "it" in tl:
        return "IT OSP/JZZ", True
    if "5000" in tl or "5.000" in tl:
        return "RED >5.000 clientes", True
    if "relevantes" in tl or "climatolog" in tl or "escalados" in tl or "otras" in tl:
        return "Otras RED", True
    if "b2b" in tl:
        return "RED B2B", True
    return f"RED ({t})" if t else "Otras RED", False


def emu_in(v):
    from pptx.util import Emu
    return round(Emu(v).inches, 2) if v is not None else None


def collect_textboxes(shapes, out):
    """Recursively collect (x, y, text) for every text-bearing shape.

    Deliberately does NOT accumulate parent-group offsets: a PPTX group's
    children are positioned in the group's own child coordinate space
    (chOff/chExt), which maps to the group's outer bounding box via an
    affine transform (offset *and* scale) -- naively adding the parent's
    left/top at each nesting level double-counts that and produces
    nonsense coordinates. What we actually need is simpler: every
    incident group on this deck repeats the *same* internal template, so
    each field's raw (non-accumulated) shape.left/top is consistent
    incident to incident (e.g. the title textbox is always at local
    x=0.53, y=0.84) -- confirmed against dump_pptx_shapes.py's output.
    That local consistency is all the classification below relies on."""
    for shape in shapes:
        x = emu_in(shape.left) or 0
        y = emu_in(shape.top) or 0
        if shape.shape_type == 6:  # GROUP
            collect_textboxes(shape.shapes, out)
        elif shape.has_text_frame:
            text = shape.text_frame.text.strip()
            if text:
                out.append((x, y, text))


def nearest(items, target_x, tolerance=0.6):
    best = None
    best_dist = tolerance
    for x, y, text in items:
        d = abs(x - target_x)
        if d < best_dist:
            best_dist = d
            best = text
    return best


def is_metric_line(line, group):
    line = line.strip()
    if not line:
        return False

    # In IT MM, the text in column 1 is always descriptive impact
    if group == "IT MM":
        return False

    # Check for Label: Value pattern (e.g. Clientes de FTTH: 37,3K, TTs MM/KRT: 15)
    if ":" in line:
        label, _, val = line.partition(":")
        label_lower = label.strip().lower()
        val = val.strip()

        metric_labels = ("tts", "llamadas", "consultas", "clientes", "ftth", "móvil", "movil", "órdenes", "ordenes", "sedes", "líneas", "lineas")
        if any(ml in label_lower for ml in metric_labels):
            return True

        if re.search(r"\d", val) and len(val.split()) <= 6:
            return True

    # Starts with percentage (e.g. "50% de las llamadas...")
    if re.match(r"^\d+([.,]\d+)?\s*%", line):
        return True

    # Starts with quantity / KPI count (e.g. "18 SFID", "560 cuentas", "6,4K clientes", "63GB", "110K sesiones")
    if re.match(r"^\d+([.,]\d+)?\s*([kKmMbB]|GB|MB|TB|SFID|cuentas|líneas|lineas|sesiones|errores|clientes|nodos|órdenes|ordenes)\b", line, re.IGNORECASE):
        return True

    # Common operational metric phrases in RED
    lower = line.lower()
    metric_phrases = [
        "clientes de ftth", "clientes de móvil", "clientes de movil", "clientes atachados",
        "desviación dd", "desviacion dd", "sin servicio tv multicast",
        "tts mm", "tts osp", "tts krt", "llamadas/consultas", "llamadas menos",
        "tráfico perdido", "trafico perdido", "errores diameter",
    ]
    if any(lower.startswith(k) or k in lower for k in metric_phrases):
        return True

    return False


def split_impacto(impacto_text, group):
    """Splits text from column 1 under 'Impacto' into narrative impact and KPI metrics.
    For IT MM, all text describes operational impact.
    For IT OSP/JZZ and RED, separates quantitative metric lines from descriptive paragraphs."""
    if not impacto_text:
        return "", ""

    if group == "IT MM":
        return impacto_text.strip(), ""

    lines = [l.strip() for l in impacto_text.split("\n") if l.strip()]
    metric_lines = []
    impact_lines = []

    for l in lines:
        if is_metric_line(l, group):
            if ":" in l:
                lbl, _, v = l.partition(":")
                metric_lines.append(f"{lbl.strip()} | {v.strip()}")
            else:
                metric_lines.append(l)
        else:
            impact_lines.append(l)

    return "\n".join(impact_lines), "\n".join(metric_lines)


def metrics_to_pipe_format(text):
    """'Clientes de FTTH: 94K' -> 'Clientes de FTTH | 94K', one per line
    (matches this app's metricsArr() "label | value" convention)."""
    lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        if ":" in line:
            label, _, value = line.partition(":")
            lines.append(f"{label.strip()} | {value.strip()}")
        else:
            lines.append(line)
    return "\n".join(lines)


def extract_numbers(metrics_text):
    """Best-effort cFTTH/cMobile extraction from the metrics text -- the
    old deck's phrasing isn't consistent enough to guarantee this, treat
    it as a hint to verify, not ground truth."""
    cFTTH = cMobile = ""
    m = re.search(r"FTTH[^0-9]*?([\d.,]+)\s*[kK]", metrics_text)
    if m:
        cFTTH = m.group(1).replace(".", "").replace(",", ".")
    m = re.search(r"([\d.,]+)\s*[kK]\s*clientes?\s*de\s*m[oó]vil", metrics_text, re.IGNORECASE)
    if m:
        cMobile = m.group(1).replace(".", "").replace(",", ".")
    return cFTTH, cMobile


def infer_category(title, group_label):
    """Infiere la categoría a partir del título:
    - En IT: 'Indisponibilidad' o 'Degradación' según corresponda.
    - En RED: 'Pérdida de servicio FTTH y móvil', 'Pérdida de servicio móvil' o 'Pérdida de servicio FTTH'.
    Si no coincide con ninguna, devuelve cadena vacía."""
    t = title or ""
    if "IT" in (group_label or "").upper():
        if re.search(r"indisponib", t, re.IGNORECASE):
            return "Indisponibilidad"
        if re.search(r"degradac", t, re.IGNORECASE):
            return "Degradación"
        return ""

    if re.search(r"p[eé]rdida\s+de\s+servicio\s+(?:ftth\s+y\s+m[oó]vil|m[oó]vil\s+y\s+ftth)", t, re.IGNORECASE):
        return "Pérdida de servicio FTTH y móvil"
    if re.search(r"p[eé]rdida\s+de\s+servicio\s+m[oó]vil", t, re.IGNORECASE):
        return "Pérdida de servicio móvil"
    if re.search(r"p[eé]rdida\s+de\s+servicio\s+ftth", t, re.IGNORECASE):
        return "Pérdida de servicio FTTH"
    return ""


def parse_incident_group(group_shape, group_label):
    items = []
    collect_textboxes([group_shape], items)

    # Extract tokens that look like tickets (letters+digits/hyphens, split by
    # newline or slash) within the ID horizontal band.
    ticket_candidates = []
    other_items = []
    for x, y, text in items:
        tokens = [tok.strip() for tok in re.split(r"[\n/]", text) if tok.strip()]
        if 4.0 < x < 8.0 and tokens and all(TICKET_RE.fullmatch(tok) for tok in tokens) and not is_label(text):
            ticket_candidates.extend(tokens)
        else:
            other_items.append((x, y, text))

    non_labels = [(x, y, t) for x, y, t in other_items if not is_label(t)]

    # Column 1 items (Title & Impacto) are at x < 2.5
    col1 = [(x, y, t) for x, y, t in non_labels if x < 2.5]
    col1.sort(key=lambda it: it[1])  # sort top-to-bottom by y
    if len(col1) >= 2:
        title = col1[0][2]
        impacto = "\n".join(t for _, _, t in col1[1:])
    elif len(col1) == 1:
        if col1[0][1] < 2.0:
            title = col1[0][2]
            impacto = ""
        else:
            title = ""
            impacto = col1[0][2]
    else:
        title = ""
        impacto = ""

    # Fecha: look for date pattern (DD/MM/YYYY) or coordinate band 8.0 < x < 10.5, y < 2.5
    fecha_item = next(
        ((x, y, t) for x, y, t in non_labels if 8.0 < x < 10.5 and y < 2.5 and re.search(r"\d{2}/\d{2}/\d{4}", t)),
        None,
    )
    if not fecha_item:
        fecha_item = next(((x, y, t) for x, y, t in non_labels if 8.5 <= x <= 10.2 and y < 2.5), None)
    fecha = fecha_item[2].strip() if fecha_item else ""

    # Duracion: x > 10.0 and y < 2.5
    duracion_item = next(((x, y, t) for x, y, t in non_labels if x > 10.0 and y < 2.5), None)
    duracion = duracion_item[2].strip() if duracion_item else ""

    # Causa: column 2 (2.5 <= x < 6.5)
    causa_items = [t for x, y, t in non_labels if 2.5 <= x < 6.5]
    causa = "\n".join(causa_items).strip()

    # Solución: column 3 (6.5 <= x < 9.5), excluding consumed header items
    consumed_items = set()
    if fecha_item:
        consumed_items.add(fecha_item)
    if duracion_item:
        consumed_items.add(duracion_item)

    solucion_items = [t for it in non_labels if 6.5 <= it[0] < 9.5 and it not in consumed_items for t in [it[2]]]
    solucion_raw = "\n".join(solucion_items).strip()
    solucion = solucion_raw
    action_points = ""
    if solucion:
        ap_match = re.search(r"(?i)\n?\s*(?:action\s*points?|puntos?\s+de\s+acci[oó]n)\s*:\s*\n?(.*)", solucion, re.DOTALL)
        if ap_match:
            action_points_raw = ap_match.group(1).strip()
            solucion = solucion[:ap_match.start()].strip()
            ap_lines = []
            for l in action_points_raw.split("\n"):
                l_clean = re.sub(r"^[•\-\*]\s*", "", l).strip()
                if l_clean:
                    ap_lines.append(l_clean)
            action_points = "\n".join(ap_lines)

    impact_text, metrics_text = split_impacto(impacto or "", group_label)
    cFTTH, cMobile = extract_numbers(impacto or "")

    flags = []
    combined_lower = " ".join(filter(None, [title, causa, solucion, duracion])).lower()
    if "xxxx" in combined_lower or (duracion or "").strip() in ("", "h m"):
        flags.append("datos incompletos (placeholder xxxx/vacío) en el PPT original")

    if "IT" in (group_label or "").upper():
        severity = "SL1" if re.search(r"indisponib", title or "", re.IGNORECASE) else "SL2"
    else:
        # RED: solo Emergencia o Critica (por defecto), nunca SL1 ni SL2
        combined_text = " ".join(filter(None, [title, impacto, causa]))
        severity = "EMERGENCIA" if re.search(r"emergenc", combined_text, re.IGNORECASE) else "CRITICA"

    category = infer_category(title, group_label)

    return {
        "group": group_label,
        "severity": severity,
        "category": category,
        "system": "",
        "title": title or "",
        "ticket": " / ".join(ticket_candidates),
        "date": fecha or "",
        "duration": duracion or "",
        "impact": impact_text,
        "metrics": metrics_text,
        "cause": causa or "",
        "solution": solucion,
        "actionPoints": action_points,
        "cFTTH": cFTTH,
        "cMobile": cMobile,
        "brands": "",
        "ministry": False,
        "platform": False,
        "externalOrigin": False,
        "featured": False,
        "_flags": flags,
    }


def find_incident_groups(slide_shapes):
    """Top-level incident groups are direct children of the slide (not
    nested inside another group) whose text, once flattened, contains a
    ticket-shaped line -- this is more robust than assuming a fixed
    shape count, since some incidents have 1 ticket and some have 2."""
    groups = []
    for shape in slide_shapes:
        if shape.shape_type != 6:
            continue
        items = []
        collect_textboxes([shape], items)
        has_ticket = any(
            any(TICKET_RE.fullmatch(tok.strip()) for tok in re.split(r"[\n/]", t) if tok.strip())
            for x, y, t in items if not is_label(t) and x < 10.0
        )
        if has_ticket:
            groups.append(shape)
    return groups


def parse_pptx(path):
    prs = Presentation(path)
    incidents = []
    warnings = []
    for slide_idx, slide in enumerate(prs.slides, 1):
        incident_grps = find_incident_groups(slide.shapes)
        if not incident_grps:
            continue

        title_shape = next((s for s in slide.shapes if s.has_text_frame and s.text_frame.text.strip()), None)
        title_text = title_shape.text_frame.text.strip() if title_shape else ""
        group_label, known = slide_group(title_text)
        if not known:
            warnings.append(f"Slide {slide_idx}: grupo '{group_label}' no es una convención existente en la app, revisar.")

        for grp in incident_grps:
            inc = parse_incident_group(grp, group_label)
            flags = inc.pop("_flags")
            if not inc["title"]:
                warnings.append(f"Slide {slide_idx}: no se pudo extraer el título de una incidencia (ticket={inc['ticket']!r}).")
            for f in flags:
                warnings.append(f"Slide {slide_idx} / {inc['ticket'] or inc['title'][:40]}: {f}")
            incidents.append(inc)

    return incidents, warnings


def infer_year_week(path, year, week):
    if year and week:
        return year, week
    filename = Path(path).name
    m = re.search(r"(\d{4})[_\-\s]?[wW](\d{1,2})", filename)
    if m:
        return year or int(m.group(1)), week or int(m.group(2))
    return year, week


def infer_range(incidents):
    dates = []
    for inc in incidents:
        m = re.match(r"(\d{2})/(\d{2})/(\d{4})", inc["date"])
        if m:
            dates.append((m.group(3), m.group(2), m.group(1)))  # y, m, d for sorting
    if not dates:
        return ""
    dates.sort()
    d0, d1 = dates[0], dates[-1]
    months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    m0, m1 = int(d0[1]) - 1, int(d1[1]) - 1
    if m0 == m1 and d0[0] == d1[0]:
        return f"{d0[2]} – {d1[2]} {months[m1]} {d1[0]}"
    elif d0[0] == d1[0]:
        return f"{d0[2]} {months[m0]} – {d1[2]} {months[m1]} {d1[0]}"
    else:
        return f"{d0[2]} {months[m0]} {d0[0]} – {d1[2]} {months[m1]} {d1[0]}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pptx")
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--week", type=int, default=None)
    ap.add_argument("--range", dest="range_", default=None)
    ap.add_argument("--dept", default="Customer & Service Operations")
    ap.add_argument("-o", "--output", default=None)
    ap.add_argument("--post-url", default=None, help="e.g. http://localhost:8000 -- POSTs the report directly instead of/as well as writing JSON")
    args = ap.parse_args()

    if Presentation is None:
        print(
            "ERROR: La librería 'python-pptx' no está instalada.\n"
            "Instálala con:\n"
            "  pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org python-pptx",
            file=sys.stderr,
        )
        sys.exit(1)

    pptx_path = Path(args.pptx)
    if not pptx_path.is_file():
        print(f"ERROR: El archivo PPTX '{pptx_path}' no existe o no es un fichero válido.", file=sys.stderr)
        sys.exit(1)

    incidents, warnings = parse_pptx(str(pptx_path))
    year, week = infer_year_week(args.pptx, args.year, args.week)
    if not year or not week:
        print("ERROR: no se pudo inferir year/week del nombre de fichero, pásalos con --year/--week", file=sys.stderr)
        sys.exit(1)

    report = {
        "year": year,
        "week": week,
        "range": args.range_ or infer_range(incidents),
        "dept": args.dept,
        "incidents": incidents,
        "status": "draft",
    }

    print(f"Extraídas {len(incidents)} incidencias de {args.pptx}")
    print(f"year={year} week={week} range={report['range']!r} dept={report['dept']!r}\n")

    if warnings:
        print(f"⚠️  {len(warnings)} avisos -- revisar a mano tras importar:")
        for w in warnings:
            print(f"  - {w}")
        print()
    missing_fields = ["severity (IT: SL1 en indisponibilidad / resto SL2; RED: Emergencia / Critica por defecto)", "brands (vacío)", "ministry/platform/externalOrigin (False)"]
    if not any(i.get("actionPoints") for i in incidents):
        missing_fields.append("actionPoints (vacío)")
    if any(i.get("category") for i in incidents):
        missing_fields.append("category (inferida según título / vacía en resto)")
    else:
        missing_fields.append("category (vacío)")
    missing_fields.append("system (vacío, todo va en 'title')")
    print("Campos que este PPT no registraba o quedaron con valor por defecto:")
    print("  - " + ", ".join(missing_fields))
    print()

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"JSON escrito en {args.output}")

    if args.post_url:
        data = json.dumps(report).encode("utf-8")
        target_url = args.post_url.rstrip("/")
        req = urllib.request.Request(
            f"{target_url}/api/reports", data=data,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        handlers = []
        if any(h in target_url for h in ("localhost", "127.0.0.1", "::1")):
            handlers.append(urllib.request.ProxyHandler({}))
        opener = urllib.request.build_opener(*handlers)
        try:
            with opener.open(req, timeout=30) as resp:
                print(f"POST {target_url}/api/reports -> {resp.status}")
                print(resp.read().decode("utf-8")[:500])
        except urllib.error.HTTPError as e:
            print(f"POST falló con error HTTP {e.code}: {e.read().decode('utf-8')}", file=sys.stderr)
            sys.exit(1)
        except urllib.error.URLError as e:
            print(f"POST falló: no se pudo conectar al backend ({target_url}): {e.reason}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
