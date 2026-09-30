/* ============================================================
   MASORANGE Top Bar — componente de navegación corporativo
   ============================================================
   Fuente única de la navegación cruzada entre los dashboards del portal.
   Cada página incluye un <div id="mo-topbar-root" data-active="...">
   vacío; este script lo rellena con el markup .mo-topbar (estilos
   en assets/topbar.css) marcando la pestaña activa.
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
    var active = root.dataset.active;
    var navLinks = NAV_ITEMS.map(function (item) {
      var cls = item.id === active ? ' class="active"' : '';
      return '<a href="' + item.href + '"' + cls + '>' + item.label + '</a>';
    }).join('');

    var logoSrc = root.dataset.logo || 'assets/orange-logo.svg';

    root.innerHTML =
      '<div class="mo-topbar">' +
        '<img src="' + logoSrc + '" onerror="if(this.src!=\'/dashboards/assets/orange-logo.svg\')this.src=\'/dashboards/assets/orange-logo.svg\'" alt="Orange">' +
        '<div class="mo-topbar-sep"></div>' +
        '<span class="mo-topbar-dept">Customer &amp; Service Operations</span>' +
        '<nav class="mo-topbar-nav">' + navLinks + '</nav>' +
      '</div>';
  }

  window.MoTopbar = { render: render };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
