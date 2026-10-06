(function () {
  "use strict";

// Shared with app.js via report-render.js (loaded before this script).
const { sev, parseDurMin, fmtDur, fmtK, num, metricsArr, actionPointsArr, computeStats, highlightIncident, truncateText, weekdayBreakdown, sortIncidents, groupIncidentsForSlides, buildPptxDeck, buildPdfHtml, downloadPdf, downloadPptx } = window.ReportRender;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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
    const reportIdEsc = esc(report.id);
    return `
      <tr>
        <td class="report-id">${reportIdEsc}</td>
        <td>
          <select class="status-badge status-${esc(report.status)}" data-report-id="${reportIdEsc}" onchange="HomePage.changeStatus(this.dataset.reportId, this.value)">
            <option value="draft" ${report.status === 'draft' ? 'selected' : ''}>Draft</option>
            <option value="reviewed" ${report.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
            <option value="published" ${report.status === 'published' ? 'selected' : ''}>Published</option>
          </select>
        </td>
        <td>${esc(report.range)}</td>
        <td>${esc(report.dept)}</td>
        <td>${(report.incidents || []).length}</td>
        <td>${report.createdAt ? new Date(report.createdAt).toLocaleDateString('es-ES') : '-'}</td>
        <td>
          <div class="table-actions">
            <a href="editor.html?report=${encodeURIComponent(report.id)}" class="btn btn-primary btn-small">Editar</a>
            <a href="preview.html?report=${encodeURIComponent(report.id)}" class="btn btn-success btn-small">Ver</a>
            <select class="action-select" data-report-id="${reportIdEsc}" onchange="HomePage.handleExportAction(this.dataset.reportId, this.value); this.value='';">
              <option value="" selected disabled>Exportar</option>
              <option value="pdf">📄 PDF</option>
              <option value="pptx">📊 PPT (Nuevo)</option>
              <option value="pptx-legacy">🏛️ PPT (Legacy)</option>
              <option value="duplicate">📋 Duplicar</option>
            </select>
            <select class="action-select danger" data-report-id="${reportIdEsc}" onchange="HomePage.deleteReport(this.dataset.reportId); this.value='';">
              <option value="" selected disabled>Borrar</option>
              <option value="delete">🗑 Confirmar</option>
            </select>
          </div>
        </td>
      </tr>
    `;
  },

  reportCardHtml(report, isCurrentWeek) {
    const reportIdEsc = esc(report.id);
    return `
      <div class="report-card${isCurrentWeek ? ' current-week' : ''}">
        <div class="report-header">
          <div class="report-id">${reportIdEsc}</div>
          <select class="status-badge status-${esc(report.status)}" data-report-id="${reportIdEsc}" onchange="HomePage.changeStatus(this.dataset.reportId, this.value)">
            <option value="draft" ${report.status === 'draft' ? 'selected' : ''}>Draft</option>
            <option value="reviewed" ${report.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
            <option value="published" ${report.status === 'published' ? 'selected' : ''}>Published</option>
          </select>
        </div>

        <div class="report-meta">
          <div><strong>Rango:</strong> ${esc(report.range)}</div>
          <div><strong>Dpto:</strong> ${esc(report.dept)}</div>
          <div><strong>Creado:</strong> ${report.createdAt ? new Date(report.createdAt).toLocaleDateString('es-ES') : '-'}</div>
          ${report.createdBy ? `<div><strong>Por:</strong> ${esc(report.createdBy)}</div>` : ''}
        </div>

        <div class="report-incidences">
          ${(report.incidents || []).length} incidencia${(report.incidents || []).length !== 1 ? 's' : ''}
        </div>

        <div class="report-actions">
          <div class="action-row-primary">
            <a href="editor.html?report=${encodeURIComponent(report.id)}" class="btn btn-primary btn-small">Editar</a>
            <a href="preview.html?report=${encodeURIComponent(report.id)}" class="btn btn-success btn-small">👁 Ver Informe</a>
          </div>
          <select class="action-select" data-report-id="${reportIdEsc}" onchange="HomePage.handleExportAction(this.dataset.reportId, this.value); this.value='';">
            <option value="" selected disabled>Exportar</option>
            <option value="pdf">📄 Descargar PDF</option>
            <option value="pptx">📊 Descargar PowerPoint (Nuevo)</option>
            <option value="pptx-legacy">🏛️ Descargar PowerPoint (Legacy)</option>
            <option value="duplicate">📋 Duplicar informe</option>
          </select>
          <select class="action-select danger" data-report-id="${reportIdEsc}" onchange="HomePage.deleteReport(this.dataset.reportId); this.value='';">
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
    else if (action === 'pptx-legacy') this.downloadLegacyPPTX(reportId);
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
      await downloadPdf(report, report.incidents || [], {
        filename: `${reportId}_ReporteIncidencias.pdf`
      });
    } catch (error) {
      alert('Error al descargar PDF: ' + error.message);
      console.error(error);
    }
  },

  async downloadPPTX(reportId) {
    try {
      const report = await ApiClient.getReport(reportId);
      downloadPptx(report, report.incidents || [], `${reportId}_ReporteIncidencias.pptx`);
    } catch (error) {
      alert('Error al descargar PPT: ' + error.message);
      console.error(error);
    }
  },

  async downloadLegacyPPTX(reportId) {
    try {
      await ApiClient.downloadLegacyPptx(reportId);
    } catch (error) {
      alert('Error al descargar PowerPoint Legacy: ' + error.message);
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
