const HomePage = {
  reports: [],
  currentEditId: null,

  async init() {
    console.log('Inicializando HomePage...');

    // Check backend connection
    const health = await ApiClient.healthCheck();
    if (!health) {
      alert('⚠️ No se puede conectar al backend. Asegúrate de que el servidor FastAPI está corriendo en http://localhost:8000');
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
          <button class="btn btn-secondary btn-small" onclick="HomePage.downloadReport('${report.id}')">Descargar</button>
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

  async downloadReport(reportId) {
    try {
      const report = await ApiClient.exportReport(reportId);
      const json = JSON.stringify(report, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportId}_ReporteIncidencias.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error al descargar el informe: ' + error.message);
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
