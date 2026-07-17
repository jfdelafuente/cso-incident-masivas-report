(function () {
  "use strict";

// Shared with app.js via report-render.js (loaded before this script).
const { sev, parseDurMin, fmtDur, fmtK, num, metricsArr, actionPointsArr, computeStats, highlightIncident, truncateText, weekdayBreakdown, sortIncidents, groupIncidentsForSlides, buildPptxDeck } = window.ReportRender;

const HomePage = {
  reports: [],
  currentEditId: null,
  statusFilter: 'all',

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

  setStatusFilter(value) {
    this.statusFilter = value;
    this.renderReports();
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

  // Same year/week formula used to default the "Nuevo Informe" modal, so
  // the dashboard's "semana actual" section always matches what a brand
  // new report would be filed under today. Uses real ISO 8601 week
  // numbering (Monday-first, week 1 = the week containing the year's
  // first Thursday) -- a naive "day of year / 7" formula drifts off the
  // ISO week by one for most years (e.g. it under-counted by exactly 1
  // for 2026, since Jan 1 2026 falls on a Thursday), which showed the
  // *previous* week's report as "current" instead of this week's.
  currentYearWeek() {
    const today = new Date();
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday this week
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
    return { year: d.getUTCFullYear(), week };
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

    // The status filter only narrows "Otras semanas" -- the current week's
    // report is always shown regardless of it, so it can't ever hide the
    // one report you're most likely here to check on.
    const { year: curYear, week: curWeek } = this.currentYearWeek();
    const isCurrentWeek = (r) => r.year === curYear && r.week === curWeek;
    const currentWeekReports = this.reports.filter(isCurrentWeek);
    const allOtherReports = this.reports.filter(r => !isCurrentWeek(r));
    const otherReportsFiltered = this.statusFilter === 'all'
      ? allOtherReports
      : allOtherReports.filter(r => r.status === this.statusFilter);

    let html = '';
    if (currentWeekReports.length) {
      html += '<div class="reports-section-title">Semana actual</div>';
      html += `<div class="reports-grid">${currentWeekReports.map(r => this.reportCardHtml(r, true)).join('')}</div>`;
    }
    if (allOtherReports.length) {
      html += currentWeekReports.length ? '<div class="reports-section-title">Otras semanas</div>' : '';
      html += this.statusFilterHtml();
      html += otherReportsFiltered.length
        ? this.reportsTableHtml(otherReportsFiltered)
        : '<div class="no-results">Ningún informe de otras semanas coincide con el filtro seleccionado.</div>';
    }
    listEl.innerHTML = html;
  },

  statusFilterHtml() {
    const opt = (value, label) =>
      `<option value="${value}" ${this.statusFilter === value ? 'selected' : ''}>${label}</option>`;
    return `
      <div class="reports-table-controls">
        <select class="status-filter" onchange="HomePage.setStatusFilter(this.value)">
          ${opt('all', 'Todos los estados')}
          ${opt('draft', 'Borrador')}
          ${opt('reviewed', 'Revisado')}
          ${opt('published', 'Publicado')}
        </select>
      </div>
    `;
  },

  reportsTableHtml(reports) {
    return `
      <table class="reports-table">
        <thead>
          <tr>
            <th>Informe</th>
            <th>Estado</th>
            <th>Rango</th>
            <th>Dpto</th>
            <th>Incidencias</th>
            <th>Creado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${reports.map(r => this.reportRowHtml(r)).join('')}
        </tbody>
      </table>
    `;
  },

  reportRowHtml(report) {
    return `
      <tr>
        <td class="report-id">${report.id}</td>
        <td>
          <select class="status-badge status-${report.status}" onchange="HomePage.changeStatus('${report.id}', this.value)">
            <option value="draft" ${report.status === 'draft' ? 'selected' : ''}>Draft</option>
            <option value="reviewed" ${report.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
            <option value="published" ${report.status === 'published' ? 'selected' : ''}>Published</option>
          </select>
        </td>
        <td>${report.range}</td>
        <td>${report.dept}</td>
        <td>${report.incidents.length}</td>
        <td>${new Date(report.createdAt).toLocaleDateString('es-ES')}</td>
        <td>
          <div class="table-actions">
            <a href="editor.html?report=${report.id}" class="btn btn-primary btn-small">Editar</a>
            <a href="preview.html?report=${report.id}" class="btn btn-success btn-small">Ver</a>
            <select class="action-select" onchange="HomePage.handleExportAction('${report.id}', this.value); this.value='';">
              <option value="" selected disabled>Exportar</option>
              <option value="pdf">📄 PDF</option>
              <option value="pptx">📊 PowerPoint</option>
              <option value="duplicate">📋 Duplicar</option>
            </select>
            <select class="action-select danger" onchange="HomePage.deleteReport('${report.id}'); this.value='';">
              <option value="" selected disabled>Borrar</option>
              <option value="delete">🗑 Confirmar</option>
            </select>
          </div>
        </td>
      </tr>
    `;
  },

  reportCardHtml(report, isCurrentWeek) {
    return `
      <div class="report-card${isCurrentWeek ? ' current-week' : ''}">
        <div class="report-header">
          <div class="report-id">${report.id}</div>
          <select class="status-badge status-${report.status}" onchange="HomePage.changeStatus('${report.id}', this.value)">
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
          <div class="action-row-primary">
            <a href="editor.html?report=${report.id}" class="btn btn-primary btn-small">Editar</a>
            <a href="preview.html?report=${report.id}" class="btn btn-success btn-small">👁 Ver Informe</a>
          </div>
          <select class="action-select" onchange="HomePage.handleExportAction('${report.id}', this.value); this.value='';">
            <option value="" selected disabled>Exportar</option>
            <option value="pdf">📄 Descargar PDF</option>
            <option value="pptx">📊 Descargar PowerPoint</option>
            <option value="duplicate">📋 Duplicar informe</option>
          </select>
          <select class="action-select danger" onchange="HomePage.deleteReport('${report.id}'); this.value='';">
            <option value="" selected disabled>Borrar</option>
            <option value="delete">🗑 Confirmar borrado</option>
          </select>
        </div>
      </div>
    `;
  },

  openNewReportModal() {
    this.currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Nuevo Informe';
    document.getElementById('reportForm').reset();

    const { year, week } = this.currentYearWeek();
    document.getElementById('formYear').value = year;
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

  handleExportAction(reportId, action) {
    if (action === 'pdf') this.downloadPDF(reportId);
    else if (action === 'pptx') this.downloadPPTX(reportId);
    else if (action === 'duplicate') this.openDuplicateModal(reportId);
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
      const inc = sortIncidents(report.incidents);
      const v = computeStats(inc);
      const wk = weekdayBreakdown(inc);
      const wkMax = Math.max(1, ...wk.flatMap(d => [d.it, d.red]));

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

            /* Grupo de incidencias con la misma Grupo+Severidad+Categoría
               en una sola slide (ver groupIncidentsForSlides()): cabecera
               compartida (se muestra una sola vez, ya que Grupo/Severidad/
               Categoría son idénticos por definición) + un panel por
               incidencia, separados por un borde visible para que cada
               una sea inequívocamente distinguible (SC-003). */
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
            <h1>Reporte de Incidencias</h1>
            <div class="subtitle">${report.year} · SEMANA ${report.week}</div>
            <p style="margin-top: 30px; font-size: 16px;">${report.range}</p>
            <p style="margin-top: 15px; font-size: 14px; color: #8A857C;">${report.dept}</p>
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
                <div class="label">${label}</div>
              </div>`).join('')}
            </div>

            <div class="severity-chart">
              <h3 style="margin-bottom: 15px;">Por Severidad</h3>
              ${[['SL1-Emergencia', v.emergencia, '#D43A2F'], ['SL2-Crítica', v.critica, '#FF7900'], ['SL3 · Media', v.sl3, '#E6A100']].map(([label, val, color]) => `
              <div class="severity-item">
                <div class="label">${label}</div>
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
                <div class="weekday-label">${d.label}</div>
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
                // Same section accent colors as the per-incident slide
                // (Causa=ink, Solución=green), plus orange for Métricas to
                // match the "Impacto" column's accent there.
                const metricRows = metricsArr(hi.metrics);
                const blocks = [];
                if (hi.cause) blocks.push({ label: 'Causa', color: '#0C0B09', kind: 'text', text: hi.cause });
                if (metricRows.length) blocks.push({ label: 'Métricas', color: '#FF7900', kind: 'metrics', rows: metricRows });
                if (hi.solution) blocks.push({ label: 'Solución', color: '#1D8754', kind: 'text', text: hi.solution });
                return `
                <div>
                  ${label}
                  <div class="highlight-card">
                    <span class="badge" style="background:${sv.color};">${sv.label}</span>
                    <div class="title">${truncateText(hi.title, 110)}</div>
                    ${blocks.map(b => `
                    <div class="section">
                      <div class="section-label" style="color:${b.color}; border-color:${b.color};">${b.label}</div>
                      ${b.kind === 'metrics'
                        ? b.rows.map(m => `<div class="metric-row"><span class="m-label">${m.label}</span><span class="m-value">${m.value}</span></div>`).join('')
                        : `<div class="section-text">${b.text}</div>`}
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
              return `
                <div class="page incident">
                  <div class="incident-header">
                    <div class="severity-badge" style="background: ${sv.color};">${sv.label}</div>
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

                  <div class="incident-section" style="margin-top: 15px;">
                    <h4>ACTION POINTS</h4>
                    ${actionPointsArr(it.actionPoints).length
                      ? actionPointsArr(it.actionPoints).map(ap => `<p><strong>${[ap.ap, ap.tipo].filter(Boolean).join(' · ')}:</strong> ${ap.desc}</p>`).join('')
                      : '<p>—</p>'}
                  </div>

                  <div class="brands">
                    <strong>Marcas afectadas:</strong> ${it.brands || '—'}
                    <div class="flags">
                      ${it.ministry ? '<div class="flag">● Reportada al Ministerio</div>' : ''}
                      ${it.platform ? '<div class="flag">● Impacto en plataforma</div>' : ''}
                      ${it.externalOrigin ? '<div class="flag">● Origen Externo</div>' : ''}
                    </div>
                  </div>
                </div>
              `;
            }

            // Grupo de 2 o 3 incidencias con la misma Grupo+Severidad+
            // Categoría (ver groupIncidentsForSlides()): cabecera compartida
            // (se muestra una sola vez) + un panel por incidencia, separados
            // por un borde visible (.incident-panel + su mini-cabecera en
            // negrita) para que cada una sea inequívocamente distinguible
            // (SC-003). Grupos de 3 omiten ACTION POINTS (FR-005).
            const first = group[0];
            const sv = sev(first.severity);
            const includeActionPoints = group.length === 2;
            const panelsHtml = group.map(it => {
              const flags = [
                it.ministry ? '● Reportada al Ministerio' : '',
                it.platform ? '● Impacto en plataforma' : '',
                it.externalOrigin ? '● Origen Externo' : '',
              ].filter(Boolean);
              return `
                <div class="incident-panel">
                  <div class="mini-header">
                    <div class="mini-title">${it.title || it.category || ''}${it.system ? ` · ${it.system}` : ''}</div>
                    <div class="mini-meta"><span class="ticket">${it.ticket || '—'}</span><br>${it.date || '—'} · <span class="dur">${it.duration || '—'}</span></div>
                  </div>
                  ${flags.length ? `<div class="flags" style="margin:0 0 6px;">${flags.map(f => `<div class="flag" style="font-size:9.5px;">${f}</div>`).join('')}</div>` : ''}
                  <h4>IMPACTO</h4>
                  <p>${it.impact || '—'}</p>
                  <h4>CAUSA</h4>
                  <p>${it.cause || '—'}</p>
                  <h4>SOLUCIÓN</h4>
                  <p>${it.solution || '—'}</p>
                  ${includeActionPoints ? `
                  <h4>ACTION POINTS</h4>
                  ${actionPointsArr(it.actionPoints).length
                    ? actionPointsArr(it.actionPoints).map(ap => `<p><strong>${[ap.ap, ap.tipo].filter(Boolean).join(' · ')}:</strong> ${ap.desc}</p>`).join('')
                    : '<p>—</p>'}` : ''}
                  <div class="brands"><strong>Marcas:</strong> ${it.brands || '—'}</div>
                </div>
              `;
            }).join('');
            return `
              <div class="page incident">
                <div class="incident-group-header">
                  <span class="severity-badge" style="background: ${sv.color};">${sv.label}</span>
                  <div class="category">${first.category || ''}</div>
                  <div class="subtitle">${first.group} · ${group.length} incidencias con esta misma clasificación</div>
                </div>
                <div class="incident-panels">${panelsHtml}</div>
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
      buildPptxDeck(P, report, report.incidents || []);
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
        // Tolerate the editor's own "Guardar JSON" export shape, which nests
        // year/week/range/dept under `meta` instead of at the top level
        // (POST /api/reports expects them flat -- there's no separate
        // import endpoint, importing a report is just creating one).
        const payload = data.meta
          ? Object.assign({}, data.meta, { incidents: data.incidents || [] })
          : data;
        await ApiClient.createReport(payload);
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

// Expose globally: the report cards' rendered HTML calls HomePage.xxx()
// from inline onclick/onchange attributes, which resolve against the
// global scope regardless of this IIFE.
window.HomePage = HomePage;
})();
