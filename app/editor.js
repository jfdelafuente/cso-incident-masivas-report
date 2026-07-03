// Editor integration with backend
// Handles loading, saving, and auto-saving of reports

console.log('[editor.js] Script loaded');

const ReportEditor = {
  currentReportId: null,
  autoSaveTimer: null,
  isDirty: false,
  isViewMode: false,

  async init() {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('report');
    this.isViewMode = params.has('view');

    console.log('[ReportEditor] URL params:', { reportId, fullUrl: window.location.href, isViewMode: this.isViewMode });

    if (reportId) {
      console.log('[ReportEditor] Cargando informe:', reportId);
      await this.loadReport(reportId);
    } else {
      console.log('[ReportEditor] Nuevo informe (sin parámetro)');
      this.initializeNew();
    }

    // Setup auto-save on changes (only if not in view mode)
    if (!this.isViewMode) {
      this.setupAutoSave();
      this.enableEditControls();
    } else {
      this.disableEditControls();
    }
  },

  disableEditControls() {
    console.log('[ReportEditor] Desactivando controles de edición (modo visualización)');
    // Disable all input fields
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(el => {
      if (el.id !== 'reportStatusSelect') el.disabled = true;
    });

    // Disable buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      if (!btn.textContent.includes('Volver') && !btn.textContent.includes('←')) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
      }
    });

    // Update header
    const reportTitle = document.getElementById('reportTitle');
    if (reportTitle) reportTitle.textContent += ' (Visualización)';

    const statusSelect = document.getElementById('reportStatusSelect');
    if (statusSelect) statusSelect.disabled = true;
  },

  enableEditControls() {
    console.log('[ReportEditor] Activando controles de edición');
    // Enable all inputs
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(el => el.disabled = false);

    // Enable buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  },

  async loadReport(reportId) {
    try {
      console.log(`Cargando informe ${reportId}...`);
      const report = await ApiClient.getReport(reportId);
      this.currentReportId = reportId;

      // Update title and status
      const reportTitle = document.getElementById('reportTitle');
      if (reportTitle) reportTitle.textContent = reportId;

      // Load metadata
      const metaYear = document.getElementById('metaYear');
      const metaWeek = document.getElementById('metaWeek');
      const metaRange = document.getElementById('metaRange');
      const metaDept = document.getElementById('metaDept');

      if (metaYear) metaYear.value = report.year;
      if (metaWeek) metaWeek.value = report.week;
      if (metaRange) metaRange.value = report.range;
      if (metaDept) metaDept.value = report.dept;

      // Load status selector
      const statusSelect = document.getElementById('reportStatusSelect');
      if (statusSelect) {
        statusSelect.value = report.status;
        statusSelect.style.display = 'block';
      }

      // Load incidents - override any localStorage data
      if (App && App.state) {
        App.state.meta = {
          year: report.year,
          week: report.week,
          range: report.range,
          dept: report.dept,
        };
        // Use report's incidents (even if empty), don't mix with localStorage
        App.state.incidents = JSON.parse(JSON.stringify(report.incidents || []));
        App.state.openIdx = 0;
        App.renderSidebarList();
        App.renderDeck();
        App.fit();

        // Save to localStorage to ensure consistency between editor and backend
        try {
          localStorage.setItem('mo_inc_report_v1',
            JSON.stringify({ meta: App.state.meta, incidents: App.state.incidents, openIdx: App.state.openIdx }));
        } catch (e) {}
      }

      console.log(`✓ Informe ${reportId} cargado (${(report.incidents || []).length} incidencias)`);
    } catch (error) {
      console.error('Error cargando informe:', error);
      alert('Error al cargar el informe: ' + error.message);
    }
  },

  initializeNew() {
    this.currentReportId = null;
    document.getElementById('reportTitle').textContent = 'Nuevo informe';
    document.getElementById('reportStatusBadge').style.display = 'none';
  },

  setupAutoSave() {
    // Mark as dirty on metadata changes
    const metaInputs = document.querySelectorAll('#metaYear, #metaWeek, #metaRange, #metaDept');
    metaInputs.forEach(input => {
      input.addEventListener('change', () => {
        this.isDirty = true;
        this.scheduleAutoSave();
      });
    });

    // Mark as dirty on incident changes
    document.addEventListener('incident-changed', () => {
      this.isDirty = true;
      this.scheduleAutoSave();
    });
  },

  scheduleAutoSave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => this.autoSave(), 2000);
  },

  async autoSave() {
    if (!this.isDirty || !this.currentReportId) return;

    try {
      const update = {
        incidents: App.state.incidents,
      };

      await ApiClient.updateReport(this.currentReportId, update);
      this.isDirty = false;
      console.log('✓ Informe guardado automáticamente');
    } catch (error) {
      console.error('Error al guardar automáticamente:', error);
    }
  },

  async saveReport() {
    if (!this.currentReportId) {
      // Create new report
      try {
        const report = {
          year: parseInt(document.getElementById('metaYear').value),
          week: parseInt(document.getElementById('metaWeek').value),
          range: document.getElementById('metaRange').value,
          dept: document.getElementById('metaDept').value,
          incidents: App.state.incidents,
          status: 'draft',
        };

        const created = await ApiClient.createReport(report);
        this.currentReportId = created.id;

        // Update URL and UI
        const url = new URL(window.location);
        url.searchParams.set('report', created.id);
        window.history.replaceState({}, '', url);

        const reportTitle = document.getElementById('reportTitle');
        if (reportTitle) reportTitle.textContent = created.id;

        const statusSelect = document.getElementById('reportStatusSelect');
        if (statusSelect) {
          statusSelect.value = 'draft';
          statusSelect.style.display = 'block';
        }

        alert('✓ Informe creado exitosamente');
        this.isDirty = false;
      } catch (error) {
        alert('Error al crear el informe: ' + error.message);
      }
    } else {
      // Update existing
      await this.autoSave();
      alert('✓ Informe guardado');
    }
  },

  async updateStatus(newStatus) {
    if (!this.currentReportId) {
      alert('Primero debes crear el informe');
      return;
    }

    try {
      await ApiClient.updateReport(this.currentReportId, { status: newStatus });
      console.log(`✓ Estado cambiado a ${newStatus}`);
    } catch (error) {
      alert('Error al cambiar estado: ' + error.message);
      // Recargar para restaurar el estado anterior
      const statusSelect = document.getElementById('reportStatusSelect');
      if (statusSelect) {
        const report = await ApiClient.getReport(this.currentReportId);
        statusSelect.value = report.status;
      }
    }
  },
};

// Initialize when App is ready
function initEditor() {
  console.log('[initEditor] Checking if App is defined:', typeof App);
  if (typeof App === 'undefined') {
    // App not ready yet, retry after a short delay
    console.log('[initEditor] App not ready yet, retrying...');
    setTimeout(initEditor, 100);
    return;
  }
  console.log('[initEditor] App is ready, calling ReportEditor.init()');
  ReportEditor.init();
}

console.log('[editor.js] Adding DOMContentLoaded listener');
document.addEventListener('DOMContentLoaded', () => {
  console.log('[editor.js] DOMContentLoaded fired, scheduling initEditor');
  setTimeout(initEditor, 200);
});
