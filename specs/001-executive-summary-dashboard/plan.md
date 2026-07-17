# Implementation Plan: Dashboard del Resumen Ejecutivo

**Branch**: `001-executive-summary-dashboard` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-executive-summary-dashboard/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Ampliar el "Resumen Ejecutivo" ya existente (cover + slide de "la semana en cifras") con la pieza que falta según la especificación: una reseña breve de la incidencia más destacada de IT y de la más destacada de RED (mayor severidad dentro de cada área, con desempate por duración), manteniendo y consolidando las métricas que ya existen hoy (total/IT/RED, por severidad, Ministerio/Plataforma/Origen Externo). La selección de la incidencia destacada y el cálculo de métricas se centralizan en `app/report-render.js` (única fuente ya usada por el editor, el dashboard y el PPTX) para que las tres superficies de salida (PPTX, PDF y visor web) muestren siempre los mismos datos, tal como exige la especificación.

## Technical Context

**Language/Version**: JavaScript ES6+ vanilla (frontend, sin transpilación/build) + Python 3.12 / FastAPI (backend, sin cambios previstos en esta feature)

**Primary Dependencies**: `pptxgenjs` (CDN, generación de PPTX ya en uso), `window.print()` + CSS de impresión / `html2pdf.js` (generación de PDF ya en uso). No se añade ninguna dependencia nueva.

**Storage**: SQLite (`backend/reports.db`), columna `incidents` como JSON; sin cambios de esquema — esta feature no añade campos a la incidencia, solo deriva datos de los ya existentes (`group`, `severity`, `duration`, `ministry`, `platform`, `externalOrigin`).

**Testing**: No hay framework de test automatizado en el repo (confirmado en `CLAUDE.md`). La verificación es manual/funcional: `node --check` sobre los ficheros JS tocados, simulación de las funciones puras de `report-render.js` vía `node -e`/`vm`, y un mock ligero de la API de `pptxgenjs` para ejercitar `buildPptxDeck()` sin abrir PowerPoint — mismo patrón ya usado en el histórico de cambios de esta rama.

**Target Platform**: Navegador web moderno (Chrome/Edge) para el editor (`editor.html`), el dashboard (`index.html`) y el visor (`preview.html`); fichero `.pptx` abierto en PowerPoint; fichero/página impresa a PDF desde el navegador.

**Project Type**: Aplicación web (frontend estático sin build + backend FastAPI). Estructura real del repo: `app/` (frontend) + `backend/` (API) — no sigue el layout genérico de plantilla `src/`+`tests/`.

**Performance Goals**: Sin requisito de rendimiento nuevo; el cálculo de la incidencia destacada es una selección lineal (`O(n)`) sobre los incidentes ya cargados en memoria (decenas por informe semanal típico), por lo que el impacto es imperceptible frente al resto del renderizado ya existente.

**Constraints**: Debe reutilizar `app/report-render.js` como única fuente de la lógica de selección/agregación (evitar la duplicación entre `app.js`/`home.js` ya documentada como problema recurrente en `CLAUDE.md`); no añadir dependencias npm/build; respetar el layout de posicionamiento absoluto ya existente en las diapositivas PPTX sin desbordar cajas fijas (mismo cuidado aplicado en cambios anteriores de esta rama, p. ej. el ajuste de espaciado del bloque "Por severidad").

**Scale/Scope**: Informes semanales de alcance típico (unas pocas a ~30 incidencias); cambio puramente de presentación sobre datos ya existentes, sin nuevos endpoints ni campos de backend.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

El fichero `.specify/memory/constitution.md` de este proyecto aún no ha sido completado (sigue siendo la plantilla con placeholders, sin principios ratificados). No hay, por tanto, principios o gates formales que evaluar para esta feature.

**Resultado**: PASS (no hay gates aplicables; nada que justificar en Complexity Tracking). Si en el futuro se ratifica una constitución para este proyecto (`/speckit-constitution`), esta feature debería revalidarse contra ella antes de fusionarse.

**Re-check post Phase 1 (diseño)**: El diseño resultante (`research.md`, `data-model.md`) no añade dependencias nuevas, no crea servicios/proyectos adicionales, ni introduce persistencia nueva — sigue siendo una única función pura (`highlightIncident()`) añadida al módulo compartido ya existente. **Resultado**: PASS, sin cambios respecto al check inicial.

## Project Structure

### Documentation (this feature)

```text
specs/001-executive-summary-dashboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/                          # frontend estático, sin build step
├── report-render.js          # ÚNICA fuente compartida a modificar:
│                              #   - computeStats() ya calcula sl3/emergencia/critica/
│                              #     ministryCount/platformCount/externalOriginCount
│                              #   - NUEVO: highlightIncident(incidents, area) — selecciona
│                              #     la incidencia más destacada de un área (IT|RED) según
│                              #     FR-007 (rank de severidad vía SEVERITY_KEYS_BY_AREA,
│                              #     desempate por duration, luego orden de aparición)
│                              #   - buildPptxDeck() gana la sección/slide de incidencias
│                              #     destacadas para el PPTX
├── app.js                     # editor: consume highlightIncident() en la plantilla HTML
│                              #   del resumen ejecutivo (dashboardTemplate())
├── home.js                    # dashboard: consume highlightIncident() en el PDF
│                              #   (downloadPDF()); downloadPPTX() ya delega en
│                              #   buildPptxDeck() compartido, sin cambios propios
├── editor.html / index.html / preview.html   # sin cambios (ya cargan report-render.js
│                              #   antes de app.js/home.js)
└── (sin tests/ — no hay framework de test automatizado en el repo)

backend/                      # sin cambios: la feature es solo de presentación sobre
└── ...                       #   campos de incidencia ya existentes (group, severity,
                               #   duration, ministry, platform, externalOrigin)
```

**Structure Decision**: Se reutiliza la estructura ya existente del repo (`app/` frontend sin build + `backend/` FastAPI). No se crean nuevos directorios ni módulos: toda la lógica nueva (selección de incidencia destacada) vive como una función más en `app/report-render.js`, junto a `computeStats()`/`weekdayBreakdown()`/`sortIncidents()`, que ya cumplen exactamente este mismo rol de "cálculo compartido consumido por `app.js`, `home.js` y `buildPptxDeck()`". No aplica ninguna de las estructuras de opciones genéricas de la plantilla (no es librería/CLI/monorepo/móvil).

## Complexity Tracking

*No aplica — el Constitution Check no encontró gates ni violaciones que justificar (ver sección anterior).*
