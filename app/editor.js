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
      this.setupKeyboardShortcuts();
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
      console.log(`[loadReport] Cargando informe ${reportId}...`);
      const report = await ApiClient.getReport(reportId);
      console.log(`[loadReport] Informe cargado:`, report);
      this.currentReportId = reportId;

      // Update title and status
      console.log(`[loadReport] Intentando actualizar UI...`);
      const reportTitle = document.getElementById('reportTitle');
      console.log(`[loadReport] reportTitle element:`, reportTitle);
      if (reportTitle) reportTitle.textContent = reportId;
      else console.warn('[loadReport] reportTitle es null');

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
      this.setSaveStatus('saved');
    } catch (error) {
      console.error('Error cargando informe:', error);
      if (window.Toast) Toast.error('Error al cargar el informe: ' + error.message);
      else alert('Error al cargar el informe: ' + error.message);
    }
  },

  setSaveStatus(state, msg) {
    const dot = document.getElementById('saveStatusDot');
    const text = document.getElementById('saveStatusText');
    const badge = document.getElementById('saveStatusBadge');
    if (!dot || !text || !badge) return;

    if (state === 'saving') {
      dot.style.background = '#FF7900';
      dot.style.boxShadow = '0 0 6px rgba(255,121,0,0.6)';
      text.textContent = 'Guardando...';
      badge.style.borderColor = 'rgba(255,121,0,0.4)';
    } else if (state === 'saved') {
      dot.style.background = '#28A745';
      dot.style.boxShadow = 'none';
      const timeStr = msg || new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      text.textContent = `Guardado (${timeStr})`;
      badge.style.borderColor = '#3C3934';
    } else if (state === 'error') {
      dot.style.background = '#D43A2F';
      dot.style.boxShadow = '0 0 6px rgba(212,58,47,0.6)';
      text.textContent = msg || 'Error al guardar';
      badge.style.borderColor = 'rgba(212,58,47,0.5)';
    } else if (state === 'pending') {
      dot.style.background = '#FFC107';
      dot.style.boxShadow = 'none';
      text.textContent = 'Guardando cambios...';
      badge.style.borderColor = 'rgba(255,193,7,0.4)';
    }
  },

  initializeNew() {
    this.currentReportId = null;
    document.getElementById('reportTitle').textContent = 'Nuevo informe';
    const badge = document.getElementById('reportStatusBadge');
    if (badge) badge.style.display = 'none';
    this.setSaveStatus('saved', 'Nuevo');
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

  setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ctrl+S o Cmd+S: Guardado inmediato
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveReport();
        return;
      }

      // Alt+Up / Alt+Down: Reordenación de la incidencia activa
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (typeof App !== 'undefined' && App.state) {
          const curIdx = App.state.openIdx;
          const incidents = App.state.incidents || [];
          if (curIdx >= 0 && curIdx < incidents.length) {
            const dir = e.key === 'ArrowUp' ? -1 : 1;
            const targetIdx = curIdx + dir;
            if (targetIdx >= 0 && targetIdx < incidents.length) {
              App.moveIncident(curIdx, dir);
              if (window.Toast) {
                Toast.info(`Incidencia movida a posición ${targetIdx + 1}`, 1200);
              }
            }
          }
        }
      }
    });
  },

  scheduleAutoSave() {
    clearTimeout(this.autoSaveTimer);
    this.setSaveStatus('pending');
    this.autoSaveTimer = setTimeout(() => this.autoSave(), 1500);
  },

  async autoSave() {
    if (!this.isDirty || !this.currentReportId) return;

    try {
      this.setSaveStatus('saving');
      const update = {
        range: document.getElementById('metaRange')?.value || '',
        dept: document.getElementById('metaDept')?.value || '',
        incidents: App?.state?.incidents || [],
      };

      await ApiClient.updateReport(this.currentReportId, update);
      this.isDirty = false;
      this.setSaveStatus('saved');
      console.log('✓ Informe guardado automáticamente');
    } catch (error) {
      console.error('Error al guardar automáticamente:', error);
      this.setSaveStatus('error');
      if (window.Toast) Toast.error('Error al autoguardar: ' + error.message);
    }
  },

  async saveReport() {
    if (!this.currentReportId) {
      // Create new report
      try {
        this.setSaveStatus('saving');
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

        this.setSaveStatus('saved');
        if (window.Toast) Toast.success('Informe creado exitosamente');
        else alert('✓ Informe creado exitosamente');
        this.isDirty = false;
      } catch (error) {
        this.setSaveStatus('error');
        if (window.Toast) Toast.error('Error al crear el informe: ' + error.message);
        else alert('Error al crear el informe: ' + error.message);
      }
    } else {
      // Update existing
      this.isDirty = true;
      await this.autoSave();
      if (window.Toast) Toast.success('Informe guardado correctamente');
      else alert('✓ Informe guardado');
    }
  },

  async updateStatus(newStatus) {
    if (!this.currentReportId) {
      if (window.Toast) Toast.warning('Primero debes crear el informe');
      else alert('Primero debes crear el informe');
      return;
    }

    try {
      await ApiClient.updateReport(this.currentReportId, { status: newStatus });
      if (window.Toast) Toast.success(`Estado actualizado a ${newStatus}`);
      console.log(`✓ Estado cambiado a ${newStatus}`);
    } catch (error) {
      if (window.Toast) Toast.error('Error al cambiar estado: ' + error.message);
      else alert('Error al cambiar estado: ' + error.message);
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
