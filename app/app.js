(function () {
  "use strict";

  const STORAGE_KEY = 'mo_inc_report_v1';

  // Shared with home.js via report-render.js (loaded before this script).
  const { sev, areaOf, severityOptions, parseDurMin, fmtDur, fmtK, num, metricsArr, actionPointsArr, BRAND_LOGOS_PPTX, computeStats, highlightIncident, truncateText, weekdayBreakdown, compareIncidents, sortIncidents, buildPptxDeck } = window.ReportRender;

  function defaultMeta() {
    return { dept: 'Customer & Service Operations', year: '2026', week: '26', range: '22 – 26 junio 2026' };
  }

  function seed() {
    return [
      { group:'IT OSP/JZZ', severity:'SL2', category:'Degradación', system:'TEIDE', title:'Dificultad en la suplantación de SFID en tienda', ticket:'INC000004059314', date:'25/06/2026 9:31', duration:'12h 29min', impact:'Afectación generalizada a tiendas Orange y BackOffice, con especial impacto en ATAC Guadalajara, Salamanca y Jerez.', metrics:'', cause:'Desalineación entre sistemas GDU y Teide en la gestión de usuarios. Una modificación en GDU lanzó una sincronización, eliminando el SFID en Teide para un conjunto de usuarios.', solution:'Reasignación de los SFID a los usuarios afectados para restablecer el servicio. Apertura de análisis técnico para revisar el flujo de sincronización y control de cambios en GDU.', actionPoints:'', cFTTH:'', cMobile:'', brands:'Orange, Jazztel', ministry:false, platform:false, externalOrigin:false, featured:false },
      { group:'IT MM', severity:'SL1', category:'Indisponibilidad', system:'Prepago Qvantel', title:'Indisponibilidad de prepago Lebara y Llamaya', ticket:'OPIT-917709', date:'26/06/2026 17:53', duration:'3h 15min', impact:'Indisponibilidad de activaciones, recargas y bonos para las marcas de prepago de Lebara y Llamaya.', metrics:'', cause:'Lanzamiento masivo de bonos a Venezuela, de forma simultánea desde un gestor de campañas desconocido, que saturaron el sistema.', solution:'Se detuvo la ejecución masiva de bonos para Venezuela, recuperando el rendimiento habitual del aplicativo y mitigando el impacto.', actionPoints:'', cFTTH:'', cMobile:'', brands:'Lebara, Llamaya', ministry:false, platform:false, externalOrigin:false, featured:false },
      { group:'RED >5.000 clientes', severity:'CRITICA', category:'Pérdida de servicio FTTH y móvil', system:'Corte de fibra · Telefónica', title:'Pérdida de servicio FTTH y móvil en la provincia de Málaga', ticket:'2606X52817 / 2606X52728', date:'22/06/2026 13:05', duration:'0h 31min', impact:'', metrics:'FTTH | 10,6K\nMóvil | 7,3K (32 nodos)\nTTs MM/KRT | 33\nTTs OSP/JZZ | 84\nLlamadas Brújula | 11', cause:'Corte de fibra en red de Telefónica.', solution:'Recuperado tras intervención de TESA.', actionPoints:'', cFTTH:'10.6', cMobile:'7.3', brands:'MásMóvil, Orange, Jazztel', ministry:false, platform:false, externalOrigin:true, featured:false },
      { group:'RED >5.000 clientes', severity:'EMERGENCIA', category:'Pérdida de servicio móvil', system:'TP + corte TX', title:'Pérdida de servicio móvil en la provincia de Badajoz', ticket:'2606Y32050', date:'24/06/2026 2:03', duration:'0h 17min', impact:'', metrics:'Móvil | 34,6K (170 nodos)\nLlamadas Brújula | 3', cause:'Ejecución del TPZ2026060297749 (migración de software a la versión 24.10.R7 de agregadores Nokia) coincidiendo con corte de TX de TFCA.', solution:'Recuperado tras finalización del impacto del TP.', actionPoints:'', cFTTH:'', cMobile:'34.6', brands:'MásMóvil', ministry:false, platform:false, externalOrigin:false, featured:false },
      { group:'RED >5.000 clientes', severity:'CRITICA', category:'Pérdida de servicio móvil', system:'Corte de fibra · RS VDF', title:'Pérdida de servicio móvil en Guadalajara, Ciudad Real y Toledo', ticket:'2606Y84202', date:'25/06/2026 9:20', duration:'1h 30min', impact:'', metrics:'Móvil | 3,4K (45 nodos)\nLlamadas Brújula | 9', cause:'Caída de 45 nodos RS VDF por un corte de fibra.', solution:'Recuperado tras re-enrutar el servicio.', actionPoints:'', cFTTH:'', cMobile:'3.4', brands:'MásMóvil', ministry:false, platform:false, externalOrigin:false, featured:false },
      { group:'RED >5.000 clientes', severity:'EMERGENCIA', category:'Pérdida de servicio móvil', system:'Doble corte TX · Telefónica', title:'Pérdida de servicio móvil en la isla de La Palma (Tenerife)', ticket:'2606Y92535', date:'25/06/2026 12:15', duration:'12h 25min', impact:'Reportada al Ministerio al cumplirse los criterios definidos en cuanto a impacto y duración.', metrics:'Móvil | 6,5K (22 nodos)\nLlamadas Brújula | 443', cause:'Caída de 22 nodos RS VDF por un doble corte de transmisión en red de Telefónica.', solution:'Recuperado tras recuperar TESA uno de los cortes.', actionPoints:'', cFTTH:'', cMobile:'6.5', brands:'MásMóvil', ministry:true, platform:false, externalOrigin:false, featured:false },
      { group:'RED >5.000 clientes', severity:'EMERGENCIA', category:'Pérdida de servicio FTTH y móvil', system:'Doble corte TX · Telefónica', title:'Pérdida de servicio FTTH y móvil en la provincia de Valencia', ticket:'2606Z04580', date:'25/06/2026 16:55', duration:'2h 4min', impact:'', metrics:'FTTH | 58,6K\nMóvil | 2,5K (12 nodos)\nTTs MM/KRT | 3.352\nTTs OSP/JZZ | 4.410\nLlamadas Brújula | 80', cause:'Doble corte de transmisión en red de Telefónica.', solution:'Recuperado tras reparar ambos cortes por parte de Telefónica.', actionPoints:'', cFTTH:'58.6', cMobile:'2.5', brands:'MásMóvil, Orange, Jazztel', ministry:false, platform:false, externalOrigin:false, featured:false },
      { group:'Otras RED', severity:'CRITICA', category:'Saturación en enlaces IP', system:'Enlace Lyntia Madrid–Sevilla', title:'Saturación IP Madrid–Sevilla en marcas exMM (Andalucía y Canarias)', ticket:'2606X47269', date:'22/06/2026 11:30', duration:'1h 50min', impact:'', metrics:'Capacidad | 800GB → 200GB\nTTs MM/KRT | 60 (Fibra) + 290 (TV)\nTTs OSP/JZZ | 0', cause:'Corte de enlace de Lyntia entre Madrid y Sevilla debido a un corte eléctrico.', solution:'Servicio recuperado tras instalar grupo electrógeno por parte de Lyntia.', actionPoints:'', cFTTH:'', cMobile:'', brands:'MásMóvil, Yoigo', ministry:false, platform:false, externalOrigin:false, featured:false },
    ];
  }

  function titleOrCat(inc) {
    return inc.title || [inc.category, inc.system].filter(Boolean).join(' · ') || 'Incidencia';
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const BRAND_LOGOS_COVER = [
    ['orange', 'Orange', 25], ['yoigo', 'Yoigo', 22], ['jazztel', 'Jazztel', 20], ['masmovil', 'MásMóvil', 16],
    ['pepephone', 'Pepephone', 17], ['simyo', 'Simyo', 21], ['llamaya', 'Llamaya', 22], ['lebara', 'Lebara', 18],
    ['euskaltel', 'Euskaltel', 20], ['r', 'R', 25], ['telecable', 'Telecable', 26], ['guuk', 'Guuk', 22],
    ['embou', 'Embou', 21], ['populoos', 'Populoos', 18],
  ];

  const LOGO_SVG_SMALL = '<svg viewBox="0 0 1353.9 616.08" style="height:26px; width:auto; flex:none;"><path d="M244.59 8.3h110.29v244.57H244.59zM0 252.87h244.57v110.29H0zm354.89 0h244.57v110.29H354.89zm-.01 110.9H244.59v244.57h110.29z" fill="#ff7900"></path><path d="M1246.6 252.85c-24.12-93.64-108.5-160.6-209.87-160.6s-187.88 66.96-212.37 160.6H717.75C743.59 105.59 873.45 0 1035.85 0s292.12 106.19 318.05 252.85zm-209.87 270.98c100.07 0 184.81-67.47 209.45-160.69h107.48c-26.58 146.1-155.96 252.94-317.77 252.94S744.7 509.29 718.12 363.14h106.74c25.2 93.22 111.79 160.69 211.87 160.69" fill="#ffffff" fill-rule="evenodd"></path></svg>';
  const LOGO_SVG_LARGE = '<svg viewBox="0 0 1353.9 616.08" style="height:42px;"><path d="M244.59 8.3h110.29v244.57H244.59zM0 252.87h244.57v110.29H0zm354.89 0h244.57v110.29H354.89zm-.01 110.9H244.59v244.57h110.29z" fill="#ff7900"></path><path d="M1246.6 252.85c-24.12-93.64-108.5-160.6-209.87-160.6s-187.88 66.96-212.37 160.6H717.75C743.59 105.59 873.45 0 1035.85 0s292.12 106.19 318.05 252.85zm-209.87 270.98c100.07 0 184.81-67.47 209.45-160.69h107.48c-26.58 146.1-155.96 252.94-317.77 252.94S744.7 509.29 718.12 363.14h106.74c25.2 93.22 111.79 160.69 211.87 160.69" fill="#ffffff" fill-rule="evenodd"></path></svg>';

  const App = {
    state: null,
    els: {},

    init() {
      this.els.incidentsList = document.getElementById('incidentsList');
      this.els.deck = document.getElementById('deck');
      this.els.stage = document.getElementById('stage');
      this.els.incCount = document.getElementById('incCount');
      this.els.metaYear = document.getElementById('metaYear');
      this.els.metaWeek = document.getElementById('metaWeek');
      this.els.metaRange = document.getElementById('metaRange');
      this.els.metaDept = document.getElementById('metaDept');
      this.els.fileInput = document.getElementById('fileInput');

      this.state = this.load();

      this.bindStaticEvents();
      this.renderMetaInputs();
      this.renderSidebarList();
      this.renderDeck();

      this.fit = this.fit.bind(this);
      this.fit();
      this._ro = new ResizeObserver(this.fit);
      this._ro.observe(this.els.stage);
      window.addEventListener('beforeprint', this.fit);

      // Setup resizable panel
      this.setupResizePanel();
    },

    setupResizePanel() {
      const editPanel = document.getElementById('editPanel');
      const resizeHandle = document.getElementById('resizeHandle');
      if (!editPanel || !resizeHandle) return;

      const STORAGE_KEY_WIDTH = 'mo_panel_width';
      const MIN_WIDTH = 300;
      const MAX_WIDTH = window.innerWidth * 0.7;
      const DEFAULT_WIDTH = 430;

      // Load saved width
      let savedWidth = null;
      try { savedWidth = parseInt(localStorage.getItem(STORAGE_KEY_WIDTH)); } catch (e) {}
      if (savedWidth && savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) {
        editPanel.style.width = savedWidth + 'px';
      }

      let isResizing = false;
      let startX = 0;
      let startWidth = 0;

      resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = editPanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const diff = e.clientX - startX;
        let newWidth = startWidth + diff;
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
        editPanel.style.width = newWidth + 'px';
        resizeHandle.style.background = '#5C5852';
      });

      document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
        resizeHandle.style.background = '#3C3934';
        try { localStorage.setItem(STORAGE_KEY_WIDTH, editPanel.offsetWidth); } catch (e) {}
      });

      // Hover effect
      resizeHandle.addEventListener('mouseenter', () => {
        if (!isResizing) resizeHandle.style.background = '#5C5852';
      });

      resizeHandle.addEventListener('mouseleave', () => {
        if (!isResizing) resizeHandle.style.background = '#3C3934';
      });
    },

    // ---- persistence ----
    load() {
      let init = null;
      try { init = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
      if (!init || !Array.isArray(init.incidents)) init = { meta: defaultMeta(), incidents: seed(), openIdx: 0 };
      init.meta = Object.assign(defaultMeta(), init.meta || {});
      if (init.openIdx === undefined) init.openIdx = 0;
      return init;
    },
    save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ meta: this.state.meta, incidents: this.state.incidents, openIdx: this.state.openIdx })); } catch (e) {}
      document.dispatchEvent(new Event('incident-changed'));
    },

    // ---- derived values ----
    computed() {
      return computeStats(this.state.incidents);
    },
    fileBase() { return this.state.meta.year + 'W' + String(this.state.meta.week).padStart(2, '0') + '_ReporteIncidencias'; },
    coverWeek() { return this.state.meta.year + ' · Semana ' + this.state.meta.week; },

    // ---- layout fit ----
    fit() {
      const st = this.els.stage, dk = this.els.deck;
      if (!st || !dk) return;
      const avail = st.clientWidth - 56;
      dk.style.zoom = Math.min(1, avail / 1280);
    },

    // ---- static bindings ----
    renderMetaInputs() {
      // Only render if elements exist (they may not in preview/other pages)
      if (this.els.metaYear) this.els.metaYear.value = this.state.meta.year;
      if (this.els.metaWeek) this.els.metaWeek.value = this.state.meta.week;
      if (this.els.metaRange) this.els.metaRange.value = this.state.meta.range;
      if (this.els.metaDept) this.els.metaDept.value = this.state.meta.dept;
    },
    bindStaticEvents() {
      // Defensive event binding - only bind if element exists
      const on = (id, ev, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev, fn);
      };

      on('metaYear', 'input', e => this.onMeta('year', e.target.value));
      on('metaWeek', 'input', e => this.onMeta('week', e.target.value));
      on('metaRange', 'input', e => this.onMeta('range', e.target.value));
      on('metaDept', 'input', e => this.onMeta('dept', e.target.value));
      on('btnAdd', 'click', () => this.addIncident());
      on('btnImport', 'click', () => this.els.fileInput ? this.els.fileInput.click() : null);
      on('fileInput', 'change', e => this.onFile(e));
      on('btnTemplate', 'click', () => this.downloadTemplate());
      on('btnExportJSON', 'click', () => this.exportJSON());
      on('btnExportPDF', 'click', () => window.print());
      on('btnExportPPTX', 'click', () => this.exportPPTX());

      if (this.els.incidentsList) {
        this.els.incidentsList.addEventListener('click', (e) => this.onListClick(e));
        this.els.incidentsList.addEventListener('input', (e) => this.onListInput(e));
        this.els.incidentsList.addEventListener('change', (e) => this.onListChange(e));
      }
    },

    onMeta(k, v) {
      this.state.meta[k] = v;
      this.renderDeck();
      this.save();
    },

    // ---- incident CRUD ----
    addIncident() {
      this.state.incidents.push({ group: 'RED >5.000 clientes', severity: 'CRITICA', category: '', system: '', title: 'Nueva incidencia', ticket: '', date: '', duration: '0h 0min', impact: '', metrics: '', cause: '', solution: '', actionPoints: '', cFTTH: '', cMobile: '', brands: '', ministry: false, platform: false, externalOrigin: false, featured: false });
      this.state.openIdx = this.state.incidents.length - 1;
      this.renderSidebarList();
      this.renderDeck();
      this.save();
    },
    removeIncident(i) {
      this.state.incidents.splice(i, 1);
      this.state.openIdx = -1;
      this.renderSidebarList();
      this.renderDeck();
      this.save();
    },
    toggle(i) {
      this.state.openIdx = this.state.openIdx === i ? -1 : i;
      this.renderSidebarList();
      this.save();
    },

    onListClick(e) {
      const removeBtn = e.target.closest('[data-role="remove"]');
      if (removeBtn) {
        e.stopPropagation();
        this.removeIncident(+removeBtn.dataset.i);
        return;
      }
      const header = e.target.closest('[data-role="header"]');
      if (header) this.toggle(+header.dataset.i);
    },
    onListInput(e) {
      const t = e.target;
      const f = t.dataset.f;
      if (!f || t.tagName === 'SELECT' || t.type === 'checkbox') return;
      const i = +t.dataset.i;
      this.state.incidents[i][f] = t.value;
      this.afterFieldChange(i);
    },
    onListChange(e) {
      const t = e.target;
      const f = t.dataset.f;
      if (!f) return;
      if (t.tagName !== 'SELECT' && t.type !== 'checkbox') return;
      const i = +t.dataset.i;
      const inc = this.state.incidents[i];
      inc[f] = t.type === 'checkbox' ? t.checked : t.value;
      if (f === 'group') {
        // Severity options depend on the group's area (IT: SL1-3, RED:
        // Emergencia/Crítica) -- if the incident's current severity isn't
        // valid for the new group, reset it and re-render the row so its
        // Severidad <select> shows the right option list.
        const valid = severityOptions(inc.group);
        if (!valid.some(([k]) => k === inc.severity)) inc.severity = valid[0][0];
        this.renderSidebarList();
      }
      this.afterFieldChange(i);
    },
    afterFieldChange(i) {
      this.updateRowHeader(i);
      this.renderDeck();
      this.save();
    },
    updateRowHeader(i) {
      const row = this.els.incidentsList.querySelector('[data-row="' + i + '"]');
      if (!row) return;
      const inc = this.state.incidents[i];
      const s = sev(inc.severity);
      const dot = row.querySelector('[data-role="dot"]');
      const grp = row.querySelector('[data-role="group"]');
      const title = row.querySelector('[data-role="title"]');
      if (dot) dot.style.background = s.color;
      if (grp) grp.textContent = inc.group;
      if (title) title.textContent = titleOrCat(inc);
    },

    // ---- sidebar rendering ----
    // Displays incidents sorted (group, then date/time) without reordering
    // the underlying state.incidents array -- sorts the *indexes* instead,
    // so each row's data-i/data-row still points at the incident's real
    // position for editing/removal, and CSV/JSON export keeps insertion order.
    sortedIncidentIndexes() {
      return this.state.incidents.map((_, i) => i).sort((a, b) => compareIncidents(this.state.incidents[a], this.state.incidents[b]));
    },
    renderSidebarList() {
      const c = this.computed();
      // Only render if elements exist (they may not in preview/other pages)
      if (this.els.incCount) this.els.incCount.textContent = c.count;
      if (this.els.incidentsList) this.els.incidentsList.innerHTML = this.sortedIncidentIndexes().map(idx => this.rowTemplate(this.state.incidents[idx], idx)).join('');
    },
    rowTemplate(inc, idx) {
      const isOpen = this.state.openIdx === idx;
      const s = sev(inc.severity);
      const title = titleOrCat(inc);
      return (
        '<div class="mo-row" data-row="' + idx + '" style="border:1px solid #DEDAD3; border-radius:9px; overflow:hidden; background:#fff;">' +
          '<div class="mo-incrow" data-role="header" data-i="' + idx + '" style="display:flex; align-items:center; gap:9px; padding:10px 12px; cursor:pointer; background:#F7F6F4;">' +
            '<span data-role="dot" style="width:9px; height:9px; border-radius:50%; flex:none; background:' + s.color + ';"></span>' +
            '<div style="flex:1; min-width:0;">' +
              '<div data-role="group" style="font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#FF7900;">' + esc(inc.group) + '</div>' +
              '<div data-role="title" style="font-size:12px; font-weight:600; color:#26241F; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(title) + '</div>' +
            '</div>' +
            '<button class="mo-btn" data-role="remove" data-i="' + idx + '" style="flex:none; width:24px; height:24px; border:1px solid #DEDAD3; border-radius:6px; background:#fff; color:#8A857C; font-size:14px; line-height:1; cursor:pointer;">×</button>' +
          '</div>' +
          (isOpen ? this.rowDetailTemplate(inc, idx) : '') +
        '</div>'
      );
    },
    rowDetailTemplate(inc, idx) {
      const lbl = 'font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#8A857C; display:block; margin-bottom:3px;';
      const inp = 'width:100%; padding:6px 8px; border:1px solid #DEDAD3; border-radius:6px; font-size:11.5px;';
      const sel = (val, opt) => val === opt ? ' selected' : '';
      const chk = (v) => v ? ' checked' : '';
      return (
        '<div style="padding:12px; display:flex; flex-direction:column; gap:9px; border-top:1px solid #EFEDE9;">' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">' +
            '<label><span style="' + lbl + '">Grupo</span>' +
              '<select data-i="' + idx + '" data-f="group" style="' + inp + ' background:#fff;">' +
                '<option value="IT OSP/JZZ"' + sel(inc.group, 'IT OSP/JZZ') + '>IT OSP/JZZ</option>' +
                '<option value="IT MM"' + sel(inc.group, 'IT MM') + '>IT MM</option>' +
                '<option value="RED &gt;5.000 clientes"' + sel(inc.group, 'RED >5.000 clientes') + '>RED &gt;5.000 clientes</option>' +
                '<option value="Otras RED"' + sel(inc.group, 'Otras RED') + '>Otras RED</option>' +
                '<option value="RED - Relevantes por duración/Climatología/Escalados RRII"' + sel(inc.group, 'RED - Relevantes por duración/Climatología/Escalados RRII') + '>RED - Relevantes por duración/Climatología/Escalados RRII</option>' +
                '<option value="RED - Impacto B2B"' + sel(inc.group, 'RED - Impacto B2B') + '>RED - Impacto B2B</option>' +
              '</select>' +
            '</label>' +
            '<label><span style="' + lbl + '">Severidad</span>' +
              '<select data-i="' + idx + '" data-f="severity" style="' + inp + ' background:#fff;">' +
                severityOptions(inc.group).map(([k, label]) => '<option value="' + k + '"' + sel(inc.severity, k) + '>' + esc(label) + '</option>').join('') +
              '</select>' +
            '</label>' +
          '</div>' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">' +
            '<label><span style="' + lbl + '">Categoría</span><input list="mo-cat-list" data-i="' + idx + '" data-f="category" value="' + esc(inc.category) + '" style="' + inp + '"></label>' +
            '<label><span style="' + lbl + '">Sistema / origen</span><input data-i="' + idx + '" data-f="system" value="' + esc(inc.system) + '" style="' + inp + '"></label>' +
          '</div>' +
          '<label><span style="' + lbl + '">Título</span><input data-i="' + idx + '" data-f="title" value="' + esc(inc.title) + '" style="' + inp + '"></label>' +
          '<div style="display:grid; grid-template-columns:1.3fr 1fr 1fr; gap:8px;">' +
            '<label><span style="' + lbl + '">ID</span><input data-i="' + idx + '" data-f="ticket" value="' + esc(inc.ticket) + '" style="' + inp + '"></label>' +
            '<label><span style="' + lbl + '">Fecha/hora</span><input data-i="' + idx + '" data-f="date" value="' + esc(inc.date) + '" style="' + inp + '"></label>' +
            '<label><span style="' + lbl + '">Duración</span><input data-i="' + idx + '" data-f="duration" value="' + esc(inc.duration) + '" style="' + inp + '"></label>' +
          '</div>' +
          '<label><span style="' + lbl + '">Impacto</span><textarea rows="2" data-i="' + idx + '" data-f="impact" style="' + inp + '">' + esc(inc.impact) + '</textarea></label>' +
          '<label><span style="' + lbl + '">Métricas · una por línea «etiqueta | valor»</span><textarea rows="3" data-i="' + idx + '" data-f="metrics" style="' + inp + ' font-family:\'Roboto Mono\',monospace;">' + esc(inc.metrics) + '</textarea></label>' +
          '<label><span style="' + lbl + '">Causa</span><textarea rows="2" data-i="' + idx + '" data-f="cause" style="' + inp + '">' + esc(inc.cause) + '</textarea></label>' +
          '<label><span style="' + lbl + '">Solución</span><textarea rows="2" data-i="' + idx + '" data-f="solution" style="' + inp + '">' + esc(inc.solution) + '</textarea></label>' +
          '<label><span style="' + lbl + '">Action Points · una por línea «AP | Tipo de AP | Descripción»</span><textarea rows="3" data-i="' + idx + '" data-f="actionPoints" style="' + inp + ' font-family:\'Roboto Mono\',monospace;">' + esc(inc.actionPoints) + '</textarea></label>' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">' +
            '<label><span style="' + lbl + '">Clientes FTTH (miles)</span><input data-i="' + idx + '" data-f="cFTTH" value="' + esc(inc.cFTTH) + '" style="' + inp + '"></label>' +
            '<label><span style="' + lbl + '">Clientes móvil (miles)</span><input data-i="' + idx + '" data-f="cMobile" value="' + esc(inc.cMobile) + '" style="' + inp + '"></label>' +
          '</div>' +
          '<label><span style="' + lbl + '">Marcas afectadas · separadas por coma</span><input data-i="' + idx + '" data-f="brands" value="' + esc(inc.brands) + '" style="' + inp + '"></label>' +
          '<div style="display:flex; flex-direction:column; gap:8px;">' +
            '<label style="display:flex; align-items:center; gap:8px; font-size:11.5px; font-weight:600; color:#26241F; cursor:pointer;"><input type="checkbox" data-i="' + idx + '" data-f="ministry"' + chk(inc.ministry) + ' style="width:15px; height:15px; accent-color:#FF7900;"> Reportada al Ministerio</label>' +
            '<label style="display:flex; align-items:center; gap:8px; font-size:11.5px; font-weight:600; color:#26241F; cursor:pointer;"><input type="checkbox" data-i="' + idx + '" data-f="platform"' + chk(inc.platform) + ' style="width:15px; height:15px; accent-color:#FF7900;"> Impacto en plataforma</label>' +
            '<label style="display:flex; align-items:center; gap:8px; font-size:11.5px; font-weight:600; color:#26241F; cursor:pointer;"><input type="checkbox" data-i="' + idx + '" data-f="externalOrigin"' + chk(inc.externalOrigin) + ' style="width:15px; height:15px; accent-color:#FF7900;"> Origen Externo</label>' +
            '<label style="display:flex; align-items:center; gap:8px; font-size:11.5px; font-weight:600; color:#26241F; cursor:pointer;"><input type="checkbox" data-i="' + idx + '" data-f="featured"' + chk(inc.featured) + ' style="width:15px; height:15px; accent-color:#FF7900;"> Destacar en "Incidencias destacadas" (anula la selección automática de esa área)</label>' +
          '</div>' +
        '</div>'
      );
    },

    // ---- deck rendering ----
    renderDeck() {
      if (!this.els.deck) return;
      const html = this.coverTemplate() + this.dashboardTemplate() + this.weekdayTemplate() + this.highlightsTemplate() + sortIncidents(this.state.incidents).map(inc => this.incidentSlideTemplate(inc)).join('');
      this.els.deck.innerHTML = html;
      this.fit();
    },
    coverTemplate() {
      const m = this.state.meta;
      const logos = BRAND_LOGOS_COVER.map(([file, alt, h]) =>
        '<img src="assets/brands/' + file + '.png" alt="' + esc(alt) + '" style="height:' + h + 'px; width:auto; object-fit:contain;">'
      ).join('');
      return (
        '<section class="mo-slide" style="position:relative; width:1280px; height:720px; flex:none; background:#000000; color:#fff; overflow:hidden; box-shadow:0 18px 50px rgba(0,0,0,.45);">' +
          '<div style="position:absolute; top:56px; left:64px; display:flex; align-items:center; gap:16px;">' + LOGO_SVG_LARGE + '</div>' +
          '<div style="position:absolute; top:64px; right:64px; text-align:right; font-size:15px; font-weight:600; letter-spacing:0.04em; color:#B8B2A9;">' + esc(m.dept) + '</div>' +
          '<div style="position:absolute; left:64px; bottom:250px; right:64px;">' +
            '<div style="font-size:20px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:#FF7900; margin-bottom:22px;">' + esc(this.coverWeek()) + '</div>' +
            '<h1 style="margin:0; font-size:88px; font-weight:800; line-height:0.98; letter-spacing:-0.025em;">Reporte de<br>incidencias<span style="color:#FF7900;"> IT + RED</span></h1>' +
          '</div>' +
          '<div style="position:absolute; left:64px; bottom:176px; font-size:17px; color:#8A857C; letter-spacing:0.02em;">' + esc(m.range) + '</div>' +
          '<div style="position:absolute; left:0; right:0; bottom:8px; background:#fff; padding:18px 44px; display:flex; flex-wrap:nowrap; align-items:center; justify-content:center; gap:18px;">' + logos + '</div>' +
          '<div style="position:absolute; left:0; bottom:0; width:100%; height:8px; background:#FF7900;"></div>' +
        '</section>'
      );
    },
    dashboardTemplate() {
      const m = this.state.meta;
      const c = this.computed();
      const pct = (n) => (c.count ? Math.round(100 * n / c.count) : 0) + '%';
      return (
        '<section class="mo-slide" style="position:relative; width:1280px; height:720px; flex:none; background:#fff; color:#0C0B09; overflow:hidden; box-shadow:0 18px 50px rgba(0,0,0,.45); padding:56px 64px;">' +
          '<div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #000; padding-bottom:18px;">' +
            '<div>' +
              '<div style="font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.14em; color:#FF7900; margin-bottom:8px;">Resumen ejecutivo</div>' +
              '<h2 style="margin:0; font-size:46px; font-weight:800; letter-spacing:-0.02em;">La semana en cifras</h2>' +
            '</div>' +
            '<div style="text-align:right; font-size:16px; font-weight:600; color:#8A857C;">' + esc(this.coverWeek()) + ' · ' + esc(m.range) + '</div>' +
          '</div>' +
          '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:18px; margin-top:34px;">' +
            [
              [c.count, 'Incidencias totales', c.itCount + ' IT · ' + c.redCount + ' RED', '#0C0B09'],
              [c.ministryCount, 'Reportadas al Ministerio', 'incidencias con criterios de notificación', '#FF7900'],
              [c.platformCount, 'Impacto en plataforma', 'incidencias con afectación de plataforma', '#0C0B09'],
              [c.externalOriginCount, 'Origen Externo', 'incidencias con origen fuera de la operadora', '#0C0B09'],
            ].map(([n, label, sub, color]) =>
              '<div style="border:1px solid #DEDAD3; border-radius:14px; padding:24px;">' +
                '<div style="font-size:56px; font-weight:800; line-height:1; letter-spacing:-0.03em; color:' + color + ';">' + n + '</div>' +
                '<div style="font-size:14px; color:#5C5852; margin-top:10px; font-weight:600;">' + label + '</div>' +
                '<div style="font-size:12.5px; color:#8A857C; margin-top:4px;">' + sub + '</div>' +
              '</div>'
            ).join('') +
          '</div>' +
          '<div style="border:1px solid #DEDAD3; border-radius:14px; padding:24px; margin-top:30px;">' +
            '<div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#8A857C; margin-bottom:18px;">Por severidad</div>' +
            '<div style="display:flex; flex-direction:column; gap:14px;">' +
              [['SL1-Emergencia', c.emergencia, '#D43A2F'], ['SL2-Crítica', c.critica, '#FF7900'], ['SL3 · Media', c.sl3, '#E6A100']].map(([label, val, color]) =>
                '<div style="display:flex; align-items:center; gap:14px;">' +
                  '<span style="width:120px; font-size:13px; font-weight:700; color:' + color + ';">' + label + '</span>' +
                  '<div style="flex:1; height:14px; background:#EFEDE9; border-radius:7px; overflow:hidden;"><div style="height:100%; width:' + pct(val) + '; background:' + color + '; border-radius:7px;"></div></div>' +
                  '<span style="width:28px; text-align:center; font-size:16px; font-weight:800;">' + val + '</span>' +
                '</div>'
              ).join('') +
            '</div>' +
          '</div>' +
        '</section>'
      );
    },
    weekdayTemplate() {
      const wk = weekdayBreakdown(this.state.incidents);
      const maxCount = Math.max(1, ...wk.flatMap(d => [d.it, d.red]));
      const barMaxH = 240;
      return (
        '<section class="mo-slide" style="position:relative; width:1280px; height:720px; flex:none; background:#fff; color:#0C0B09; overflow:hidden; box-shadow:0 18px 50px rgba(0,0,0,.45); padding:56px 64px;">' +
          '<div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #000; padding-bottom:18px;">' +
            '<div>' +
              '<div style="font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.14em; color:#FF7900; margin-bottom:8px;">Resumen ejecutivo</div>' +
              '<h2 style="margin:0; font-size:46px; font-weight:800; letter-spacing:-0.02em;">Incidencias por día de la semana</h2>' +
            '</div>' +
            '<div style="display:flex; gap:20px; align-items:center; font-size:13px; font-weight:700; color:#5C5852;">' +
              '<span style="display:flex; align-items:center; gap:8px;"><span style="width:14px; height:14px; border-radius:3px; background:#0C0B09; display:inline-block;"></span>IT</span>' +
              '<span style="display:flex; align-items:center; gap:8px;"><span style="width:14px; height:14px; border-radius:3px; background:#FF7900; display:inline-block;"></span>RED</span>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex; align-items:flex-end; justify-content:space-between; gap:18px; height:' + barMaxH + 'px; margin-top:56px; padding:0 12px;">' +
            wk.map(d => {
              const itH = Math.round(barMaxH * d.it / maxCount);
              const redH = Math.round(barMaxH * d.red / maxCount);
              return (
                '<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%;">' +
                  '<div style="display:flex; align-items:flex-end; gap:8px; height:' + barMaxH + 'px;">' +
                    '<div style="width:34px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end;">' +
                      (d.it ? '<div style="font-size:13px; font-weight:800; margin-bottom:4px;">' + d.it + '</div>' : '') +
                      '<div style="width:100%; height:' + itH + 'px; background:#0C0B09; border-radius:5px 5px 0 0;"></div>' +
                    '</div>' +
                    '<div style="width:34px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end;">' +
                      (d.red ? '<div style="font-size:13px; font-weight:800; color:#FF7900; margin-bottom:4px;">' + d.red + '</div>' : '') +
                      '<div style="width:100%; height:' + redH + 'px; background:#FF7900; border-radius:5px 5px 0 0;"></div>' +
                    '</div>' +
                  '</div>' +
                  '<div style="margin-top:14px; font-size:14px; font-weight:700; color:#5C5852;">' + d.label + '</div>' +
                '</div>'
              );
            }).join('') +
          '</div>' +
        '</section>'
      );
    },
    highlightsTemplate() {
      const cardHtml = (area) => {
        const hi = highlightIncident(this.state.incidents, area);
        if (!hi) {
          return (
            '<div style="border-radius:14px; background:#F7F6F4; padding:24px; flex:1; min-height:0; display:flex; align-items:center; justify-content:center;">' +
              '<div style="font-size:15px; color:#8A857C; font-style:italic;">Sin incidencias ' + esc(area) + ' esta semana</div>' +
            '</div>'
          );
        }
        const sv = sev(hi.severity);
        // Same section accent colors as the per-incident slide (Causa=ink,
        // Solución=green), plus orange for Métricas to match the
        // "Impacto" column's accent there.
        const metricRows = metricsArr(hi.metrics);
        const blocks = [];
        if (hi.cause) blocks.push({ label: 'CAUSA', color: '#0C0B09', kind: 'text', text: hi.cause });
        if (metricRows.length) blocks.push({ label: 'MÉTRICAS', color: '#FF7900', kind: 'metrics', rows: metricRows });
        if (hi.solution) blocks.push({ label: 'SOLUCIÓN', color: '#1D8754', kind: 'text', text: hi.solution });
        return (
          '<div style="border-radius:14px; background:#F7F6F4; padding:20px 24px; flex:1; min-height:0; overflow:hidden; display:flex; flex-direction:column;">' +
            '<span style="align-self:flex-start; padding:5px 14px; border-radius:999px; background:' + sv.color + '; color:#fff; font-size:11.5px; font-weight:700; letter-spacing:0.02em;">' + esc(sv.label) + '</span>' +
            '<div style="margin-top:10px; font-size:17px; font-weight:800; line-height:1.25;">' + esc(truncateText(hi.title, 80)) + '</div>' +
            '<div style="margin-top:8px; flex:1; min-height:0; display:flex; flex-direction:column; gap:10px;">' +
              blocks.map(b =>
                '<div style="flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden;">' +
                  '<div style="display:inline-block; width:fit-content; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:' + b.color + '; padding-bottom:4px; border-bottom:2px solid ' + b.color + ';">' + b.label + '</div>' +
                  (b.kind === 'metrics'
                    ? '<div style="margin-top:6px; display:flex; flex-direction:column; gap:4px; overflow:hidden;">' +
                        b.rows.map(m =>
                          '<div style="display:flex; justify-content:space-between; gap:10px; font-size:11.5px;">' +
                            '<span style="color:#5C5852;">' + esc(m.label) + '</span>' +
                            '<span style="font-weight:700; color:#26241F;">' + esc(m.value) + '</span>' +
                          '</div>'
                        ).join('') +
                      '</div>'
                    : '<div style="margin-top:6px; font-size:11.5px; color:#26241F; line-height:1.4; white-space:pre-line; overflow:hidden;">' + esc(b.text) + '</div>'
                  ) +
                '</div>'
              ).join('') +
            '</div>' +
          '</div>'
        );
      };
      return (
        '<section class="mo-slide" style="position:relative; width:1280px; height:720px; flex:none; background:#fff; color:#0C0B09; overflow:hidden; box-shadow:0 18px 50px rgba(0,0,0,.45); padding:56px 64px; display:flex; flex-direction:column;">' +
          '<div style="border-bottom:3px solid #000; padding-bottom:18px; flex:none;">' +
            '<div style="font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.14em; color:#FF7900; margin-bottom:8px;">Resumen ejecutivo</div>' +
            '<h2 style="margin:0; font-size:46px; font-weight:800; letter-spacing:-0.02em;">Incidencias destacadas</h2>' +
          '</div>' +
          '<div style="display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:30px; flex:1; min-height:0;">' +
            '<div style="display:flex; flex-direction:column; min-height:0;">' +
              '<div style="font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.14em; color:#0C0B09; margin-bottom:10px; flex:none;">IT</div>' +
              cardHtml('IT') +
            '</div>' +
            '<div style="display:flex; flex-direction:column; min-height:0;">' +
              '<div style="font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.14em; color:#FF7900; margin-bottom:10px; flex:none;">RED</div>' +
              cardHtml('RED') +
            '</div>' +
          '</div>' +
        '</section>'
      );
    },
    incidentSlideTemplate(inc) {
      const s = sev(inc.severity);
      const title = titleOrCat(inc);
      const tagLine = [inc.category, inc.system].filter(Boolean).join('  ·  ');
      const hasTags = !!tagLine;
      const metricList = metricsArr(inc.metrics);
      const hasMetrics = metricList.length > 0;
      const hasImpact = !!(inc.impact && inc.impact.trim());
      const actionPointList = actionPointsArr(inc.actionPoints);
      const hasActionPoints = actionPointList.length > 0;
      const brandList = String(inc.brands || '').split(',').map(x => x.trim()).filter(Boolean);

      const metricsHtml = hasMetrics
        ? '<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">' +
            metricList.map(m =>
              '<div style="display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:8px 12px; background:#F7F6F4; border-radius:8px;">' +
                '<span style="font-size:13px; color:#5C5852; font-weight:500;">' + esc(m.label) + '</span>' +
                '<span style="font-size:16px; font-weight:800; color:#0C0B09; font-family:\'Roboto Mono\',monospace; text-align:right;">' + esc(m.value) + '</span>' +
              '</div>'
            ).join('') +
          '</div>'
        : '';
      const impactHtml = hasImpact ? '<div style="font-size:15px; line-height:1.5; color:#26241F; white-space:pre-line;">' + esc(inc.impact) + '</div>' : '';
      const actionPointsHtml = hasActionPoints
        ? '<div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">' +
            actionPointList.map(a =>
              '<div style="padding:8px 12px; background:#F7F6F4; border-radius:8px;">' +
                '<div style="display:flex; align-items:baseline; gap:8px; margin-bottom:2px;">' +
                  '<span style="font-size:12px; font-weight:800; color:#1D8754; font-family:\'Roboto Mono\',monospace;">' + esc(a.ap) + '</span>' +
                  (a.tipo ? '<span style="font-size:11px; font-weight:600; text-transform:uppercase; color:#5C5852;">' + esc(a.tipo) + '</span>' : '') +
                '</div>' +
                '<div style="font-size:13px; line-height:1.4; color:#26241F;">' + esc(a.desc) + '</div>' +
              '</div>'
            ).join('') +
          '</div>'
        : '';
      const brandsHtml = brandList.map(name =>
        '<span style="padding:4px 11px; border:1px solid #B8B2A9; border-radius:999px; font-size:12.5px; font-weight:600; color:#26241F;">' + esc(name) + '</span>'
      ).join('');

      return (
        '<section class="mo-slide" style="position:relative; width:1280px; height:720px; flex:none; background:#fff; color:#0C0B09; overflow:hidden; box-shadow:0 18px 50px rgba(0,0,0,.45); display:flex; flex-direction:column;">' +
          '<div style="background:#000; color:#fff; padding:34px 56px 30px; display:flex; justify-content:space-between; align-items:flex-start; gap:40px;">' +
            '<div style="flex:1; min-width:0;">' +
              '<div style="display:flex; align-items:center; gap:14px; margin-bottom:14px;">' +
                '<span style="font-size:15px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:#FF7900;">' + esc(inc.group) + '</span>' +
                '<span style="display:inline-flex; align-items:center; gap:7px; padding:5px 13px; border-radius:999px; background:' + s.color + '; font-size:12.5px; font-weight:700; color:#fff; letter-spacing:0.02em;">' + esc(s.label) + '</span>' +
                (inc.ministry ? '<span style="padding:5px 13px; border-radius:999px; border:1.5px solid #FF7900; font-size:12px; font-weight:700; color:#FF7900; letter-spacing:0.02em;">Ministerio</span>' : '') +
                (inc.platform ? '<span style="padding:5px 13px; border-radius:999px; border:1.5px solid #B8B2A9; font-size:12px; font-weight:700; color:#fff; letter-spacing:0.02em;">Plataforma</span>' : '') +
                (inc.externalOrigin ? '<span style="padding:5px 13px; border-radius:999px; border:1.5px solid #fff; font-size:12px; font-weight:700; color:#fff; letter-spacing:0.02em;">Origen Externo</span>' : '') +
              '</div>' +
              '<h2 style="margin:0; font-size:34px; font-weight:800; line-height:1.08; letter-spacing:-0.02em;">' + esc(title) + '</h2>' +
              (hasTags ? '<div style="margin-top:10px; font-size:15px; color:#B8B2A9; font-weight:500;">' + esc(tagLine) + '</div>' : '') +
            '</div>' +
            '<div style="flex:none; display:flex; gap:30px; text-align:right;">' +
              '<div><div style="font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#8A857C; margin-bottom:5px;">ID</div><div style="font-size:15px; font-weight:600; font-family:\'Roboto Mono\',monospace;">' + esc(inc.ticket) + '</div></div>' +
              '<div><div style="font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#8A857C; margin-bottom:5px;">Fecha</div><div style="font-size:15px; font-weight:600;">' + esc(inc.date) + '</div></div>' +
              '<div><div style="font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#8A857C; margin-bottom:5px;">Duración</div><div style="font-size:15px; font-weight:700; color:#FF7900;">' + esc(inc.duration) + '</div></div>' +
            '</div>' +
          '</div>' +
          '<div style="flex:1; display:grid; grid-template-columns:1.15fr 1fr 1fr; gap:0; min-height:0;">' +
            '<div style="padding:30px 32px; border-right:1px solid #EFEDE9; display:flex; flex-direction:column; min-height:0;">' +
              '<div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#26241F; padding-bottom:8px; border-bottom:2px solid #FF7900; margin-bottom:16px; align-self:flex-start;">Impacto</div>' +
              metricsHtml + impactHtml +
            '</div>' +
            '<div style="padding:30px 32px; border-right:1px solid #EFEDE9; display:flex; flex-direction:column;">' +
              '<div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#26241F; padding-bottom:8px; border-bottom:2px solid #000; margin-bottom:16px; align-self:flex-start;">Causa</div>' +
              '<div style="font-size:15px; line-height:1.5; color:#26241F; white-space:pre-line;">' + esc(inc.cause) + '</div>' +
            '</div>' +
            '<div style="padding:30px 32px; display:flex; flex-direction:column;">' +
              '<div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#26241F; padding-bottom:8px; border-bottom:2px solid #1D8754; margin-bottom:16px; align-self:flex-start;">Solución</div>' +
              '<div style="font-size:15px; line-height:1.5; color:#26241F; white-space:pre-line;">' + esc(inc.solution) + '</div>' +
              actionPointsHtml +
            '</div>' +
          '</div>' +
          '<div style="flex:none; padding:16px 56px; border-top:1px solid #EFEDE9; background:#F7F6F4; display:flex; align-items:center; justify-content:space-between; gap:16px;">' +
            '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
              '<span style="font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:#8A857C; margin-right:4px;">Marcas</span>' +
              brandsHtml +
            '</div>' +
            '<div style="font-size:11px; color:#B8B2A9; letter-spacing:0.04em; font-weight:600;">' + esc(this.coverWeek()) + ' · MASORANGE</div>' +
          '</div>' +
        '</section>'
      );
    },

    // ---- import / export ----
    onFile(e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          if (/\.csv$/i.test(f.name)) {
            this.importCSV(String(r.result));
          } else {
            const d = JSON.parse(String(r.result));
            this.state.meta = Object.assign(defaultMeta(), d.meta || {});
            this.state.incidents = (d.incidents || d).map(x => Object.assign({}, x));
            this.state.openIdx = -1;
            this.renderMetaInputs();
            this.renderSidebarList();
            this.renderDeck();
            this.save();
          }
        } catch (err) {
          alert('No se pudo leer el archivo: ' + err.message);
        }
      };
      r.readAsText(f);
      e.target.value = '';
    },
    importCSV(text) {
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) return;
      const split = (l) => {
        const o = []; let c = '', q = false;
        for (let i = 0; i < l.length; i++) {
          const ch = l[i];
          if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; }
          else if (ch === ',' && !q) { o.push(c); c = ''; }
          else c += ch;
        }
        o.push(c);
        return o;
      };
      const head = split(lines[0]).map(h => h.trim());
      const rows = lines.slice(1).map(l => {
        const cells = split(l);
        const o = {};
        head.forEach((h, i) => o[h] = (cells[i] || '').trim());
        const group = o.group || 'Otras RED';
        return {
          group, severity: o.severity || severityOptions(group)[0][0], category: o.category || '', system: o.system || '',
          title: o.title || '', ticket: o.ticket || o.id || '', date: o.date || '', duration: o.duration || '',
          impact: o.impact || '', metrics: (o.metrics || '').replace(/\\n/g, '\n'), cause: o.cause || '', solution: o.solution || '',
          actionPoints: (o.actionPoints || '').replace(/\\n/g, '\n'),
          cFTTH: o.cFTTH || o.ftth || '', cMobile: o.cMobile || o.mobile || '', brands: o.brands || '',
          ministry: /^(1|true|si|sí|x)$/i.test(o.ministry || ''), platform: /^(1|true|si|sí|x)$/i.test(o.platform || ''),
          externalOrigin: /^(1|true|si|sí|x)$/i.test(o.externalOrigin || ''),
          featured: /^(1|true|si|sí|x)$/i.test(o.featured || ''),
        };
      });
      this.state.incidents = rows;
      this.state.openIdx = -1;
      this.renderSidebarList();
      this.renderDeck();
      this.save();
    },
    downloadTemplate() {
      const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
      const cols = ['group', 'severity', 'category', 'system', 'title', 'ticket', 'date', 'duration', 'impact', 'metrics', 'cause', 'solution', 'actionPoints', 'cFTTH', 'cMobile', 'brands', 'ministry', 'platform', 'externalOrigin', 'featured'];
      const ex = [
        ['RED >5.000 clientes', 'CRITICA', 'Pérdida de servicio FTTH y móvil', 'Corte de fibra · Telefónica', 'Pérdida de servicio en la provincia de Málaga', '2606X52817', '22/06/2026 13:05', '0h 31min', '', 'FTTH | 10,6K\\nMóvil | 7,3K (32 nodos)\\nLlamadas Brújula | 11', 'Corte de fibra en red de Telefónica.', 'Recuperado tras intervención de TESA.', 'AP1 | Seguimiento | Revisar el procedimiento de intervención de TESA para reducir el tiempo de respuesta', '10.6', '7.3', 'MásMóvil, Orange, Jazztel', '', '', 'si', ''],
        ['IT MM', 'SL1', 'Indisponibilidad', 'Prepago Qvantel', 'Indisponibilidad de prepago Lebara y Llamaya', 'OPIT-917709', '26/06/2026 17:53', '3h 15min', 'Indisponibilidad de activaciones, recargas y bonos.', '', 'Saturación del sistema por lanzamiento masivo de bonos.', 'Se detuvo la ejecución masiva, recuperando el rendimiento.', '', '', '', 'Lebara, Llamaya', '', 'si', '', ''],
        ['RED >5.000 clientes', 'EMERGENCIA', 'Pérdida de servicio móvil', 'Doble corte TX · Telefónica', 'Pérdida de servicio móvil en La Palma', '2606Y92535', '25/06/2026 12:15', '12h 25min', 'Reportada al Ministerio por impacto y duración.', 'Móvil | 6,5K (22 nodos)\\nLlamadas Brújula | 443', 'Caída de 22 nodos por doble corte de TX.', 'Recuperado tras reparar uno de los cortes.', '', '', '6.5', 'MásMóvil', 'si', '', '', 'si'],
      ];
      const lines = [cols.join(','), ...ex.map(row => row.map(q).join(','))];
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'plantilla_reporte_incidencias.csv';
      a.click();
    },
    exportJSON() {
      const data = { meta: this.state.meta, incidents: sortIncidents(this.state.incidents) };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = this.fileBase() + '.json';
      a.click();
    },
    exportPPTX() {
      if (!window.PptxGenJS) { alert('La librería de PowerPoint aún se está cargando, inténtalo de nuevo en unos segundos.'); return; }
      const P = new window.PptxGenJS();
      P.defineLayout({ name: 'W', width: 13.333, height: 7.5 });
      P.layout = 'W';
      buildPptxDeck(P, this.state.meta, this.state.incidents);
      P.writeFile({ fileName: this.fileBase() + '.pptx' });
    },
  };

  document.addEventListener('DOMContentLoaded', () => App.init());

  // Expose App globally so other scripts can access it
  window.App = App;
})();
