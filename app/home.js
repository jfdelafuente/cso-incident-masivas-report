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
  searchQuery: '',

  async init() {
    console.log('Inicializando HomePage...');

    // Check backend connection
    const health = await ApiClient.healthCheck();
    if (!health) {
      const backendUrl = ApiClient.baseURL || `${window.location.origin}/api`;
      if (window.Toast) {
        Toast.warning(`No se puede conectar al backend. Asegúrate de que el servidor FastAPI está accesible en ${backendUrl}`, 7000);
      } else {
        alert(`⚠️ No se puede conectar al backend. Asegúrate de que el servidor FastAPI está accesible en ${backendUrl}`);
      }
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

    const searchInput = document.getElementById('reportSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderReports();
      });
    }
  },

  setStatusFilter(value) {
    this.statusFilter = value;
    this.renderReports();
  },

  async loadReports() {
    const loadingEl = document.getElementById('loadingState');
    const listEl = document.getElementById('reportsList');
    const emptyEl = document.getElementById('emptyState');
    const kpiEl = document.getElementById('kpiSection');

    if (loadingEl) loadingEl.style.display = 'flex';
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'none';

    try {
      this.reports = await ApiClient.listReports();
      if (loadingEl) loadingEl.style.display = 'none';
      this.renderKPIs();
      this.renderReports();
    } catch (error) {
      if (loadingEl) loadingEl.style.display = 'none';
      console.error('Error loading reports:', error);
      if (window.Toast) {
        Toast.error('Error al cargar los informes: ' + error.message);
      } else {
        alert('Error al cargar los informes: ' + error.message);
      }
    }
  },

  renderKPIs() {
    const kpiSection = document.getElementById('kpiSection');
    if (!kpiSection) return;

    if (!this.reports || this.reports.length === 0) {
      kpiSection.style.display = 'none';
      return;
    }

    const { year: curYear, week: curWeek } = this.currentYearWeek();
    let active = this.reports.find(r => r.year === curYear && r.week === curWeek);
    if (!active && this.reports.length > 0) {
      active = this.reports[0];
    }

    if (!active) {
      kpiSection.style.display = 'none';
      return;
    }

    kpiSection.style.display = 'grid';

    // Week & Status
    const weekEl = document.getElementById('kpiWeek');
    if (weekEl) weekEl.textContent = `S${active.week} · ${active.year}`;

    const statusEl = document.getElementById('kpiStatus');
    if (statusEl) {
      const statusLabels = { draft: 'Borrador', reviewed: 'Revisado', published: 'Publicado' };
      statusEl.textContent = statusLabels[active.status] || active.status || 'Borrador';
    }

    // Incidents Stats
    const incs = active.incidents || [];
    const stats = typeof computeStats === 'function' ? computeStats(incs) : { count: incs.length, itCount: 0, redCount: 0, emergencia: 0, critica: 0, ministryCount: 0, platformCount: 0 };

    const totalEl = document.getElementById('kpiIncTotal');
    if (totalEl) totalEl.textContent = stats.count;

    const breakdownEl = document.getElementById('kpiIncAreaBreakdown');
    if (breakdownEl) breakdownEl.textContent = `${stats.itCount} IT · ${stats.redCount} RED`;

    // Critical (Emergencia + Crítica / SL1 + SL2)
    const critEl = document.getElementById('kpiCriticalCount');
    if (critEl) critEl.textContent = (stats.emergencia || 0) + (stats.critica || 0);

    const critBreakdownEl = document.getElementById('kpiCriticalBreakdown');
    if (critBreakdownEl) critBreakdownEl.textContent = `${stats.emergencia || 0} SL1/Emerg. · ${stats.critica || 0} SL2/Crítica`;

    // Special Attention (Ministry + Platform)
    const specialEl = document.getElementById('kpiSpecialCount');
    if (specialEl) specialEl.textContent = (stats.ministryCount || 0) + (stats.platformCount || 0);

    const specialBreakdownEl = document.getElementById('kpiSpecialBreakdown');
    if (specialBreakdownEl) specialBreakdownEl.textContent = `${stats.ministryCount || 0} Ministerio · ${stats.platformCount || 0} Plataforma`;
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
    const badgeEl = document.getElementById('searchCountBadge');

    if (this.reports.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      if (badgeEl) badgeEl.textContent = '0 informes';
      return;
    }

    emptyEl.style.display = 'none';

    const q = this.searchQuery || '';

    const matchesQuery = (r) => {
      if (!q) return true;
      if (String(r.id || '').toLowerCase().includes(q)) return true;
      if (String(r.range || '').toLowerCase().includes(q)) return true;
      if (String(r.dept || '').toLowerCase().includes(q)) return true;
      if (String(r.status || '').toLowerCase().includes(q)) return true;
      if (String(r.notes || '').toLowerCase().includes(q)) return true;
      if (`w${r.week}`.includes(q) || `semana ${r.week}`.includes(q) || `${r.year}`.includes(q)) return true;
      if ((r.incidents || []).some(inc =>
        String(inc.ticket || '').toLowerCase().includes(q) ||
        String(inc.title || '').toLowerCase().includes(q) ||
        String(inc.group || '').toLowerCase().includes(q) ||
        String(inc.category || '').toLowerCase().includes(q) ||
        String(inc.system || '').toLowerCase().includes(q)
      )) return true;
      return false;
    };

    const filteredReports = this.reports.filter(matchesQuery);

    if (badgeEl) {
      if (q) {
        badgeEl.textContent = `${filteredReports.length} de ${this.reports.length} informes`;
      } else {
        badgeEl.textContent = `${this.reports.length} informe${this.reports.length !== 1 ? 's' : ''}`;
      }
    }

    if (filteredReports.length === 0 && q) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:48px 20px; color:#8A857C;">
          <div style="font-size:32px; margin-bottom:12px;">🔍</div>
          <div style="font-size:16px; font-weight:700; color:#26241F; margin-bottom:6px;">No se encontraron informes</div>
          <div style="font-size:13px;">No hay resultados que coincidan con «<strong>${esc(q)}</strong>». Prueba con otro término.</div>
        </div>
      `;
      return;
    }

    // The status filter only narrows "Otras semanas" -- the current week's
    // report is always shown regardless of it, so it can't ever hide the
    // one report you're most likely here to check on.
    const { year: curYear, week: curWeek } = this.currentYearWeek();
    const isCurrentWeek = (r) => r.year === curYear && r.week === curWeek;
    const currentWeekReports = filteredReports.filter(isCurrentWeek);
    const allOtherReports = filteredReports.filter(r => !isCurrentWeek(r));
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
        if (window.Toast) Toast.success(`Informe ${this.currentEditId} actualizado con éxito.`);
      } else {
        const created = await ApiClient.createReport(report);
        if (window.Toast) Toast.success(`Informe ${created.id} creado con éxito.`);
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
      if (window.Toast) Toast.success(`Informe duplicado con éxito a la semana ${newWeek}.`);
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
    const confirmed = window.Toast && window.Toast.confirm
      ? await Toast.confirm(`¿Estás seguro de que quieres eliminar el informe "${reportId}"? Esta acción no se puede deshacer.`, {
          title: 'Eliminar informe',
          confirmText: 'Sí, eliminar',
          cancelText: 'Cancelar',
          danger: true
        })
      : confirm(`¿Estás seguro de que quieres borrar ${reportId}?`);

    if (!confirmed) return;

    try {
      await ApiClient.deleteReport(reportId);
      if (window.Toast) Toast.success(`Informe ${reportId} eliminado con éxito.`);
      await this.loadReports();
    } catch (error) {
      if (window.Toast) Toast.error('Error al borrar el informe: ' + error.message);
      else alert('Error al borrar el informe: ' + error.message);
    }
  },

  async downloadPDF(reportId) {
    try {
      if (window.Toast) Toast.info(`Generando PDF para ${reportId}...`, 3000);
      const report = await ApiClient.getReport(reportId);
      await downloadPdf(report, report.incidents || [], {
        filename: `${reportId}_ReporteIncidencias.pdf`
      });
      if (window.Toast) Toast.success(`PDF descargado: ${reportId}`);
    } catch (error) {
      if (window.Toast) Toast.error('Error al descargar PDF: ' + error.message);
      else alert('Error al descargar PDF: ' + error.message);
      console.error(error);
    }
  },

  async downloadPPTX(reportId) {
    try {
      if (window.Toast) Toast.info(`Generando PowerPoint para ${reportId}...`, 3000);
      const report = await ApiClient.getReport(reportId);
      downloadPptx(report, report.incidents || [], `${reportId}_ReporteIncidencias.pptx`);
      if (window.Toast) Toast.success(`PowerPoint generado: ${reportId}`);
    } catch (error) {
      if (window.Toast) Toast.error('Error al descargar PPT: ' + error.message);
      else alert('Error al descargar PPT: ' + error.message);
      console.error(error);
    }
  },

  async downloadLegacyPPTX(reportId) {
    try {
      if (window.Toast) Toast.info(`Descargando PowerPoint Legacy para ${reportId}...`, 3000);
      await ApiClient.downloadLegacyPptx(reportId);
      if (window.Toast) Toast.success('PowerPoint Legacy descargado.');
    } catch (error) {
      if (window.Toast) Toast.error('Error al descargar PowerPoint Legacy: ' + error.message);
      else alert('Error al descargar PowerPoint Legacy: ' + error.message);
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
        if (window.Toast) Toast.success('Informe importado exitosamente.');
        else alert('Informe importado exitosamente');
        await this.loadReports();
        document.getElementById('fileInput').value = '';
      } catch (error) {
        if (window.Toast) Toast.error('Error al importar: ' + error.message);
        else alert('Error al importar: ' + error.message);
      }
    };
    reader.readAsText(file);
  },

  async changeStatus(reportId, newStatus) {
    try {
      const update = { status: newStatus };
      await ApiClient.updateReport(reportId, update);
      if (window.Toast) Toast.success(`Estado de ${reportId} cambiado a ${newStatus}`);
      await this.loadReports();
      console.log(`✓ Estado de ${reportId} cambiado a ${newStatus}`);
    } catch (error) {
      if (window.Toast) Toast.error('Error al cambiar estado: ' + error.message);
      else alert('Error al cambiar estado: ' + error.message);
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
