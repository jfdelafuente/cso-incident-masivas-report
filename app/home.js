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

      // Create HTML content for PDF
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>${reportId}</h1>
          <p><strong>Periodo:</strong> ${report.range}</p>
          <p><strong>Departamento:</strong> ${report.dept}</p>
          <p><strong>Estado:</strong> ${report.status}</p>
          <p><strong>Incidencias:</strong> ${report.incidents.length}</p>

          <hr style="margin: 20px 0;">

          <h2>Incidencias</h2>
          ${report.incidents.map(inc => `
            <div style="margin-bottom: 20px; border-left: 4px solid #FF7900; padding-left: 15px;">
              <h3>${inc.title || inc.category}</h3>
              <p><strong>Severidad:</strong> ${inc.severity}</p>
              <p><strong>Sistema:</strong> ${inc.system}</p>
              <p><strong>Duración:</strong> ${inc.duration}</p>
              <p><strong>Causa:</strong> ${inc.cause || '—'}</p>
              <p><strong>Solución:</strong> ${inc.solution || '—'}</p>
            </div>
          `).join('')}
        </div>
      `;

      const element = document.createElement('div');
      element.innerHTML = htmlContent;

      const opt = {
        margin: 10,
        filename: `${reportId}_ReporteIncidencias.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
      };

      html2pdf().set(opt).from(element).save();
    } catch (error) {
      alert('Error al descargar PDF: ' + error.message);
    }
  },

  async downloadPPTX(reportId) {
    try {
      const report = await ApiClient.getReport(reportId);

      const prs = new PptxGenJS();
      prs.defineLayout({ name: 'LAYOUT1', width: 12.5, height: 7 });
      prs.defineLayout({ name: 'BLANK', width: 12.5, height: 7 });

      // Portada
      const slide1 = prs.addSlide();
      slide1.background = { color: '000000' };
      slide1.addText('Reporte de Incidencias', {
        x: 0.5, y: 2.5, w: 11.5, h: 1,
        fontSize: 60, bold: true, color: 'FFFFFF',
        align: 'center'
      });
      slide1.addText(reportId, {
        x: 0.5, y: 3.8, w: 11.5, h: 0.5,
        fontSize: 28, color: 'FF7900',
        align: 'center'
      });
      slide1.addText(report.range, {
        x: 0.5, y: 4.5, w: 11.5, h: 0.4,
        fontSize: 16, color: '999999',
        align: 'center'
      });

      // Resumen
      const slide2 = prs.addSlide();
      slide2.background = { color: 'FFFFFF' };
      slide2.addText('Resumen Ejecutivo', {
        x: 0.5, y: 0.5, w: 11.5, h: 0.5,
        fontSize: 32, bold: true, color: '000000'
      });

      const summaryText = `
Periodo: ${report.range}
Departamento: ${report.dept}
Estado: ${report.status}
Total de Incidencias: ${report.incidents.length}

Incidencias por Severidad:
SL1: ${report.incidents.filter(i => i.severity === 'SL1').length}
SL2: ${report.incidents.filter(i => i.severity === 'SL2').length}
SL3: ${report.incidents.filter(i => i.severity === 'SL3').length}
      `;

      slide2.addText(summaryText, {
        x: 0.5, y: 1.3, w: 11.5, h: 5,
        fontSize: 14, color: '333333',
        valign: 'top'
      });

      // Slides de incidencias
      report.incidents.forEach((inc, idx) => {
        const slide = prs.addSlide();
        slide.background = { color: 'FFFFFF' };

        const colors = { 'SL1': 'D43A2F', 'SL2': 'FF7900', 'SL3': 'E6A100' };
        const sevColor = colors[inc.severity] || 'FF7900';

        slide.addText(`${idx + 1}. ${inc.title || inc.category}`, {
          x: 0.5, y: 0.5, w: 10, h: 0.6,
          fontSize: 24, bold: true, color: '000000'
        });

        slide.addText(inc.severity, {
          x: 10.8, y: 0.5, w: 1, h: 0.6,
          fontSize: 12, bold: true, color: 'FFFFFF',
          align: 'center',
          fill: { color: sevColor }
        });

        const details = `
Sistema: ${inc.system || '—'}
Categoría: ${inc.category || '—'}
Duración: ${inc.duration || '—'}
Causa: ${inc.cause || '—'}
Solución: ${inc.solution || '—'}
        `;

        slide.addText(details, {
          x: 0.5, y: 1.3, w: 11.5, h: 5,
          fontSize: 12, color: '333333',
          valign: 'top'
        });
      });

      prs.save({ fileName: `${reportId}_ReporteIncidencias.pptx` });
    } catch (error) {
      alert('Error al descargar PPT: ' + error.message);
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
