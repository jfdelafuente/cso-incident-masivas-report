# Automatización de reportes semanales — Reportes de Incidencias

Herramienta interna de ORANGE que centraliza, gestiona y automatiza la elaboración de los reportes semanales de incidencias de **IT** y **RED**, convirtiendo los datos operativos en un dossier corporativo de diapositivas (vista web, PDF y PowerPoint editable) y sustituyendo la confección manual de presentaciones.

Además, actúa como **Single Source of Truth (SSOT)** y motor autónomo para la generación de Informes Ejecutivos postmortem en PowerPoint con integración de Jira y Confluence, prestando servicio a aplicaciones hermanas del departamento como **Gestión de Problemas Dashboard** (`/problemas`) y **Release Dashboard Application** (`/dashboards`).

---

## 📋 Funcionalidades Principales del Módulo

### 1. Gestión Integral de Reportes Semanales (IT + RED)

- **Control temporal por semanas**: Gestión de reportes identificados unívocamente por clave `YYYY-WXX` (ej. `2026-W42`), con ciclo de vida completo (`draft`, `reviewed`, `published`).
- **Modelo de datos especializado por área**:
  - **Incidencias IT**: Severidades `SL1`, `SL2`, `SL3` y categorización en *Indisponibilidad* o *Degradación*.
  - **Incidencias RED**: Severidades `CRITICA` y `EMERGENCIA` (exclusivas de red, nunca SL1/SL2) y categorización de afectación de red (*"Pérdida de servicio móvil"*, *"Pérdida de servicio FTTH"*, *"Pérdida de servicio FTTH y móvil"*).
- **Atributos técnicos detallados**: Sistemas afectados, marcas implicadas (Orange, Jazztel, Simyo, etc.), tickets de soporte, cronología/fechas, impacto en clientes, métricas estructuradas (`métrica | valor`), causa raíz, solución y planes de acción / APs (`AP | Tipo | Descripción`).
- **Flags de criticidad**: Detección de avisos al Ministerio, afectación a plataformas transversales, origen externo y selección manual o automática de *incidencia destacada* (`featured`).

### 2. Generación Automatizada de Presentaciones (PPTX y PDF)

- **Exportación PowerPoint corporativa**: Genera presentaciones `.pptx` editables 100% fieles a la plantilla oficial de ORANGE (`legacy_template.pptx`) mediante `python-pptx` en backend (`export_legacy_pptx.py`).
- **Agrupación inteligente de diapositivas**:
  - Clustered slides: Agrupa incidencias que comparten mismo Grupo + Severidad + Categoría (hasta 3 incidencias por diapositiva para optimizar el espacio).
  - Diapositivas detalladas individuales para incidencias de mayor extensión o criticidad.
- **Resumen ejecutivo semanal**: Cálculo automático de estadísticas consolidadas, desglose por días y marcas, y selección inteligente de la incidencia más destacada por severidad y duración (con soporte para fijado manual).
- **Exportación en cliente**: Generación de vistas web interactivas, exportación a PDF y PPTX cliente mediante `pptxgenjs`.

### 3. Motor Autónomo de Informes Ejecutivos Postmortem (`report_generator/`)

- **Parser de Confluence y Jira**: Extrae y normaliza descripciones en formato wiki markup/HTML de Confluence, cronología de eventos, árboles de causas y tablas de puntos de acción.
- **Generador de PPTX ejecutivo**: Produce presentaciones ejecutivas de alto impacto visual orientadas a comités de dirección para incidencias postmortem individuales.
- **Modo asíncrono y caché**: Soporta generación en segundo plano (`asyncMode=True` -> HTTP `202 Accepted` con sondeo de estado `/status`), almacenamiento persistente en disco desacoplado y limpieza/rotación automática programada.

### 4. Herramientas CLI de Ingesta e Inferencia Inteligente (`scripts/`)

- **Importador desde PowerPoint (`import_pptx.py`)**: Ingiere presentaciones `.pptx` existentes o recibidas por correo, extrayendo textos, tarjetas de incidencias, fechas y datos técnicos en formato JSON listo para la base de datos.
- **Reglas de inferencia automática**:
  - **IT**: Infiere severidad `SL1` si el título indica indisponibilidad (de lo contrario `SL2`) y categoría *Indisponibilidad* o *Degradación*.
  - **RED**: Infiere severidad `EMERGENCIA` o `CRITICA` y categorías de afectación de red móvil/FTTH.
- **Inspección de plantillas (`dump_pptx_shapes.py`)**: Analiza la jerarquía de formas y coordenadas de nuevas plantillas PowerPoint.

### 5. Integración con el Ecosistema del Portal ORANGE

- **Frontend centralizado**: La interfaz web oficial reside en el portal hub unificado `release-dashboard-application` bajo `/dashboards/reportes-incidencias/` con cabecera y navegación corporativa única.
- **Servicio a Gestión de Problemas (`/problemas`)**: Proporciona endpoints para solicitar y descargar informes ejecutivos postmortem en PPTX.
- **Servicio a Release Dashboard (`/dashboards`)**: Endpoints de subida de ficheros CSV (`/api/upload`) y generación por lotes de postmortems de releases.

### 6. Operaciones, Observabilidad y Alta Disponibilidad

