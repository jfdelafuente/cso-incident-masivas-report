// Shared incident/report rendering helpers.
//
// app.js (editor) and home.js (dashboard) each need to parse the same
// delimited incident fields and build the same PPTX deck -- one from
// in-memory editor state, the other from a fetched report. Load this
// script before app.js/home.js in every page that needs it, and pull
// what you need off `window.ReportRender`.
//
// Wrapped in an IIFE so these internal names (sev, num, metricsArr...)
// don't leak into the shared global scope that all non-module <script>
// tags on the page have to coexist in -- app.js already shadows them
// safely inside its own IIFE, but home.js's top-level `const { sev, ... }
// = window.ReportRender` collided with a same-named global here and
// threw "Identifier 'sev' has already been declared" in production.
(function () {
  "use strict";

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

const SEV = {
  SL1: { color: '#D43A2F', label: 'SL1 · Crítica' },
  SL2: { color: '#FF7900', label: 'SL2 · Alta' },
  SL3: { color: '#E6A100', label: 'SL3 · Media' },
  EMERGENCIA: { color: '#D43A2F', label: 'Emergencia' },
  CRITICA: { color: '#FF7900', label: 'Crítica' },
};
function sev(k) { return SEV[k] || SEV.SL2; }

function areaOf(group) { return /^(RED|Otras)/.test(group || '') ? 'RED' : 'IT'; }

// Which severity values are selectable depends on the incident's group: IT
// keeps the existing SL1/SL2/SL3 scale, RED groups only allow "Emergencia"/
// "Crítica" -- a single source of truth for the group->severity form dropdown
// in app.js and for any code that needs to pick a default/valid severity.
const SEVERITY_KEYS_BY_AREA = { IT: ['SL1', 'SL2', 'SL3'], RED: ['EMERGENCIA', 'CRITICA'] };
function severityOptions(group) {
  return SEVERITY_KEYS_BY_AREA[areaOf(group)].map(k => [k, SEV[k].label]);
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Incident `date` values are "DD/MM/YYYY[ H:MM]" -- parses date and (if
// present) time into one Date, so callers needing only the day (the
// weekday chart) and callers needing full chronological order (sorting)
// share one parser. Returns null for anything that doesn't match
// (empty/placeholder values from a bad import) so those quietly sink to
// the end / get excluded rather than skewing results.
function parseIncidentDate(s) {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  return isNaN(d.getTime()) ? null : d;
}

// Incident counts by weekday (Lun-Dom), split IT/RED, for the "incidencias
// por día de la semana" chart shared by the HTML preview, PPTX and PDF.
function weekdayBreakdown(incidents) {
  const inc = incidents || [];
  return WEEKDAY_LABELS.map((label, idx) => {
    const jsDay = (idx + 1) % 7; // Date#getDay(): 0=Sun..6=Sat, Mon-first here
    const day = inc.filter(i => { const d = parseIncidentDate(i.date); return d && d.getDay() === jsDay; });
    const it = day.filter(i => areaOf(i.group) === 'IT').length;
    return { label, it, red: day.length - it };
  });
}

// Matches the Grupo <select>'s option order in app.js (IT first, then RED
// by relevance) -- incidents are displayed/exported in this group order,
// not alphabetically, since that's the order the app already treats as
// the logical one everywhere else (dropdown, group() classification).
const GROUP_ORDER = [
  'IT OSP/JZZ',
  'IT MM',
  'RED >5.000 clientes',
  'RED - Relevantes por duración/Climatología/Escalados RRII',
  'RED - Impacto B2B',
  'Otras RED',
];

// Sort key: group (per GROUP_ORDER; unrecognized groups sink after known
// ones, alphabetically among themselves) then date/time ascending
// (unparsable/empty dates sink to the end within their group). Exposed as
// a standalone comparator (not just a sort-and-return helper) so the
// editor's sidebar list can sort *indexes* into state.incidents rather
// than the array itself -- it needs the original index preserved for
// data-i/data-row so editing/removing a row still targets the right
// incident after the display order changes.
function compareIncidents(a, b) {
  const rank = (g) => { const i = GROUP_ORDER.indexOf(g); return i === -1 ? GROUP_ORDER.length : i; };
  const ra = rank(a.group), rb = rank(b.group);
  if (ra !== rb) return ra - rb;
  if (a.group !== b.group) return a.group < b.group ? -1 : 1;
  const da = parseIncidentDate(a.date), db = parseIncidentDate(b.date);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da - db;
}

// Convenience wrapper for callers that just want a sorted copy (exports,
// the read-only web preview) rather than index tracking.
function sortIncidents(incidents) {
  return (incidents || []).slice().sort(compareIncidents);
}

// Groups incidents that share the same Grupo+Severidad+Categoría onto a
// single slide (up to 3 per slide) instead of one slide per incident.
// Returns an array of "slide groups" (arrays of 1-3 incidents) covering
// every input incident exactly once, in the same relative order as
// sortIncidents() -- a grouped slide ends up at the position of its
// earliest (first-encountered) member.
//
// Category is blank/missing => never groups, not even with another blank
// one (an empty field isn't a real shared classification, just two
// incidents that didn't fill it in) -- each such incident always gets its
// own group of 1. Overflow (>3 incidents sharing a key) is handled by this
// same single pass: the first 3 encountered form one group, and whatever
// is left over (not yet consumed) starts its own group of up to 3 the next
// time the loop reaches an unconsumed member with that key -- no second
// pass or separate re-bucketing step needed.
// Only SL2 (IT's "Alta" tier) and CRITICA (RED's "Crítica" tier) are
// groupable severities (FR-009) -- the more extreme severity on each
// area's scale (SL1/SL3 for IT, EMERGENCIA for RED) always keeps its own
// slide, even if it would otherwise match another incident's Grupo and
// Categoría.
const GROUPABLE_SEVERITIES = { SL2: true, CRITICA: true };
function groupKey(i) {
  if (!GROUPABLE_SEVERITIES[i.severity]) return null;
  const cat = String(i.category || '').trim().toLowerCase();
  return cat ? (i.group + '|' + i.severity + '|' + cat) : null;
}
function groupIncidentsForSlides(incidents) {
  const sorted = sortIncidents(incidents);
  const counts = {};
  sorted.forEach(i => { const k = groupKey(i); if (k) counts[k] = (counts[k] || 0) + 1; });
  const consumed = new Array(sorted.length).fill(false);
  const groups = [];
  sorted.forEach((inc, idx) => {
    if (consumed[idx]) return;
    const k = groupKey(inc);
    consumed[idx] = true;
    if (!k || counts[k] < 2) { groups.push([inc]); return; }
    const bucket = [inc];
    for (let j = idx + 1; j < sorted.length && bucket.length < 3; j++) {
      if (consumed[j] || groupKey(sorted[j]) !== k) continue;
      bucket.push(sorted[j]);
      consumed[j] = true;
    }
    groups.push(bucket);
  });
  return groups;
}

function parseDurMin(s) {
  s = String(s || '');
  const h = (s.match(/(\d+)\s*h/) || [0, 0])[1];
  const m = (s.match(/(\d+)\s*m/) || [0, 0])[1];
  return (+h) * 60 + (+m);
}
function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return h + 'h ' + m + 'min';
  if (h) return h + 'h';
  return m + 'min';
}
function fmtK(v) {
  if (!v) return '0';
  const s = (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return s.replace('.', ',') + 'K';
}
function num(v) { return parseFloat(String(v == null ? '' : v).replace(',', '.')) || 0; }

function metricsArr(s) {
  return String(s || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const p = l.split('|');
    return p.length > 1 ? { label: p[0].trim(), value: p.slice(1).join('|').trim() } : { label: '', value: l };
  });
}
function actionPointsArr(s) {
  return String(s || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const p = l.split('|');
    return p.length > 2
      ? { ap: p[0].trim(), tipo: p[1].trim(), desc: p.slice(2).join('|').trim() }
      : { ap: '', tipo: '', desc: l };
  });
}

const BRAND_LOGOS_PPTX = [['orange', 1.0], ['yoigo', 2.58], ['jazztel', 3.21], ['masmovil', 4.56], ['pepephone', 4.43], ['simyo', 2.66], ['llamaya', 3.01], ['lebara', 3.47], ['euskaltel', 3.77], ['r', 0.94], ['telecable', 2.21], ['guuk', 2.13], ['embou', 2.99], ['populoos', 3.35]];

// Aggregate stats for the "semana en cifras" executive summary. Uses
// areaOf() (regex on the group name) for the IT/RED split -- the two
// duplicate copies this replaces disagreed on this (one used areaOf(),
// the other a looser `.includes('IT')` check that isn't equivalent for
// every group name), which is exactly the kind of drift a single
// shared implementation removes.
function computeStats(incidents) {
  const inc = incidents || [];
  const count = inc.length;
  const itCount = inc.filter(i => areaOf(i.group) === 'IT').length;
  const redCount = count - itCount;
  // SL1/Emergencia and SL2/Crítica are the same severity tier under IT's
  // and RED's respective scales (see SEVERITY_KEYS_BY_AREA) -- the
  // executive summary reports each pair as a single combined row rather
  // than splitting by scale. SL3 has no RED equivalent, so it stays alone.
  const emergencia = inc.filter(i => i.severity === 'SL1' || i.severity === 'EMERGENCIA').length;
  const critica = inc.filter(i => i.severity === 'SL2' || i.severity === 'CRITICA').length;
  const sl3 = inc.filter(i => i.severity === 'SL3').length;
  const totalMin = inc.reduce((a, i) => a + parseDurMin(i.duration), 0);
  const ftth = inc.reduce((a, i) => a + num(i.cFTTH), 0);
  const mob = inc.reduce((a, i) => a + num(i.cMobile), 0);
  const ministryCount = inc.filter(i => i.ministry).length;
  const platformCount = inc.filter(i => i.platform).length;
  const externalOriginCount = inc.filter(i => i.externalOrigin).length;
  return { count, itCount, redCount, emergencia, critica, sl3, ministryCount, platformCount, externalOriginCount, totalDuration: fmtDur(totalMin), totalFTTH: fmtK(ftth), totalMobile: fmtK(mob) };
}

// Shared truncation for the "incidencias destacadas" section: caps text at
// a fixed length rather than relying on each surface's own overflow/wrap
// behavior (PptxGenJS auto-wrap, CSS text-overflow, print layout...), so a
// very long title/cause can never overflow the fixed-size card in any of
// the three formats, and all three truncate at the exact same point.
function truncateText(str, n) {
  const s = String(str || '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Picks the single most notable incident of an area (IT|RED) for the
// executive summary's "incidencias destacadas" section: highest severity
// within that area's own scale (index into SEVERITY_KEYS_BY_AREA -- lower
// index = more severe), tie-broken by longest duration, and finally by
// order of appearance so the result is 100% deterministic (same input
// order always yields the same pick, across formats and re-generations).
// Returns null when the area has no incidents that week.
//
// Manual override: if any incident in the area is flagged `featured`, the
// automatic severity/duration ranking is disabled and the pick is made
// only among the featured ones (falling back to the same tie-break rule
// if more than one incident was marked, so the result stays deterministic
// either way) -- this lets a report author pin a specific incident instead
// of whichever one the algorithm would otherwise choose.
function highlightIncident(incidents, area) {
  const candidates = (incidents || []).filter(i => areaOf(i.group) === area);
  if (!candidates.length) return null;
  const featured = candidates.filter(i => i.featured);
  const pool = featured.length ? featured : candidates;
  const rank = (i) => { const r = SEVERITY_KEYS_BY_AREA[area].indexOf(i.severity); return r === -1 ? Infinity : r; };
  let best = pool[0];
  for (let idx = 1; idx < pool.length; idx++) {
    const c = pool[idx];
    const rc = rank(c), rb = rank(best);
    if (rc < rb || (rc === rb && parseDurMin(c.duration) > parseDurMin(best.duration))) best = c;
  }
  return best;
}

// Builds the cover + executive-summary + per-incident slides onto an
// already-created PptxGenJS presentation (layout/writeFile/filename
// stay with the caller, since those differ between the editor and the
// dashboard's "download without opening it" button).
function buildPptxDeck(P, meta, incidents) {
  const ORANGE = 'FF7900', BLACK = '000000', WHITE = 'FFFFFF', GREY = '8A857C', INK = '0C0B09', LINE = 'DEDAD3', MUT = '5C5852';
  const m = meta;
  const inc = sortIncidents(incidents);
  const v = computeStats(inc);

  let s = P.addSlide(); s.background = { color: BLACK };
  try {
    s.addImage({ path: 'assets/orange-logo.png', x: 0.5, y: 0.45, w: 0.65, h: 0.65 });
  } catch (e) {
    try {
      s.addImage({ path: 'assets/orange-logo.svg', x: 0.5, y: 0.45, w: 0.65, h: 0.65 });
    } catch (e2) {
      try {
        s.addImage({ path: 'assets/brands/orange.png', x: 0.5, y: 0.45, w: 0.65, h: 0.65 });
      } catch (e3) {}
    }
  }
  s.addText(m.dept, { x: 8.3, y: 0.55, w: 4.5, h: 0.4, align: 'right', color: 'B8B2A9', fontSize: 13, fontFace: 'Arial' });
  s.addText((m.year + ' · SEMANA ' + m.week).toUpperCase(), { x: 0.5, y: 3.7, w: 10, h: 0.4, color: ORANGE, fontSize: 16, bold: true, charSpacing: 3, fontFace: 'Arial' });
  s.addText([{ text: 'Reporte de incidencias ', options: { color: WHITE } }, { text: 'IT + RED', options: { color: ORANGE } }], { x: 0.48, y: 3.95, w: 11, h: 1.5, fontSize: 54, bold: true, fontFace: 'Arial', lineSpacingMultiple: 0.95 });
  s.addText(m.range, { x: 0.5, y: 5.72, w: 7, h: 0.4, color: GREY, fontSize: 14, fontFace: 'Arial' });
  const Hin = 0.25, gap = 0.16, maxW = 13.0, vgap = 0.18, padV = 0.2;
  let lrows = [[]], rw = 0;
  BRAND_LOGOS_PPTX.forEach(([f, ar]) => { const w = Hin * ar; if (rw > 0 && rw + w > maxW) { lrows.push([]); rw = 0; } lrows[lrows.length - 1].push([f, w]); rw += w + gap; });
  const bandH = lrows.length * Hin + (lrows.length - 1) * vgap + padV * 2;
  const bandY = 7.42 - bandH;
  s.addShape(P.ShapeType.rect, { x: 0, y: bandY, w: 13.333, h: bandH, fill: { color: WHITE } });
  lrows.forEach((row, ri) => {
    const rowW = row.reduce((a, b) => a + b[1], 0) + (row.length - 1) * gap;
    let x = (13.333 - rowW) / 2;
    const y = bandY + padV + ri * (Hin + vgap);
    row.forEach(([f, w]) => { try { s.addImage({ path: 'assets/brands/' + f + '.png', x, y, w, h: Hin }); } catch (e) {} x += w + gap; });
  });
  s.addShape(P.ShapeType.rect, { x: 0, y: 7.42, w: 13.333, h: 0.08, fill: { color: ORANGE } });

  s = P.addSlide(); s.background = { color: WHITE };
  s.addText('RESUMEN EJECUTIVO', { x: 0.55, y: 0.5, w: 8, h: 0.35, color: ORANGE, fontSize: 13, bold: true, charSpacing: 2, fontFace: 'Arial' });
  s.addText('La semana en cifras', { x: 0.5, y: 0.82, w: 8, h: 0.7, color: INK, fontSize: 34, bold: true, fontFace: 'Arial' });
  s.addText((m.year + ' · Semana ' + m.week + ' · ' + m.range), { x: 6.5, y: 1.0, w: 6.3, h: 0.4, align: 'right', color: GREY, fontSize: 13, fontFace: 'Arial' });
  s.addShape(P.ShapeType.line, { x: 0.5, y: 1.7, w: 12.33, h: 0, line: { color: BLACK, width: 2.5 } });
  const tiles = [
    { n: String(v.count), l: 'Incidencias totales', s: v.itCount + ' IT · ' + v.redCount + ' RED', c: INK },
    { n: String(v.ministryCount), l: 'Reportadas al Ministerio', s: 'criterios de notificación', c: ORANGE },
    { n: String(v.platformCount), l: 'Impacto en plataforma', s: 'afectación de plataforma', c: INK },
    { n: String(v.externalOriginCount), l: 'Origen Externo', s: 'fuera de la operadora', c: INK },
  ];
  tiles.forEach((t, i) => {
    const x = 0.5 + i * 3.13;
    s.addShape(P.ShapeType.roundRect, { x, y: 2.0, w: 2.95, h: 1.85, fill: { color: WHITE }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
    s.addText(t.n, { x: x + 0.2, y: 2.2, w: 2.6, h: 0.8, color: t.c, fontSize: 40, bold: true, fontFace: 'Arial' });
    s.addText(t.l, { x: x + 0.2, y: 3.05, w: 2.6, h: 0.35, color: MUT, fontSize: 13, bold: true, fontFace: 'Arial' });
    s.addText(t.s, { x: x + 0.2, y: 3.38, w: 2.6, h: 0.3, color: GREY, fontSize: 11, fontFace: 'Arial' });
  });
  s.addShape(P.ShapeType.roundRect, { x: 0.5, y: 4.15, w: 12.33, h: 2.85, fill: { color: WHITE }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('POR SEVERIDAD', { x: 0.8, y: 4.4, w: 6, h: 0.35, color: GREY, fontSize: 12, bold: true, charSpacing: 1, fontFace: 'Arial' });
  const sevRows = [['SL1-Emergencia', v.emergencia, 'D43A2F'], ['SL2-Crítica', v.critica, ORANGE], ['SL3 · Media', v.sl3, 'E6A100']];
  sevRows.forEach((r, i) => {
    const y = 4.95 + i * 0.62;
    s.addText(r[0], { x: 0.8, y, w: 2, h: 0.4, color: r[2], fontSize: 13, bold: true, fontFace: 'Arial' });
    s.addShape(P.ShapeType.roundRect, { x: 2.9, y: y + 0.08, w: 9, h: 0.22, fill: { color: 'EFEDE9' }, rectRadius: 0.11 });
    const w = v.count ? Math.max(0.1, 9 * r[1] / v.count) : 0.1;
    s.addShape(P.ShapeType.roundRect, { x: 2.9, y: y + 0.08, w, h: 0.22, fill: { color: r[2] }, rectRadius: 0.11 });
    s.addText(String(r[1]), { x: 12.0, y, w: 0.55, h: 0.4, align: 'right', color: INK, fontSize: 15, bold: true, fontFace: 'Arial' });
  });

  // Complementary slide: incidents by weekday (Lun-Dom), split IT/RED --
  // helps spot whether outages cluster on specific days (e.g. weekend RED
  // cuts vs. weekday IT releases).
  const wk = weekdayBreakdown(inc);
  s = P.addSlide(); s.background = { color: WHITE };
  s.addText('RESUMEN EJECUTIVO', { x: 0.55, y: 0.5, w: 8, h: 0.35, color: ORANGE, fontSize: 13, bold: true, charSpacing: 2, fontFace: 'Arial' });
  s.addText('Incidencias por día de la semana', { x: 0.5, y: 0.82, w: 10, h: 0.7, color: INK, fontSize: 34, bold: true, fontFace: 'Arial' });
  s.addShape(P.ShapeType.rect, { x: 9.7, y: 0.95, w: 0.22, h: 0.22, fill: { color: INK } });
  s.addText('IT', { x: 9.98, y: 0.9, w: 0.7, h: 0.32, color: INK, fontSize: 12, bold: true, fontFace: 'Arial' });
  s.addShape(P.ShapeType.rect, { x: 10.6, y: 0.95, w: 0.22, h: 0.22, fill: { color: ORANGE } });
  s.addText('RED', { x: 10.88, y: 0.9, w: 0.9, h: 0.32, color: ORANGE, fontSize: 12, bold: true, fontFace: 'Arial' });
  s.addShape(P.ShapeType.line, { x: 0.5, y: 1.7, w: 12.33, h: 0, line: { color: BLACK, width: 2.5 } });

  const chartX0 = 0.7, chartW = 11.9, baseY = 6.5, topY = 2.2, maxBarH = baseY - topY;
  const maxCount = Math.max(1, ...wk.flatMap(d => [d.it, d.red]));
  const groupW = chartW / wk.length;
  wk.forEach((d, i) => {
    const gx = chartX0 + i * groupW;
    const barW = groupW * 0.28, gap = groupW * 0.08;
    const itH = maxBarH * d.it / maxCount, redH = maxBarH * d.red / maxCount;
    const itX = gx + groupW / 2 - gap / 2 - barW;
    const redX = gx + groupW / 2 + gap / 2;
    if (d.it) s.addShape(P.ShapeType.roundRect, { x: itX, y: baseY - itH, w: barW, h: itH, fill: { color: INK }, rectRadius: 0.04 });
    if (d.red) s.addShape(P.ShapeType.roundRect, { x: redX, y: baseY - redH, w: barW, h: redH, fill: { color: ORANGE }, rectRadius: 0.04 });
    if (d.it) s.addText(String(d.it), { x: itX - 0.1, y: baseY - itH - 0.32, w: barW + 0.2, h: 0.28, align: 'center', color: INK, fontSize: 11, bold: true, fontFace: 'Arial' });
    if (d.red) s.addText(String(d.red), { x: redX - 0.1, y: baseY - redH - 0.32, w: barW + 0.2, h: 0.28, align: 'center', color: ORANGE, fontSize: 11, bold: true, fontFace: 'Arial' });
    s.addText(d.label, { x: gx, y: baseY + 0.15, w: groupW, h: 0.35, align: 'center', color: MUT, fontSize: 13, bold: true, fontFace: 'Arial' });
  });
  s.addShape(P.ShapeType.line, { x: chartX0, y: baseY, w: chartW, h: 0, line: { color: LINE, width: 1.5 } });

  // Complementary slide: the single most notable incident of each area
  // (highest severity within its own scale, tie-broken by duration -- see
  // highlightIncident()), so a reader gets the gist without opening every
  // per-incident slide. Only the title is truncated (truncateText(), shared
  // with the other two formats) -- Causa/Métricas/Solución are shown in
  // full per the app's requirements, so this card uses nearly the whole
  // slide height to give them room.
  s = P.addSlide(); s.background = { color: WHITE };
  s.addText('RESUMEN EJECUTIVO', { x: 0.55, y: 0.5, w: 8, h: 0.35, color: ORANGE, fontSize: 13, bold: true, charSpacing: 2, fontFace: 'Arial' });
  s.addText('Incidencias destacadas', { x: 0.5, y: 0.82, w: 10, h: 0.7, color: INK, fontSize: 34, bold: true, fontFace: 'Arial' });
  s.addShape(P.ShapeType.line, { x: 0.5, y: 1.7, w: 12.33, h: 0, line: { color: BLACK, width: 2.5 } });

  const hlY = 2.15, hlBottom = 7.1, colGap = 0.35, colW = (12.33 - colGap) / 2;
  [['IT', INK], ['RED', ORANGE]].forEach(([area, areaColor], i) => {
    const cx = 0.5 + i * (colW + colGap);
    const boxY = hlY + 0.45, boxH = hlBottom - boxY;
    s.addText(area, { x: cx, y: hlY, w: colW, h: 0.35, color: areaColor, fontSize: 14, bold: true, charSpacing: 2, fontFace: 'Arial' });
    s.addShape(P.ShapeType.roundRect, { x: cx, y: boxY, w: colW, h: boxH, fill: { color: 'F7F6F4' }, rectRadius: 0.1 });
    const hi = highlightIncident(inc, area);
    if (!hi) {
      s.addText('Sin incidencias ' + area + ' esta semana', { x: cx + 0.3, y: boxY, w: colW - 0.6, h: boxH, align: 'left', valign: 'middle', color: GREY, fontSize: 14, italic: true, fontFace: 'Arial' });
      return;
    }
    const px = cx + 0.3, pw = colW - 0.6;
    const hsv = sev(hi.severity);
    s.addShape(P.ShapeType.roundRect, { x: px, y: boxY + 0.25, w: 1.9, h: 0.32, fill: { color: hsv.color.replace('#', '') }, rectRadius: 0.16 });
    s.addText(hsv.label, { x: px, y: boxY + 0.25, w: 1.9, h: 0.32, align: 'center', color: WHITE, fontSize: 11, bold: true, fontFace: 'Arial' });
    s.addText(truncateText(hi.title, 80), { x: px, y: boxY + 0.65, w: pw, h: 0.55, color: INK, fontSize: 15, bold: true, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.05 });

    // Same section accent colors as the per-incident slide (Causa=ink,
    // Solución=green), plus orange for Métricas to match the "Impacto"
    // column's accent there -- keeps this card visually consistent with
    // the rest of the deck instead of inventing a new palette.
    const metricRows = metricsArr(hi.metrics);
    const blocks = [];
    if (hi.cause) blocks.push({ label: 'CAUSA', color: INK, kind: 'text', text: hi.cause });
    if (metricRows.length) blocks.push({ label: 'MÉTRICAS', color: ORANGE, kind: 'metrics', rows: metricRows });
    if (hi.solution) blocks.push({ label: 'SOLUCIÓN', color: '1D8754', kind: 'text', text: hi.solution });
    const blockH = (boxH - 1.3) / Math.max(1, blocks.length);
    blocks.forEach((b, bi) => {
      const y = boxY + 1.3 + bi * blockH;
      s.addText(b.label, { x: px, y, w: pw, h: 0.2, color: b.color, fontSize: 9.5, bold: true, charSpacing: 1, fontFace: 'Arial' });
      s.addShape(P.ShapeType.line, { x: px, y: y + 0.24, w: 0.55, h: 0, line: { color: b.color, width: 1.75 } });
      if (b.kind === 'metrics') {
        const rowH = Math.min(0.28, (blockH - 0.38) / b.rows.length);
        b.rows.forEach((m, ri) => {
          const ry = y + 0.34 + ri * rowH;
          s.addText(m.label || '', { x: px, y: ry, w: pw * 0.62, h: rowH, color: MUT, fontSize: 10, fontFace: 'Arial', valign: 'middle' });
          s.addText(m.value, { x: px + pw * 0.62, y: ry, w: pw * 0.38, h: rowH, align: 'right', color: INK, fontSize: 10.5, bold: true, fontFace: 'Arial', valign: 'middle' });
        });
      } else {
        s.addText(b.text, { x: px, y: y + 0.34, w: pw, h: blockH - 0.36, color: '26241F', fontSize: 10.5, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.05 });
      }
    });
  });

  // One panel of a grouped slide (2-3 incidents sharing Grupo+Severidad+
  // Categoría, see groupIncidentsForSlides()): mini-header (ID/Fecha/
  // Duración, bold + monospace so it reads as the visual anchor telling
  // panels apart, per SC-003) + Impacto/Causa/Solución stacked vertically
  // (not side-by-side sub-columns like the single-incident slide -- there
  // isn't enough width per panel for that once split 2 or 3 ways) +
  // Marcas/flags at the bottom, kept per-incident rather than merged since
  // they can differ within the same group. Puntos de Acción only render
  // when includeActionPoints is true (groups of 2, FR-005).
  // Estimates the rendered height of a text block instead of reserving a
  // fixed box for it (same reasoning as the single-incident slide's
  // solutionH estimate above) -- PptxGenJS doesn't measure text or push
  // following shapes down when a box overflows, so a fixed height here
  // would make longer Causa/Solución/Impacto text visually overlap the
  // next section. Calibrated against the single-incident slide's ratio
  // (42 chars/line at fontSize 12.5 in a 3.65in-wide column).
  function estTextH(text, pw, fontSize) {
    const charsPerLine = Math.max(8, 42 * (pw / 3.65) * (12.5 / fontSize));
    const lines = Math.max(1, Math.ceil(String(text || '').length / charsPerLine));
    return lines * 0.17 * (fontSize / 9.5) + 0.08;
  }

  function addGroupPanel(sl, it, px, pw, isFirst, includeActionPoints) {
    if (!isFirst) sl.addShape(P.ShapeType.line, { x: px - 0.15, y: 2.35, w: 0, h: 4.75, line: { color: LINE, width: 1.5 } });
    // Capped rather than fully open-ended: a long title in a narrow panel
    // (3-incident groups) can wrap to several lines, so it needs more than
    // the one-line height a fixed box would give it (same overlap problem
    // as Causa/Solución below) -- but an unbounded title would crowd out
    // the rest of the panel's content, so it's capped at ~3 lines.
    const titleH = Math.min(0.95, Math.max(0.4, estTextH(titleOrCat0(it), pw, 15)));
    sl.addText(titleOrCat0(it), { x: px, y: 2.35, w: pw, h: titleH, color: INK, fontSize: 15, bold: true, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.05 });
    const metaY = 2.35 + titleH + 0.05;
    sl.addText(String(it.ticket || '—'), { x: px, y: metaY, w: pw * 0.4, h: 0.24, color: INK, fontSize: 10, bold: true, fontFace: 'Courier New' });
    sl.addText((it.date || '—') + '  ·  ' + (it.duration || '—'), { x: px + pw * 0.4, y: metaY, w: pw * 0.6, h: 0.24, align: 'right', color: ORANGE, fontSize: 10, bold: true, fontFace: 'Arial' });
    let yy = metaY + 0.32;
    const flags = [];
    if (it.ministry) flags.push('Ministerio');
    if (it.platform) flags.push('Plataforma');
    if (it.externalOrigin) flags.push('Origen Externo');
    if (flags.length) {
      sl.addText(flags.map(f => '● ' + f).join('   '), { x: px, y: yy, w: pw, h: 0.2, color: ORANGE, fontSize: 8.5, bold: true, fontFace: 'Arial' });
      yy += 0.28;
    }
    sl.addText('IMPACTO', { x: px, y: yy, w: pw, h: 0.22, color: MUT, fontSize: 9, bold: true, charSpacing: 1, fontFace: 'Arial' });
    yy += 0.24;
    metricsArr(it.metrics).forEach(mt => {
      sl.addText(mt.label + ':', { x: px, y: yy, w: pw * 0.62, h: 0.2, color: MUT, fontSize: 9.5, fontFace: 'Arial' });
      sl.addText(mt.value, { x: px + pw * 0.62, y: yy, w: pw * 0.38, h: 0.2, align: 'right', color: INK, fontSize: 9.5, bold: true, fontFace: 'Arial' });
      yy += 0.22;
    });
    if (it.impact) {
      const impactH = estTextH(it.impact, pw, 9.5);
      sl.addText(it.impact, { x: px, y: yy, w: pw, h: impactH, color: '26241F', fontSize: 9.5, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.02 });
      yy += impactH + 0.05;
    }
    sl.addText('CAUSA', { x: px, y: yy, w: pw, h: 0.22, color: MUT, fontSize: 9, bold: true, charSpacing: 1, fontFace: 'Arial' });
    yy += 0.24;
    const causeH = estTextH(it.cause, pw, 9.5);
    sl.addText(it.cause || '', { x: px, y: yy, w: pw, h: causeH, color: '26241F', fontSize: 9.5, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.02 });
    yy += causeH + 0.05;
    sl.addText('SOLUCIÓN', { x: px, y: yy, w: pw, h: 0.22, color: MUT, fontSize: 9, bold: true, charSpacing: 1, fontFace: 'Arial' });
    yy += 0.24;
    const solutionH = estTextH(it.solution, pw, 9.5);
    sl.addText(it.solution || '', { x: px, y: yy, w: pw, h: solutionH, color: '26241F', fontSize: 9.5, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.02 });
    yy += solutionH + 0.05;
    if (includeActionPoints) {
      actionPointsArr(it.actionPoints).forEach(ap => {
        const header = [ap.ap, ap.tipo].filter(Boolean).join(' · ');
        const descH = estTextH(ap.desc, pw, 8.5);
        sl.addText(header, { x: px, y: yy, w: pw, h: 0.18, color: '1D8754', fontSize: 8.5, bold: true, fontFace: 'Arial' });
        sl.addText(ap.desc, { x: px, y: yy + 0.18, w: pw, h: descH, color: '26241F', fontSize: 8.5, fontFace: 'Arial', valign: 'top' });
        yy += 0.18 + descH + 0.06;
      });
    }
    // max() with the fixed baseline keeps Marcas aligned across panels for
    // the common case, but still guarantees it never sits on top of a
    // panel whose Causa/Solución/Puntos de Acción ran long.
    sl.addText('Marcas: ' + (it.brands || '—'), { x: px, y: Math.max(yy + 0.05, 6.85), w: pw, h: 0.22, color: GREY, fontSize: 8.5, fontFace: 'Arial' });
  }
  function titleOrCat0(it) { return it.title || ((it.category || '') + (it.system ? ' · ' + it.system : '')); }

  groupIncidentsForSlides(inc).forEach((group) => {
    if (group.length === 1) {
      const it = group[0];
      const sv = sev(it.severity);
      const sl = P.addSlide(); sl.background = { color: WHITE };
      sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 2.25, fill: { color: BLACK } });
      sl.addText(it.group.toUpperCase(), { x: 0.55, y: 0.35, w: 7, h: 0.35, color: ORANGE, fontSize: 14, bold: true, charSpacing: 2, fontFace: 'Arial' });
      sl.addShape(P.ShapeType.roundRect, { x: 0.55, y: 1.62, w: 1.9, h: 0.34, fill: { color: sv.color.replace('#', '') }, rectRadius: 0.17 });
      sl.addText(sv.label, { x: 0.55, y: 1.62, w: 1.9, h: 0.34, align: 'center', color: WHITE, fontSize: 11, bold: true, fontFace: 'Arial' });
      sl.addText(titleOrCat0(it), { x: 2.7, y: 0.78, w: 7.0, h: 1.1, color: WHITE, fontSize: 23, bold: true, fontFace: 'Arial', valign: 'middle', lineSpacingMultiple: 1 });
      const meta2 = [['ID', it.ticket], ['FECHA', it.date], ['DURACIÓN', it.duration]];
      meta2.forEach((mm, i) => {
        const x = 9.9 + i * 1.13;
        sl.addText(mm[0], { x, y: 0.4, w: 1.1, h: 0.3, color: GREY, fontSize: 9, bold: true, charSpacing: 1, fontFace: 'Arial' });
        sl.addText(String(mm[1] || '—'), { x, y: 0.72, w: 1.1, h: 1.0, color: i === 2 ? ORANGE : WHITE, fontSize: 11, bold: i === 2, fontFace: 'Arial' });
      });
      const colY = 2.5, colH = 4.2;
      sl.addText('IMPACTO', { x: 0.55, y: colY, w: 3, h: 0.35, color: INK, fontSize: 13, bold: true, charSpacing: 1, fontFace: 'Arial' });
      sl.addShape(P.ShapeType.line, { x: 0.55, y: colY + 0.4, w: 1.0, h: 0, line: { color: ORANGE, width: 2.5 } });
      const mets = metricsArr(it.metrics);
      let yy = colY + 0.65;
      mets.forEach(mt => {
        sl.addShape(P.ShapeType.roundRect, { x: 0.55, y: yy, w: 4.3, h: 0.42, fill: { color: 'F7F6F4' }, rectRadius: 0.06 });
        sl.addText(mt.label, { x: 0.7, y: yy, w: 2.6, h: 0.42, color: MUT, fontSize: 11, valign: 'middle', fontFace: 'Arial' });
        sl.addText(mt.value, { x: 3.0, y: yy, w: 1.75, h: 0.42, align: 'right', color: INK, fontSize: 12, bold: true, valign: 'middle', fontFace: 'Arial' });
        yy += 0.5;
      });
      if (it.impact) sl.addText(it.impact, { x: 0.55, y: yy + 0.05, w: 4.35, h: colH - (yy - colY), color: '26241F', fontSize: 12.5, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.05 });
      sl.addText('CAUSA', { x: 5.25, y: colY, w: 3, h: 0.35, color: INK, fontSize: 13, bold: true, charSpacing: 1, fontFace: 'Arial' });
      sl.addShape(P.ShapeType.line, { x: 5.25, y: colY + 0.4, w: 1.0, h: 0, line: { color: BLACK, width: 2.5 } });
      sl.addText(it.cause || '', { x: 5.25, y: colY + 0.65, w: 3.55, h: colH, color: '26241F', fontSize: 12.5, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.05 });
      sl.addText('SOLUCIÓN', { x: 9.15, y: colY, w: 3, h: 0.35, color: INK, fontSize: 13, bold: true, charSpacing: 1, fontFace: 'Arial' });
      sl.addShape(P.ShapeType.line, { x: 9.15, y: colY + 0.4, w: 1.0, h: 0, line: { color: '1D8754', width: 2.5 } });
      const aps = actionPointsArr(it.actionPoints);
      const apRowH = 0.58;
      // Estimate the solution text's actual height instead of reserving the
      // whole column (colH) for it — otherwise, for a short solution, the
      // action point cards get pushed down near/past the footer bar and end
      // up hidden behind it (drawn later = on top in PowerPoint's z-order).
      const solText = it.solution || '';
      const estSolutionLines = Math.max(1, Math.ceil(solText.length / 42));
      const solutionH = Math.min(colH - 0.4, Math.max(0.4, estSolutionLines * 0.22 + 0.1));
      sl.addText(solText, { x: 9.15, y: colY + 0.65, w: 3.65, h: solutionH, color: '26241F', fontSize: 12.5, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.05 });
      let apY = colY + 0.65 + solutionH + 0.1;
      aps.forEach(ap => {
        sl.addShape(P.ShapeType.roundRect, { x: 9.15, y: apY, w: 3.65, h: apRowH - 0.08, fill: { color: 'F7F6F4' }, rectRadius: 0.06 });
        const apHeader = [ap.ap, ap.tipo].filter(Boolean).join(' · ');
        sl.addText(apHeader, { x: 9.3, y: apY + 0.03, w: 3.4, h: 0.22, color: '1D8754', fontSize: 10.5, bold: true, fontFace: 'Arial' });
        sl.addText(ap.desc, { x: 9.3, y: apY + 0.24, w: 3.4, h: apRowH - 0.32, color: '26241F', fontSize: 10.5, fontFace: 'Arial', valign: 'top' });
        apY += apRowH;
      });
      sl.addShape(P.ShapeType.rect, { x: 0, y: 6.95, w: 13.333, h: 0.55, fill: { color: 'F7F6F4' } });
      sl.addText('MARCAS:  ' + (it.brands || '—'), { x: 0.55, y: 6.95, w: 8, h: 0.55, color: '5C5852', fontSize: 11, valign: 'middle', fontFace: 'Arial' });
      const flags = [];
      const pushFlag = (text, color) => { if (flags.length) flags.push({ text: '     ', options: {} }); flags.push({ text, options: { color, bold: true } }); };
      if (it.ministry) pushFlag('● Reportada al Ministerio', ORANGE);
      if (it.platform) pushFlag('● Impacto en plataforma', MUT);
      if (it.externalOrigin) pushFlag('● Origen Externo', INK);
      if (flags.length) sl.addText(flags, { x: 6.5, y: 6.95, w: 6.3, h: 0.55, align: 'right', fontSize: 11, valign: 'middle', fontFace: 'Arial' });
      return;
    }

    // Grupo de 2 o 3 incidencias con la misma Grupo+Severidad+Categoría:
    // cabecera compartida (se muestran una sola vez, ya que son idénticas
    // por definición) + un panel por incidencia con su propio contenido.
    const first = group[0];
    const sv = sev(first.severity);
    const n = group.length;
    const includeActionPoints = n <= 3;
    const sl = P.addSlide(); sl.background = { color: WHITE };
    sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 2.1, fill: { color: BLACK } });
    sl.addText(first.group.toUpperCase(), { x: 0.55, y: 0.4, w: 7, h: 0.35, color: ORANGE, fontSize: 14, bold: true, charSpacing: 2, fontFace: 'Arial' });
    sl.addShape(P.ShapeType.roundRect, { x: 0.55, y: 0.78, w: 1.9, h: 0.34, fill: { color: sv.color.replace('#', '') }, rectRadius: 0.17 });
    sl.addText(sv.label, { x: 0.55, y: 0.78, w: 1.9, h: 0.34, align: 'center', color: WHITE, fontSize: 11, bold: true, fontFace: 'Arial' });
    if (first.category) sl.addText(first.category, { x: 0.55, y: 1.2, w: 11, h: 0.6, color: WHITE, fontSize: 21, bold: true, fontFace: 'Arial', valign: 'top' });
    sl.addText(n + ' incidencias con esta misma clasificación', { x: 0.55, y: 1.75, w: 11, h: 0.3, color: 'B8B2A9', fontSize: 11, fontFace: 'Arial' });

    const marginX = 0.55, totalW = 13.333 - marginX * 2, gap = n === 2 ? 0.4 : 0.3;
    const panelW = (totalW - gap * (n - 1)) / n;
    group.forEach((it, idx) => {
      const px = marginX + idx * (panelW + gap);
      addGroupPanel(sl, it, px, panelW, idx === 0, includeActionPoints);
    });
  });
}

function buildPdfHtml(report, incidents) {
  const inc = sortIncidents(incidents || report.incidents || []);
  const v = computeStats(inc);
  const wk = weekdayBreakdown(inc);
  const wkMax = Math.max(1, ...wk.flatMap(d => [d.it, d.red]));

  return `
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #26241F; }
        .page { page-break-after: always; padding: 20mm; min-height: 277mm; }

        /* Cover */
        .cover { background: #000; color: #fff; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
        .cover h1 { font-size: 48px; margin-bottom: 20px; }
        .cover .subtitle { font-size: 28px; color: #FF7900; margin-bottom: 30px; }
        .cover .meta { font-size: 14px; color: #999; }

        /* Executive Summary */
        .summary h2 { font-size: 32px; color: #26241F; margin-bottom: 20px; border-bottom: 3px solid #000; padding-bottom: 10px; }
        .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
        .stat-box { border: 1px solid #DEDAD3; padding: 15px; border-radius: 8px; }
        .stat-box .number { font-size: 28px; font-weight: bold; color: #FF7900; }
        .stat-box .label { font-size: 12px; color: #8A857C; margin-top: 5px; }
        .severity-chart { margin: 20px 0; }
        .severity-item { display: flex; align-items: center; margin: 10px 0; }
        .severity-item .label { width: 100px; font-weight: bold; }
        .severity-item .bar { flex: 1; height: 20px; background: #EFEDE9; border-radius: 4px; margin: 0 10px; position: relative; }
        .severity-item .bar-fill { height: 100%; border-radius: 4px; }
        .severity-item .count { width: 30px; text-align: right; font-weight: bold; }
        .weekday-chart { margin: 30px 0 15px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; height: 220px; }
        .weekday-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
        .weekday-bars { display: flex; align-items: flex-end; gap: 6px; height: 180px; }
        .weekday-bar { width: 26px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
        .weekday-bar .val { font-size: 11px; font-weight: bold; margin-bottom: 3px; }
        .weekday-bar .fill { width: 100%; border-radius: 3px 3px 0 0; }
        .weekday-label { margin-top: 10px; font-size: 12px; font-weight: bold; color: #5C5852; }
        .weekday-legend { display: flex; gap: 20px; justify-content: center; margin-top: 15px; font-size: 12px; font-weight: bold; color: #5C5852; }
        .weekday-legend span.item { display: inline-flex; align-items: center; gap: 6px; }
        .weekday-legend .dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }

        /* Incidencias destacadas */
        .highlight-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
        .highlight-area-label { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
        .highlight-card { border-radius: 8px; background: #F7F6F4; padding: 20px; min-height: 220px; }
        .highlight-card .badge { display: inline-block; padding: 5px 12px; border-radius: 999px; color: #fff; font-size: 11px; font-weight: bold; }
        .highlight-card .title { margin-top: 12px; font-size: 16px; font-weight: bold; line-height: 1.3; }
        .highlight-card .detail { margin-top: 10px; font-size: 12px; color: #5C5852; }
        .highlight-card .section { margin-top: 12px; }
        .highlight-card .section-label { display: inline-block; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 3px; border-bottom: 2px solid; }
        .highlight-card .section-text { margin-top: 6px; font-size: 12px; color: #26241F; line-height: 1.5; white-space: pre-line; }
        .highlight-card .metric-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; margin-top: 5px; }
        .highlight-card .metric-row .m-label { color: #5C5852; }
        .highlight-card .metric-row .m-value { font-weight: bold; color: #26241F; }
        .highlight-empty { min-height: 220px; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #8A857C; font-style: italic; }

        /* Incident slides */
        .incident { page-break-before: always; }
        .incident-header { background: #000; color: #fff; padding: 15px; margin: -20mm -20mm 20px -20mm; }
        .incident-header h3 { font-size: 24px; margin-bottom: 10px; }
        .incident-header .meta { font-size: 12px; color: #999; }
        .severity-badge { display: inline-block; padding: 5px 12px; border-radius: 4px; color: #fff; font-weight: bold; font-size: 11px; margin-bottom: 10px; }
        .incident-content { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .incident-section h4 { color: #26241F; font-size: 13px; font-weight: bold; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #FF7900; }
        .incident-section p { font-size: 11px; line-height: 1.5; color: #5C5852; white-space: pre-line; }
        .brands { margin-top: 15px; padding-top: 15px; border-top: 1px solid #DEDAD3; font-size: 11px; }
        .flags { margin-top: 10px; }
        .flag { font-size: 11px; margin: 5px 0; }

        /* Grupo de incidencias con la misma Grupo+Severidad+Categoría */
        .incident-group-header { background: #000; color: #fff; padding: 15px; margin: -20mm -20mm 20px -20mm; }
        .incident-group-header .category { font-size: 22px; font-weight: bold; margin: 8px 0 4px; }
        .incident-group-header .subtitle { font-size: 12px; color: #B8B2A9; }
        .incident-panels { display: flex; gap: 0; }
        .incident-panel { flex: 1; min-width: 0; padding: 0 14px; }
        .incident-panel:not(:first-child) { border-left: 2px solid #DEDAD3; }
        .incident-panel .mini-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #B8B2A9; padding-bottom: 8px; margin-bottom: 8px; }
        .incident-panel .mini-title { font-size: 13px; font-weight: bold; }
        .incident-panel .mini-meta { font-size: 10px; color: #8A857C; text-align: right; white-space: nowrap; }
        .incident-panel .mini-meta .ticket { font-weight: bold; color: #26241F; }
        .incident-panel .mini-meta .dur { color: #FF7900; font-weight: bold; }
        .incident-panel h4 { color: #26241F; font-size: 11px; font-weight: bold; margin: 8px 0 4px; padding-bottom: 3px; border-bottom: 2px solid #FF7900; }
        .incident-panel p { font-size: 10px; line-height: 1.4; color: #5C5852; white-space: pre-line; }
        .incident-panel .brands { margin-top: 8px; padding-top: 8px; font-size: 9.5px; }
      </style>
    </head>
    <body>
      <!-- Portada -->
      <div class="page cover">
        <img src="assets/orange-logo.svg" alt="Orange" style="height: 60px; width: 60px; margin-bottom: 30px;">
        <h1>Reporte de Incidencias</h1>
        <div class="subtitle">${esc(report.year)} · SEMANA ${esc(report.week)}</div>
        <p style="margin-top: 30px; font-size: 16px;">${esc(report.range)}</p>
        <p style="margin-top: 15px; font-size: 14px; color: #8A857C;">${esc(report.dept)}</p>
      </div>

      <!-- Resumen Ejecutivo -->
      <div class="page summary">
        <h2>Resumen Ejecutivo</h2>

        <div class="stats">
          ${[
            [v.count, `Incidencias totales (${v.itCount} IT · ${v.redCount} RED)`, '#0C0B09'],
            [v.ministryCount, 'Reportadas al Ministerio', '#FF7900'],
            [v.platformCount, 'Impacto en plataforma', '#0C0B09'],
            [v.externalOriginCount, 'Origen Externo', '#0C0B09'],
          ].map(([n, label, color]) => `
          <div class="stat-box">
            <div class="number" style="color: ${color};">${n}</div>
            <div class="label">${esc(label)}</div>
          </div>`).join('')}
        </div>

        <div class="severity-chart">
          <h3 style="margin-bottom: 15px;">Por Severidad</h3>
          ${[['SL1-Emergencia', v.emergencia, '#D43A2F'], ['SL2-Crítica', v.critica, '#FF7900'], ['SL3 · Media', v.sl3, '#E6A100']].map(([label, val, color]) => `
          <div class="severity-item">
            <div class="label">${esc(label)}</div>
            <div class="bar"><div class="bar-fill" style="width: ${v.count ? (100 * val / v.count) : 0}%; background: ${color};"></div></div>
            <div class="count">${val}</div>
          </div>`).join('')}
        </div>
      </div>

      <!-- Incidencias por día de la semana -->
      <div class="page summary">
        <h2>Incidencias por día de la semana</h2>
        <div class="weekday-chart">
          ${wk.map(d => `
          <div class="weekday-col">
            <div class="weekday-bars">
              <div class="weekday-bar">
                ${d.it ? `<div class="val">${d.it}</div>` : ''}
                <div class="fill" style="height: ${Math.round(180 * d.it / wkMax)}px; background: #0C0B09;"></div>
              </div>
              <div class="weekday-bar">
                ${d.red ? `<div class="val" style="color:#FF7900;">${d.red}</div>` : ''}
                <div class="fill" style="height: ${Math.round(180 * d.red / wkMax)}px; background: #FF7900;"></div>
              </div>
            </div>
            <div class="weekday-label">${esc(d.label)}</div>
          </div>`).join('')}
        </div>
        <div class="weekday-legend">
          <span class="item"><span class="dot" style="background:#0C0B09;"></span>IT</span>
          <span class="item"><span class="dot" style="background:#FF7900;"></span>RED</span>
        </div>
      </div>

      <!-- Incidencias destacadas -->
      <div class="page summary">
        <h2>Incidencias destacadas</h2>
        <div class="highlight-grid">
          ${[['IT', '#0C0B09'], ['RED', '#FF7900']].map(([area, color]) => {
            const hi = highlightIncident(inc, area);
            const label = `<div class="highlight-area-label" style="color:${color};">${area}</div>`;
            if (!hi) return `<div>${label}<div class="highlight-card highlight-empty">Sin incidencias ${area} esta semana</div></div>`;
            const sv = sev(hi.severity);
            const metricRows = metricsArr(hi.metrics);
            const blocks = [];
            if (hi.cause) blocks.push({ label: 'Causa', color: '#0C0B09', kind: 'text', text: hi.cause });
            if (metricRows.length) blocks.push({ label: 'Métricas', color: '#FF7900', kind: 'metrics', rows: metricRows });
            if (hi.solution) blocks.push({ label: 'Solución', color: '#1D8754', kind: 'text', text: hi.solution });
            return `
            <div>
              ${label}
              <div class="highlight-card">
                <span class="badge" style="background:${sv.color};">${esc(sv.label)}</span>
                <div class="title">${esc(truncateText(hi.title, 110))}</div>
                ${blocks.map(b => `
                <div class="section">
                  <div class="section-label" style="color:${b.color}; border-color:${b.color};">${esc(b.label)}</div>
                  ${b.kind === 'metrics'
                    ? b.rows.map(m => `<div class="metric-row"><span class="m-label">${esc(m.label)}</span><span class="m-value">${esc(m.value)}</span></div>`).join('')
                    : `<div class="section-text">${esc(b.text)}</div>`}
                </div>`).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Incidencias -->
      ${groupIncidentsForSlides(inc).map((group) => {
        if (group.length === 1) {
          const it = group[0];
          const sv = sev(it.severity);
          const mainTitle = it.title || it.category || '';
          const sysMeta = it.system ? ` · ${it.system}` : '';
          const aps = actionPointsArr(it.actionPoints);
          return `
            <div class="page incident">
              <div class="incident-header">
                <div class="severity-badge" style="background: ${sv.color};">${esc(sv.label)}</div>
                <h3>${esc(mainTitle)}</h3>
                <div class="meta">${esc(it.group || '')}${esc(sysMeta)}</div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                <div>
                  <div style="font-size: 10px; color: #8A857C; font-weight: bold;">ID</div>
                  <div style="font-size: 12px;">${esc(it.ticket || '—')}</div>
                </div>
                <div>
                  <div style="font-size: 10px; color: #8A857C; font-weight: bold;">FECHA</div>
                  <div style="font-size: 12px;">${esc(it.date || '—')}</div>
                </div>
                <div>
                  <div style="font-size: 10px; color: #8A857C; font-weight: bold;">DURACIÓN</div>
                  <div style="font-size: 12px; color: #FF7900; font-weight: bold;">${esc(it.duration || '—')}</div>
                </div>
              </div>

              <div class="incident-content">
                <div>
                  <div class="incident-section">
                    <h4>IMPACTO</h4>
                    <p>${esc(it.impact || '—')}</p>
                  </div>
                </div>
                <div>
                  <div class="incident-section">
                    <h4>CAUSA</h4>
                    <p>${esc(it.cause || '—')}</p>
                  </div>
                </div>
              </div>

              <div class="incident-section" style="margin-top: 15px;">
                <h4>SOLUCIÓN</h4>
                <p>${esc(it.solution || '—')}</p>
              </div>

              <div class="incident-section" style="margin-top: 15px;">
                <h4>ACTION POINTS</h4>
                ${aps.length
                  ? aps.map(ap => `<p><strong>${esc([ap.ap, ap.tipo].filter(Boolean).join(' · '))}:</strong> ${esc(ap.desc)}</p>`).join('')
                  : '<p>—</p>'}
              </div>

              <div class="brands">
                <strong>Marcas afectadas:</strong> ${esc(it.brands || '—')}
                <div class="flags">
                  ${it.ministry ? '<div class="flag">● Reportada al Ministerio</div>' : ''}
                  ${it.platform ? '<div class="flag">● Impacto en plataforma</div>' : ''}
                  ${it.externalOrigin ? '<div class="flag">● Origen Externo</div>' : ''}
                </div>
              </div>
            </div>
          `;
        }

        const first = group[0];
        const sv = sev(first.severity);
        const includeActionPoints = group.length <= 3;
        const panelsHtml = group.map(it => {
          const flags = [
            it.ministry ? '● Reportada al Ministerio' : '',
            it.platform ? '● Impacto en plataforma' : '',
            it.externalOrigin ? '● Origen Externo' : '',
          ].filter(Boolean);
          const aps = actionPointsArr(it.actionPoints);
          const panelTitle = it.title || it.category || '';
          const sysStr = it.system ? ` · ${it.system}` : '';
          return `
            <div class="incident-panel">
              <div class="mini-header">
                <div class="mini-title">${esc(panelTitle)}${esc(sysStr)}</div>
                <div class="mini-meta"><span class="ticket">${esc(it.ticket || '—')}</span><br>${esc(it.date || '—')} · <span class="dur">${esc(it.duration || '—')}</span></div>
              </div>
              ${flags.length ? `<div class="flags" style="margin:0 0 6px;">${flags.map(f => `<div class="flag" style="font-size:9.5px;">${esc(f)}</div>`).join('')}</div>` : ''}
              <h4>IMPACTO</h4>
              <p>${esc(it.impact || '—')}</p>
              <h4>CAUSA</h4>
              <p>${esc(it.cause || '—')}</p>
              <h4>SOLUCIÓN</h4>
              <p>${esc(it.solution || '—')}</p>
              ${(includeActionPoints && aps.length) ? `
              <h4>ACTION POINTS</h4>
              ${aps.map(ap => `<p><strong>${esc([ap.ap, ap.tipo].filter(Boolean).join(' · '))}:</strong> ${esc(ap.desc)}</p>`).join('')}` : ''}
              <div class="brands"><strong>Marcas:</strong> ${esc(it.brands || '—')}</div>
            </div>
          `;
        }).join('');
        return `
          <div class="page incident">
            <div class="incident-group-header">
              <span class="severity-badge" style="background: ${sv.color};">${esc(sv.label)}</span>
              <div class="category">${esc(first.category || '')}</div>
              <div class="subtitle">${esc(first.group || '')} · ${group.length} incidencias con esta misma clasificación</div>
            </div>
            <div class="incident-panels">${panelsHtml}</div>
          </div>
        `;
      }).join('')}
    </body>
    </html>
  `;
}

async function downloadPdf(report, incidents, options) {
  if (!window.html2pdf) {
    throw new Error('La librería html2pdf aún se está cargando, inténtalo de nuevo en unos segundos.');
  }
  const inc = incidents || report.incidents || [];
  const htmlContent = buildPdfHtml(report, inc);
  const element = document.createElement('div');
  element.innerHTML = htmlContent;

  const defaultFilename = (report.id || `report_${report.year || ''}_W${report.week || ''}`) + '_ReporteIncidencias.pdf';
  const opt = Object.assign({
    margin: 0,
    filename: defaultFilename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
  }, options || {});

  return html2pdf().set(opt).from(element).save();
}

function downloadPptx(report, incidents, fileName) {
  if (!window.PptxGenJS) {
    throw new Error('La librería de PowerPoint aún se está cargando, inténtalo de nuevo en unos segundos.');
  }
  const P = new window.PptxGenJS();
  P.defineLayout({ name: 'W', width: 13.333, height: 7.5 });
  P.layout = 'W';
  const inc = incidents || report.incidents || [];
  buildPptxDeck(P, report, inc);
  const name = fileName || (report.id ? report.id + '_ReporteIncidencias.pptx' : 'ReporteIncidencias.pptx');
  return P.writeFile({ fileName: name });
}

window.ReportRender = {
  esc,
  SEV, sev, areaOf, severityOptions,
  parseDurMin, fmtDur, fmtK, num,
  metricsArr, actionPointsArr,
  BRAND_LOGOS_PPTX,
  computeStats, highlightIncident, truncateText, weekdayBreakdown, compareIncidents, sortIncidents, groupIncidentsForSlides, buildPptxDeck,
  buildPdfHtml, downloadPdf, downloadPptx,
};
})();
