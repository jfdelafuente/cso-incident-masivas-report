// Editor integration with backend
// Handles loading, saving, and auto-saving of reports

const ReportEditor = {
  currentReportId: null,
  autoSaveTimer: null,
  isDirty: false,

  async init() {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('report');

    if (reportId) {
      await this.loadReport(reportId);
    } else {
      this.initializeNew();
    }

    // Setup auto-save on changes
    this.setupAutoSave();
  },

  async loadReport(reportId) {
    try {
      console.log(`Cargando informe ${reportId}...`);
      const report = await ApiClient.getReport(reportId);
      this.currentReportId = reportId;

      // Update title and status
      document.getElementById('reportTitle').textContent = reportId;
      const statusBadge = document.getElementById('reportStatusBadge');
      statusBadge.textContent = report.status;
      statusBadge.style.display = 'block';
      statusBadge.className = `report-status status-${report.status}`;

      // Load metadata
      document.getElementById('metaYear').value = report.year;
      document.getElementById('metaWeek').value = report.week;
      document.getElementById('metaRange').value = report.range;
      document.getElementById('metaDept').value = report.dept;

      // Load incidents
      if (App && App.state) {
        App.state.meta = {
          year: report.year,
          week: report.week,
          range: report.range,
          dept: report.dept,
        };
        App.state.incidents = report.incidents || [];
        App.renderSidebarList();
        App.renderDeck();
        App.fit();
      }

      console.log(`✓ Informe ${reportId} cargado`);
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

        document.getElementById('reportTitle').textContent = created.id;
        const statusBadge = document.getElementById('reportStatusBadge');
        statusBadge.textContent = 'draft';
        statusBadge.style.display = 'block';

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
};

// Initialize when app is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => ReportEditor.init(), 100);
});
