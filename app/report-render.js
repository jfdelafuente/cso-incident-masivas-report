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
  'Otras RED',
  'RED - Relevantes por duración/Climatología/Escalados RRII',
  'RED - Impacto B2B',
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
  s.addText([{ text: '+', options: { color: ORANGE, bold: true } }, { text: 'O', options: { color: WHITE, bold: true } }], { x: 0.5, y: 0.45, w: 2, h: 0.8, fontSize: 40, fontFace: 'Arial' });
  s.addText(m.dept, { x: 8.3, y: 0.55, w: 4.5, h: 0.4, align: 'right', color: 'B8B2A9', fontSize: 13, fontFace: 'Arial' });
  s.addText((m.year + ' · SEMANA ' + m.week).toUpperCase(), { x: 0.5, y: 3.7, w: 10, h: 0.4, color: ORANGE, fontSize: 16, bold: true, charSpacing: 3, fontFace: 'Arial' });
  s.addText([{ text: 'Reporte de incidencias ', options: { color: WHITE } }, { text: 'IT + RED', options: { color: ORANGE } }], { x: 0.48, y: 3.95, w: 11, h: 1.5, fontSize: 54, bold: true, fontFace: 'Arial', lineSpacingMultiple: 0.95 });
  s.addText(m.range, { x: 0.5, y: 5.72, w: 7, h: 0.4, color: GREY, fontSize: 14, fontFace: 'Arial' });
  s.addText([{ text: v.count + '   ', options: { color: WHITE, bold: true, fontSize: 26 } }, { text: 'incidencias      ', options: { color: GREY, fontSize: 12 } }, { text: v.totalDuration + '  ', options: { color: ORANGE, bold: true, fontSize: 26 } }, { text: 'acumulado', options: { color: GREY, fontSize: 12 } }], { x: 5.5, y: 5.64, w: 7.3, h: 0.55, align: 'right', fontFace: 'Arial' });
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
    { n: v.totalDuration, l: 'Tiempo de afectación', s: 'acumulado', c: ORANGE },
    { n: v.totalMobile, l: 'Clientes móvil', s: 'impacto estimado', c: INK },
    { n: v.totalFTTH, l: 'Clientes FTTH', s: 'impacto estimado', c: INK },
  ];
  tiles.forEach((t, i) => {
    const x = 0.5 + i * 3.13;
    s.addShape(P.ShapeType.roundRect, { x, y: 2.0, w: 2.95, h: 1.85, fill: { color: WHITE }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
    s.addText(t.n, { x: x + 0.2, y: 2.2, w: 2.6, h: 0.8, color: t.c, fontSize: 40, bold: true, fontFace: 'Arial' });
    s.addText(t.l, { x: x + 0.2, y: 3.05, w: 2.6, h: 0.35, color: MUT, fontSize: 13, bold: true, fontFace: 'Arial' });
    s.addText(t.s, { x: x + 0.2, y: 3.38, w: 2.6, h: 0.3, color: GREY, fontSize: 11, fontFace: 'Arial' });
  });
  s.addShape(P.ShapeType.roundRect, { x: 0.5, y: 4.15, w: 8.2, h: 2.85, fill: { color: WHITE }, line: { color: LINE, width: 1 }, rectRadius: 0.1 });
  s.addText('POR SEVERIDAD', { x: 0.8, y: 4.4, w: 6, h: 0.35, color: GREY, fontSize: 12, bold: true, charSpacing: 1, fontFace: 'Arial' });
  const sevRows = [['SL1-Emergencia', v.emergencia, 'D43A2F'], ['SL2-Crítica', v.critica, ORANGE], ['SL3 · Media', v.sl3, 'E6A100']];
  sevRows.forEach((r, i) => {
    const y = 4.95 + i * 0.62;
    s.addText(r[0], { x: 0.8, y, w: 2, h: 0.4, color: r[2], fontSize: 13, bold: true, fontFace: 'Arial' });
    s.addShape(P.ShapeType.roundRect, { x: 2.9, y: y + 0.08, w: 5, h: 0.22, fill: { color: 'EFEDE9' }, rectRadius: 0.11 });
    const w = v.count ? Math.max(0.1, 5 * r[1] / v.count) : 0.1;
    s.addShape(P.ShapeType.roundRect, { x: 2.9, y: y + 0.08, w, h: 0.22, fill: { color: r[2] }, rectRadius: 0.11 });
    s.addText(String(r[1]), { x: 8.0, y, w: 0.55, h: 0.4, align: 'right', color: INK, fontSize: 15, bold: true, fontFace: 'Arial' });
  });
  const mBoxY = 4.15, mBoxH = 2.85, mRowH = mBoxH / 3;
  s.addShape(P.ShapeType.roundRect, { x: 8.95, y: mBoxY, w: 3.88, h: mBoxH, fill: { color: BLACK }, rectRadius: 0.1 });
  [['REPORTADAS AL MINISTERIO', v.ministryCount, ORANGE], ['CON IMPACTO EN PLATAFORMA', v.platformCount, WHITE], ['ORIGEN EXTERNO', v.externalOriginCount, WHITE]].forEach((r, i) => {
    const rowY = mBoxY + i * mRowH;
    s.addText(r[0], { x: 9.25, y: rowY + 0.18, w: 3.3, h: 0.28, align: 'center', color: 'B8B2A9', fontSize: 10.5, bold: true, charSpacing: 1, fontFace: 'Arial' });
    s.addText(String(r[1]), { x: 9.25, y: rowY + 0.4, w: 3.3, h: 0.42, align: 'center', color: r[2], fontSize: 30, bold: true, fontFace: 'Arial' });
    if (i < 2) s.addShape(P.ShapeType.line, { x: 9.25, y: rowY + mRowH, w: 3.3, h: 0, line: { color: '2A2823', width: 1 } });
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

  inc.forEach((it) => {
    const sv = sev(it.severity);
    const sl = P.addSlide(); sl.background = { color: WHITE };
    sl.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 2.25, fill: { color: BLACK } });
    sl.addText(it.group.toUpperCase(), { x: 0.55, y: 0.35, w: 7, h: 0.35, color: ORANGE, fontSize: 14, bold: true, charSpacing: 2, fontFace: 'Arial' });
    sl.addShape(P.ShapeType.roundRect, { x: 0.55, y: 1.62, w: 1.9, h: 0.34, fill: { color: sv.color.replace('#', '') }, rectRadius: 0.17 });
    sl.addText(sv.label, { x: 0.55, y: 1.62, w: 1.9, h: 0.34, align: 'center', color: WHITE, fontSize: 11, bold: true, fontFace: 'Arial' });
    sl.addText(it.title || ((it.category || '') + (it.system ? ' · ' + it.system : '')), { x: 2.7, y: 0.78, w: 7.0, h: 1.1, color: WHITE, fontSize: 23, bold: true, fontFace: 'Arial', valign: 'middle', lineSpacingMultiple: 1 });
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
  });
}

window.ReportRender = {
  SEV, sev, areaOf, severityOptions,
  parseDurMin, fmtDur, fmtK, num,
  metricsArr, actionPointsArr,
  BRAND_LOGOS_PPTX,
  computeStats, weekdayBreakdown, compareIncidents, sortIncidents, buildPptxDeck,
};
})();