- **Despliegue atómico con cero cortes**: Orquestador PowerShell `deploy-production.ps1` que empaqueta un artefacto standalone de 1.5 MB y gestiona releases inmutables por symlink (`releases/<TIMESTAMP>/` -> `current`).
- **Rollback en 1 segundo**: Script `rollback.sh` para revertir de inmediato a la release previa.
- **Supervisión sin root ni systemd**: Script `service.sh` para gestión de procesos FastAPI vía PID en el usuario `infocodes`.
- **Mantenimiento y backups en caliente**: `maintenance.sh` ejecuta backups consistentes en caliente mediante la API SQLite Online Backup, rotación de logs y comprobación de integridad.
- **Sondas y trazabilidad**: Health probes (`/healthz`, `/readyz`, `/api/health`) y trazabilidad de extremo a extremo mediante cabeceras `X-Request-ID` y `X-Process-Time`.

---

## 🚀 Empezar

- **Ejecutar en local**: ver [`docs/development.md`](docs/development.md).
- **Catálogo de endpoints API**: ver [`docs/api-reference.md`](docs/api-reference.md).
- **Arquitectura del código** (frontend, backend, integración y diseño): ver [`CLAUDE.md`](CLAUDE.md).

---

## 📦 Despliegue y Operación

- **Despliegue 1-Clic desde Windows (Recomendado)**:

  ```powershell
  .\scripts\deploy-production.ps1
  ```

  *(Empaqueta un artefacto standalone inmutable de 1.5 MB, lo despliega en `releases/<TIMESTAMP>/` y activa el symlink atómico `current`)*.
  *(Soporta `-VerifyOnly`, `-RestartOnly`, `-Rollback`, `-SkipBuild`, `-SkipUpload` y `-DryRun`)*.
- **Operación y Verificación en el Servidor**:
  - `status.sh` — Muestra la release activa y verifica sondas HTTP de salud.
  - `rollback.sh` — Revierte instantáneamente en 1 segundo a la release anterior.
- **Guías completas**:
  - [`docs/deployment.md`](docs/deployment.md) — Guía detallada de la arquitectura standalone, releases y configuración Nginx.
  - [`docs/operations.md`](docs/operations.md) — Operación rutinaria, backups automáticos en caliente, rotación y resolución de incidencias.
  - [`docs/cli-scripts.md`](docs/cli-scripts.md) — Herramientas CLI de importación/exportación PPTX e inspección de plantillas.

---

## 🏛️ Estructura del Repositorio

- `docs/` — Documentación técnica modular:
  - `deployment.md` — Despliegue en producción, arquitectura standalone y releases.
  - `operations.md` — Operaciones rutinarias, backups SQLite en caliente y monitorización.
  - `development.md` — Guía de entorno de desarrollo local y testing.
  - `api-reference.md` — Catálogo y especificación de endpoints REST de la API.
  - `cli-scripts.md` — Herramientas CLI de importación/exportación PPTX e inferencia.
- `app/` — Frontend estático de referencia (el frontend oficial en producción y hub de portales está integrado en `release-dashboard-application/dashboards/reportes-incidencias/`).
- `backend/` — API FastAPI + SQLite:
  - `main.py` — Endpoints CRUD, generación de PPTX semanal, endpoints de informes ejecutivos e integración de subida CSV.
  - `report_generator/` — Motor generador de Informes Ejecutivos PPTX (`ExecutiveReportBuilder`, Confluence parser, estilos).
  - `service.sh` — Gestión del proceso (`start`, `stop`, `restart`, `status`).
  - `maintenance.sh` — Mantenimiento seguro con SQLite Online Backup (`backup`, `restore`, `rotate-logs`, `healthcheck`).
  - `.env.example` — Variables de entorno configurables.
- `nginx/conf.d/cso-incident.conf` — Configuración modular aislada para Nginx (`/reportes-incidencias/` y `/api`).
- `scripts/` — Scripts PowerShell y utilidades CLI:
  - `deploy-production.ps1` — Orquestador de despliegue standalone (empaquetado, subida SCP, symlinks y sondas).
  - `export_legacy_pptx.py`, `import_pptx.py`, `dump_pptx_shapes.py` — Herramientas CLI para volcado e importación de presentaciones.
- `archive/` — Documentos históricos y auditorías pasadas archivadas.
- `rollback.sh` — Script de rollback atómico para producción.
- `status.sh` — Script de comprobación de release activa y healthchecks.
- `VERSION` — Número de versión del proyecto (2.1.0).

---

## 🌐 Entorno de Producción (`AOTLXPRBOA00001`)

- **Host SSH**: `10.132.26.96` (`infocodes`)
- **Acceso Web Nginx**: `http://10.132.68.85:8081/reportes-incidencias/` (o `http://infocodes.si.orange.es:8081/reportes-incidencias/`)
- **API Backend**: `http://10.132.68.85:8081/api/` (puerto interno `8000`)
- **Persistencia Centralizada**:
  - Base de datos SQLite: `/infocodes/var/data/cso-incident-masivas-report/reports.db`
  - Informes Ejecutivos PPTX: `/infocodes/var/storage/executive_pptx/`
  - PID del servicio: `/infocodes/var/run/cso-backend.pid`
  - Backups de base de datos: `/infocodes/var/backups/cso-incident-masivas-report/`
  - Logs: `/infocodes/var/log/cso-incident-masivas-report/backend.log`
