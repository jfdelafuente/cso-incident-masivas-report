/* ============================================================
   MASORANGE — Barra Superior Unificada (Portal Shell)
   ============================================================
   Fuente única y canónica de la navegación cruzada entre plataformas:
   - Portal (/dashboards/portal/)
   - Incidencias masivas (/dashboards/massive-incidents/)
   - Release (/dashboards/postmortem/)
   - KPIs Release (/dashboards/release-kpis/)
   - Reportes de Incidencias (/reportes-incidencias/index.html)
   - Gestión de Problemas (/problemas)
   ============================================================ */

(function () {
  var NAV_ITEMS = [
    { id: 'portal', label: 'Portal', href: '/dashboards/portal/' },
    { id: 'massive-incidents', label: 'Incidencias masivas', href: '/dashboards/massive-incidents/' },
    { id: 'postmortem', label: 'Release', href: '/dashboards/postmortem/' },
    { id: 'release-kpis', label: 'KPIs Release', href: '/dashboards/release-kpis/' },
    { id: 'reportes-incidencias', label: 'Reportes de Incidencias', href: '/reportes-incidencias/index.html' },
    { id: 'problemas', label: 'Gestión de Problemas', href: '/problemas' }
  ];

  function render() {
    var root = document.getElementById('mo-topbar-root');
    if (!root) return;
    var active = root.dataset.active || '';

    var navLinks = NAV_ITEMS.map(function (item) {
      var isActive = item.id === active;
      var cls = isActive ? ' class="active" aria-current="page"' : '';
      return '<a href="' + item.href + '"' + cls + '>' + item.label + '</a>';
    }).join('');

    var logoSrc = root.dataset.logo || '/dashboards/assets/orange-logo.svg';

    root.innerHTML =
      '<div class="mo-topbar" role="banner">' +
        '<a href="/dashboards/portal/" class="mo-topbar-brand" aria-label="Ir al Portal de Fiabilidad">' +
          '<img src="' + logoSrc + '" onerror="if(this.src!=\'/dashboards/assets/orange-logo.svg\')this.src=\'/dashboards/assets/orange-logo.svg\'" alt="Orange">' +
        '</a>' +
        '<div class="mo-topbar-sep" aria-hidden="true"></div>' +
        '<span class="mo-topbar-dept">Customer &amp; Service Operations</span>' +
        '<nav class="mo-topbar-nav" aria-label="Navegación principal">' + navLinks + '</nav>' +
      '</div>';
  }

  window.MoTopbar = { render: render, navItems: NAV_ITEMS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
