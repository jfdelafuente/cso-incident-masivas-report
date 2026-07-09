// Shared with app.js via report-render.js (loaded before this script).
const { sev, parseDurMin, fmtDur, fmtK, num, metricsArr, actionPointsArr, computeStats, buildPptxDeck } = window.ReportRender;

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

    document.getElementById('statusFilter').addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.renderReports();
    });
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
    const noResultsEl = document.getElementById('noResultsState');

    if (this.reports.length === 0) {
      listEl.innerHTML = '';
      noResultsEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';

    const filtered = this.statusFilter === 'all'
      ? this.reports
      : this.reports.filter(r => r.status === this.statusFilter);

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      noResultsEl.style.display = 'block';
      return;
    }
    noResultsEl.style.display = 'none';

    listEl.innerHTML = filtered.map(report => `
      <div class="report-card">
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
      const inc = report.incidents || [];
      const v = computeStats(inc);

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
            .incident-section p { font-size: 11px; line-height: 1.5; color: #5C5852; white-space: pre-line; }
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
