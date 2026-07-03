// PPT generation utilities (matching app.js format)
const BRAND_LOGOS_PPTX = [['orange', 1.0], ['yoigo', 2.58], ['jazztel', 3.21], ['masmovil', 4.56], ['pepephone', 4.43], ['simyo', 2.66], ['llamaya', 3.01], ['lebara', 3.47], ['euskaltel', 3.77], ['r', 0.94], ['telecable', 2.21], ['guuk', 2.13], ['embou', 2.99], ['populoos', 3.35]];
const SEV = {
  SL1: { color: '#D43A2F', label: 'SL1 · Crítica' },
  SL2: { color: '#FF7900', label: 'SL2 · Alta' },
  SL3: { color: '#E6A100', label: 'SL3 · Media' },
};
function sev(k) { return SEV[k] || SEV.SL2; }
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

const HomePage = {
  reports: [],
  currentEditId: null,

  async init() {
    console.log('Inicializando HomePage...');

    // Check backend connection
    const health = await ApiClient.healthCheck();
    if (!health) {
      const backendUrl = ApiClient.baseURL || `${window.location.origin}/api`;
      alert(`⚠️ No se puede conectar al backend. Asegúrate de que el servidor FastAPI está accesible en ${backendUrl}`);
    }

    this.setupEventListeners();
    await this.loadReports();
  },

  setupEventListeners() {
    document.getElementById('btnNewReport').addEventListener('click', () => this.openNewReportModal());
    document.getElementById('btnNewReportEmpty').addEventListener('click', () => this.openNewReportModal());
    document.getElementById('btnImportReport').addEventListener('click', () => this.triggerImport());

    document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
    document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('reportForm').addEventListener('submit', (e) => this.handleFormSubmit(e));

    document.getElementById('closeDuplicateModal').addEventListener('click', () => this.closeDuplicateModal());
    document.getElementById('cancelDuplicateBtn').addEventListener('click', () => this.closeDuplicateModal());
    document.getElementById('duplicateForm').addEventListener('submit', (e) => this.handleDuplicateSubmit(e));

    document.getElementById('fileInput').addEventListener('change', (e) => this.handleImport(e));
  },

  async loadReports() {
    try {
      this.reports = await ApiClient.listReports();
      this.renderReports();
    } catch (error) {
      console.error('Error loading reports:', error);
      alert('Error al cargar los informes: ' + error.message);
    }
  },

  renderReports() {
    const listEl = document.getElementById('reportsList');
    const emptyEl = document.getElementById('emptyState');

    if (this.reports.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.innerHTML = this.reports.map(report => `
      <div class="report-card">
        <div class="report-header">
          <div class="report-id">${report.id}</div>
          <select class="status-select" onchange="HomePage.changeStatus('${report.id}', this.value)" style="padding:4px 8px; border-radius:4px; border:none; font-size:11px; font-weight:600; text-transform:uppercase; cursor:pointer;">
            <option value="draft" ${report.status === 'draft' ? 'selected' : ''}>Draft</option>
            <option value="reviewed" ${report.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
            <option value="published" ${report.status === 'published' ? 'selected' : ''}>Published</option>
          </select>
        </div>

        <div class="report-meta">
          <div><strong>Rango:</strong> ${report.range}</div>
          <div><strong>Dpto:</strong> ${report.dept}</div>
          <div><strong>Creado:</strong> ${new Date(report.createdAt).toLocaleDateString('es-ES')}</div>
          ${report.createdBy ? `<div><strong>Por:</strong> ${report.createdBy}</div>` : ''}
        </div>

        <div class="report-incidences">
          ${report.incidents.length} incidencia${report.incidents.length !== 1 ? 's' : ''}
        </div>

        <div class="report-actions">
          <a href="index.html?report=${report.id}" class="btn btn-primary btn-small">Editar</a>
          <button class="btn btn-secondary btn-small" onclick="HomePage.openDuplicateModal('${report.id}')">Duplicar</button>
          <button class="btn btn-secondary btn-small" onclick="HomePage.downloadPDF('${report.id}')">PDF</button>
          <button class="btn btn-secondary btn-small" onclick="HomePage.downloadPPTX('${report.id}')">PPT</button>
          <button class="btn btn-danger btn-small" onclick="HomePage.deleteReport('${report.id}')">Borrar</button>
          <a href="preview.html?report=${report.id}" class="btn btn-success btn-small">👁 Ver Informe</a>
        </div>
      </div>
    `).join('');
  },

  openNewReportModal() {
    this.currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Nuevo Informe';
    document.getElementById('reportForm').reset();

    const today = new Date();
    const week = Math.ceil((today - new Date(today.getFullYear(), 0, 1)) / 86400000 / 7);
    document.getElementById('formYear').value = today.getFullYear();
    document.getElementById('formWeek').value = week;
    document.getElementById('formRange').value = '';
    document.getElementById('formDept').value = 'Customer & Service Operations';
    document.getElementById('formStatus').value = 'draft';
    document.getElementById('formNotes').value = '';

    document.getElementById('reportModal').classList.add('active');
  },

  closeModal() {
    document.getElementById('reportModal').classList.remove('active');
    document.getElementById('formError').style.display = 'none';
  },

  async handleFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const report = {
        year: parseInt(document.getElementById('formYear').value),
        week: parseInt(document.getElementById('formWeek').value),
        range: document.getElementById('formRange').value,
        dept: document.getElementById('formDept').value,
        status: document.getElementById('formStatus').value,
        notes: document.getElementById('formNotes').value,
        incidents: this.currentEditId ?
          this.reports.find(r => r.id === this.currentEditId)?.incidents || [] :
          [],
      };

      if (this.currentEditId) {
        await ApiClient.updateReport(this.currentEditId, report);
      } else {
        await ApiClient.createReport(report);
      }

      this.closeModal();
      await this.loadReports();
    } catch (error) {
      document.getElementById('formError').textContent = error.message;
      document.getElementById('formError').style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  },


  openDuplicateModal(reportId) {
    const report = this.reports.find(r => r.id === reportId);
    if (!report) return;

    document.getElementById('duplicateInfo').textContent =
      `Duplicar ${reportId} (semana ${report.week}) a una nueva semana:`;
    document.getElementById('duplicateWeek').value = report.week + 1;
    document.getElementById('duplicateWeek').dataset.sourceId = reportId;

    document.getElementById('duplicateModal').classList.add('active');
  },

  closeDuplicateModal() {
    document.getElementById('duplicateModal').classList.remove('active');
    document.getElementById('duplicateError').style.display = 'none';
  },

  async handleDuplicateSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const sourceId = document.getElementById('duplicateWeek').dataset.sourceId;
      const newWeek = parseInt(document.getElementById('duplicateWeek').value);

      await ApiClient.duplicateReport(sourceId, newWeek);
      this.closeDuplicateModal();
      await this.loadReports();
    } catch (error) {
      document.getElementById('duplicateError').textContent = error.message;
      document.getElementById('duplicateError').style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  },

  async deleteReport(reportId) {
    if (!confirm(`¿Estás seguro de que quieres borrar ${reportId}?`)) return;

    try {
      await ApiClient.deleteReport(reportId);
      await this.loadReports();
    } catch (error) {
      alert('Error al borrar el informe: ' + error.message);
    }
  },

  async downloadPDF(reportId) {
    try {
      const report = await ApiClient.getReport(reportId);
      const inc = report.incidents || [];

      // Compute statistics
      const count = inc.length;
      const itCount = inc.filter(i => (i.group || '').includes('IT')).length;
      const redCount = count - itCount;
      const sl1 = inc.filter(i => i.severity === 'SL1').length;
      const sl2 = inc.filter(i => i.severity === 'SL2').length;
      const sl3 = inc.filter(i => i.severity === 'SL3').length;
      const totalMin = inc.reduce((a, i) => a + parseDurMin(i.duration), 0);
      const ftth = inc.reduce((a, i) => a + num(i.cFTTH), 0);
      const mob = inc.reduce((a, i) => a + num(i.cMobile), 0);
      const ministryCount = inc.filter(i => i.ministry).length;
      const platformCount = inc.filter(i => i.platform).length;

      const v = { count, itCount, redCount, sl1, sl2, sl3, ministryCount, platformCount, totalDuration: fmtDur(totalMin), totalFTTH: fmtK(ftth), totalMobile: fmtK(mob) };

      // Create professional HTML content for PDF
      const htmlContent = `
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

            /* Incident slides */
            .incident { page-break-before: always; }
            .incident-header { background: #000; color: #fff; padding: 15px; margin: -20mm -20mm 20px -20mm; }
            .incident-header h3 { font-size: 24px; margin-bottom: 10px; }
            .incident-header .meta { font-size: 12px; color: #999; }
            .severity-badge { display: inline-block; padding: 5px 12px; border-radius: 4px; color: #fff; font-weight: bold; font-size: 11px; margin-bottom: 10px; }
            .incident-content { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            .incident-section h4 { color: #26241F; font-size: 13px; font-weight: bold; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 2px solid #FF7900; }
            .incident-section p { font-size: 11px; line-height: 1.5; color: #5C5852; }
            .brands { margin-top: 15px; padding-top: 15px; border-top: 1px solid #DEDAD3; font-size: 11px; }
            .flags { margin-top: 10px; }
            .flag { font-size: 11px; margin: 5px 0; }
          </style>
        </head>
        <body>
          <!-- Portada -->
          <div class="page cover">
            <h1>Reporte de Incidencias</h1>
            <div class="subtitle">${report.year} · SEMANA ${report.week}</div>
            <p style="margin-top: 30px; font-size: 16px;">${report.range}</p>
            <p style="margin-top: 15px; font-size: 14px; color: #8A857C;">${report.dept}</p>
            <div style="margin-top: 40px; text-align: center;">
              <div style="font-size: 36px; font-weight: bold;">${v.count}</div>
              <div style="font-size: 12px; color: #999;">incidencias</div>
              <div style="font-size: 24px; font-weight: bold; color: #FF7900; margin-top: 10px;">${v.totalDuration}</div>
              <div style="font-size: 12px; color: #999;">acumulado</div>
            </div>
          </div>

          <!-- Resumen Ejecutivo -->
          <div class="page summary">
            <h2>Resumen Ejecutivo</h2>

            <div class="stats">
              <div class="stat-box">
                <div class="number">${v.count}</div>
                <div class="label">Incidencias totales (${v.itCount} IT · ${v.redCount} RED)</div>
              </div>
              <div class="stat-box">
                <div class="number">${v.totalDuration}</div>
                <div class="label">Tiempo de afectación</div>
              </div>
              <div class="stat-box">
                <div class="number">${v.totalMobile}</div>
                <div class="label">Clientes móvil</div>
              </div>
              <div class="stat-box">
                <div class="number">${v.totalFTTH}</div>
                <div class="label">Clientes FTTH</div>
              </div>
            </div>

            <div class="severity-chart">
              <h3 style="margin-bottom: 15px;">Por Severidad</h3>
              <div class="severity-item">
                <div class="label">SL1 · Crítica</div>
                <div class="bar"><div class="bar-fill" style="width: ${v.count ? (100 * v.sl1 / v.count) : 0}%; background: #D43A2F;"></div></div>
                <div class="count">${v.sl1}</div>
              </div>
              <div class="severity-item">
                <div class="label">SL2 · Alta</div>
                <div class="bar"><div class="bar-fill" style="width: ${v.count ? (100 * v.sl2 / v.count) : 0}%; background: #FF7900;"></div></div>
                <div class="count">${v.sl2}</div>
              </div>
              <div class="severity-item">
                <div class="label">SL3 · Media</div>
                <div class="bar"><div class="bar-fill" style="width: ${v.count ? (100 * v.sl3 / v.count) : 0}%; background: #E6A100;"></div></div>
                <div class="count">${v.sl3}</div>
              </div>
            </div>

            <div style="margin-top: 30px; padding: 15px; background: #000; color: #fff; border-radius: 8px;">
              <div style="text-align: center;">
                <div style="font-size: 12px; color: #999;">REPORTADAS AL MINISTERIO</div>
                <div style="font-size: 32px; font-weight: bold; color: #FF7900; margin: 10px 0;">${ministryCount}</div>
                <div style="font-size: 12px; color: #999;">CON IMPACTO EN PLATAFORMA</div>
                <div style="font-size: 24px; font-weight: bold; color: #fff;">${platformCount}</div>
              </div>
            </div>
          </div>

          <!-- Incidencias -->
          ${inc.map((it, idx) => {
            const sv = sev(it.severity);
            const sevColor = sv.color.replace('#', '');
            return `
              <div class="page incident">
                <div class="incident-header">
                  <div class="severity-badge" style="background: ${sv.color};">${it.severity}</div>
                  <h3>${it.title || it.category}</h3>
                  <div class="meta">${it.group} · ${it.system || '—'}</div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                  <div>
                    <div style="font-size: 10px; color: #8A857C; font-weight: bold;">ID</div>
                    <div style="font-size: 12px;">${it.ticket || '—'}</div>
                  </div>
                  <div>
                    <div style="font-size: 10px; color: #8A857C; font-weight: bold;">FECHA</div>
                    <div style="font-size: 12px;">${it.date || '—'}</div>
                  </div>
                  <div>
                    <div style="font-size: 10px; color: #8A857C; font-weight: bold;">DURACIÓN</div>
                    <div style="font-size: 12px; color: #FF7900; font-weight: bold;">${it.duration || '—'}</div>
                  </div>
                </div>

                <div class="incident-content">
                  <div>
                    <div class="incident-section">
                      <h4>IMPACTO</h4>
                      <p>${it.impact || '—'}</p>
                    </div>
                  </div>
                  <div>
                    <div class="incident-section">
                      <h4>CAUSA</h4>
                      <p>${it.cause || '—'}</p>
                    </div>
                  </div>
                </div>

                <div class="incident-section" style="margin-top: 15px;">
                  <h4>SOLUCIÓN</h4>
                  <p>${it.solution || '—'}</p>
                </div>

                <div class="brands">
                  <strong>Marcas afectadas:</strong> ${it.brands || '—'}
                  <div class="flags">
                    ${it.ministry ? '<div class="flag">● Reportada al Ministerio</div>' : ''}
                    ${it.platform ? '<div class="flag">● Impacto en plataforma</div>' : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </body>
        </html>
      `;

      const element = document.createElement('div');
      element.innerHTML = htmlContent;

      const opt = {
        margin: 0,
        filename: `${reportId}_ReporteIncidencias.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
      };

      html2pdf().set(opt).from(element).save();
    } catch (error) {
      alert('Error al descargar PDF: ' + error.message);
      console.error(error);
    }
  },

  async downloadPPTX(reportId) {
    try {
      if (!window.PptxGenJS) { alert('La librería de PowerPoint aún se está cargando, inténtalo de nuevo en unos segundos.'); return; }

      const report = await ApiClient.getReport(reportId);
      const P = new window.PptxGenJS();
      P.defineLayout({ name: 'W', width: 13.333, height: 7.5 });
      P.layout = 'W';

      const ORANGE = 'FF7900', BLACK = '000000', WHITE = 'FFFFFF', GREY = '8A857C', INK = '0C0B09', LINE = 'DEDAD3', MUT = '5C5852';
      const m = report, inc = report.incidents || [];

      // Compute statistics
      const count = inc.length;
      const itCount = inc.filter(i => (i.group || '').includes('IT')).length;
      const redCount = count - itCount;
      const sl1 = inc.filter(i => i.severity === 'SL1').length;
      const sl2 = inc.filter(i => i.severity === 'SL2').length;
      const sl3 = inc.filter(i => i.severity === 'SL3').length;
      const totalMin = inc.reduce((a, i) => a + parseDurMin(i.duration), 0);
      const ftth = inc.reduce((a, i) => a + num(i.cFTTH), 0);
      const mob = inc.reduce((a, i) => a + num(i.cMobile), 0);
      const ministryCount = inc.filter(i => i.ministry).length;
      const platformCount = inc.filter(i => i.platform).length;

      const v = { count, itCount, redCount, sl1, sl2, sl3, ministryCount, platformCount, totalDuration: fmtDur(totalMin), totalFTTH: fmtK(ftth), totalMobile: fmtK(mob) };

      // Portada
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

      // Resumen ejecutivo
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
      [['SL1 · Crítica', v.sl1, 'D43A2F'], ['SL2 · Alta', v.sl2, ORANGE], ['SL3 · Media', v.sl3, 'E6A100']].forEach((r, i) => {
        const y = 4.95 + i * 0.62;
        s.addText(r[0], { x: 0.8, y, w: 2, h: 0.4, color: r[2], fontSize: 13, bold: true, fontFace: 'Arial' });
        s.addShape(P.ShapeType.roundRect, { x: 2.9, y: y + 0.08, w: 5, h: 0.22, fill: { color: 'EFEDE9' }, rectRadius: 0.11 });
        const w = v.count ? Math.max(0.1, 5 * r[1] / v.count) : 0.1;
        s.addShape(P.ShapeType.roundRect, { x: 2.9, y: y + 0.08, w, h: 0.22, fill: { color: r[2] }, rectRadius: 0.11 });
        s.addText(String(r[1]), { x: 8.0, y, w: 0.55, h: 0.4, align: 'right', color: INK, fontSize: 15, bold: true, fontFace: 'Arial' });
      });
      s.addShape(P.ShapeType.roundRect, { x: 8.95, y: 4.15, w: 3.88, h: 2.85, fill: { color: BLACK }, rectRadius: 0.1 });
      s.addText('REPORTADAS AL MINISTERIO', { x: 9.25, y: 4.35, w: 3.3, h: 0.35, align: 'center', color: 'B8B2A9', fontSize: 11, bold: true, charSpacing: 1, fontFace: 'Arial' });
      s.addText(String(v.ministryCount), { x: 9.25, y: 4.62, w: 3.3, h: 0.75, align: 'center', color: ORANGE, fontSize: 40, bold: true, fontFace: 'Arial' });
      s.addShape(P.ShapeType.line, { x: 9.25, y: 5.55, w: 3.3, h: 0, line: { color: '2A2823', width: 1 } });
      s.addText('CON IMPACTO EN PLATAFORMA', { x: 9.25, y: 5.7, w: 3.3, h: 0.35, align: 'center', color: 'B8B2A9', fontSize: 11, bold: true, charSpacing: 1, fontFace: 'Arial' });
      s.addText(String(v.platformCount), { x: 9.25, y: 5.97, w: 3.3, h: 0.75, align: 'center', color: WHITE, fontSize: 40, bold: true, fontFace: 'Arial' });

      // Slides de incidencias
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
        sl.addText(it.solution || '', { x: 9.15, y: colY + 0.65, w: 3.65, h: colH, color: '26241F', fontSize: 12.5, fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.05 });
        sl.addShape(P.ShapeType.rect, { x: 0, y: 6.95, w: 13.333, h: 0.55, fill: { color: 'F7F6F4' } });
        sl.addText('MARCAS:  ' + (it.brands || '—'), { x: 0.55, y: 6.95, w: 8, h: 0.55, color: '5C5852', fontSize: 11, valign: 'middle', fontFace: 'Arial' });
        const flags = [];
        if (it.ministry) flags.push({ text: '● Reportada al Ministerio', options: { color: ORANGE, bold: true } });
        if (it.platform) { if (flags.length) flags.push({ text: '     ', options: {} }); flags.push({ text: '● Impacto en plataforma', options: { color: MUT, bold: true } }); }
        if (flags.length) sl.addText(flags, { x: 6.5, y: 6.95, w: 6.3, h: 0.55, align: 'right', fontSize: 11, valign: 'middle', fontFace: 'Arial' });
      });

      P.writeFile({ fileName: reportId + '_ReporteIncidencias.pptx' });
    } catch (error) {
      alert('Error al descargar PPT: ' + error.message);
      console.error(error);
    }
  },

  triggerImport() {
    document.getElementById('fileInput').click();
  },

  async handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        await ApiClient.importReport(data);
        alert('Informe importado exitosamente');
        await this.loadReports();
        document.getElementById('fileInput').value = '';
      } catch (error) {
        alert('Error al importar: ' + error.message);
      }
    };
    reader.readAsText(file);
  },

  async changeStatus(reportId, newStatus) {
    try {
      const update = { status: newStatus };
      await ApiClient.updateReport(reportId, update);
      await this.loadReports();
      console.log(`✓ Estado de ${reportId} cambiado a ${newStatus}`);
    } catch (error) {
      alert('Error al cambiar estado: ' + error.message);
      await this.loadReports(); // Recargar para restaurar el estado anterior
    }
  },
};

document.addEventListener('DOMContentLoaded', () => HomePage.init());
