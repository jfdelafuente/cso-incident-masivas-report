# Frontend de Reportes de Incidencias

> ⚠️ **AVISO DE MIGRACIÓN ARQUITECTURAL**
> 
> El frontend oficial de Reportes de Incidencias ha sido migrado y centralizado en el repositorio **`release-dashboard-application`** bajo el directorio:
> `dashboards/reportes-incidencias/`
> 
> A través de esta integración:
> 1. Comparte la barra superior corporativa unificada (`dashboards/assets/topbar.js`).
> 2. Está vinculado y catalogado en el portal hub central (`/dashboards/portal/`).
> 3. Es servido por Nginx bajo `/dashboards/reportes-incidencias/` (con redirección 301 automática desde `/reportes-incidencias`).
> 4. Consume directamente la API headless FastAPI de este repositorio (`cso-incident-masivas-report/backend`) en el puerto 8000.
> 
> **Cualquier cambio futuro en la interfaz, estilos o vistas debe realizarse en `release-dashboard-application/dashboards/reportes-incidencias/`.**
