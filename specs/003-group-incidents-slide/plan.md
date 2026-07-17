# Implementation Plan: Agrupar incidencias por categorización en una slide

**Branch**: `003-group-incidents-slide` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-group-incidents-slide/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Hoy cada incidencia ocupa siempre su propia slide de detalle (una por incidencia, en las tres superficies: vista previa web, PPTX exportado y PDF del dashboard). Esta feature agrupa en una única slide las incidencias que comparten exactamente Grupo, Severidad y Categoría, con un máximo de 3 por slide, ajustando el nivel de detalle mostrado según el tamaño del grupo (2 → detalle completo; 3 → Causa/Solución íntegras sin puntos de acción individuales). El enfoque técnico añade un nuevo helper de agrupación en `app/report-render.js` (fuente única ya establecida para cualquier cosa derivada de la lista de incidencias), y adapta el bucle "una slide por incidencia" existente en `app/app.js` (vista previa), `app/report-render.js` (`buildPptxDeck`, PPTX) y `app/home.js` (`downloadPDF`, PDF del dashboard) para iterar sobre grupos de 1-3 incidencias en vez de incidencias sueltas. No hay cambios de backend ni de esquema de datos — Grupo/Severidad/Categoría ya existen como campos.

## Technical Context

**Language/Version**: JavaScript vanilla (ES6+), sin paso de build — mismo stack ya usado en `app/`. Sin lenguaje nuevo.

**Primary Dependencies**: Ninguna dependencia nueva — se reutilizan las ya cargadas vía CDN (`pptxgenjs` para PPTX, `html2pdf.js` para el PDF del dashboard).

**Storage**: N/A — no se toca `reports.db` ni `backend/schemas.py`; Grupo/Severidad/Categoría ya son campos existentes de la incidencia (`group`, `severity`, `category`).

**Testing**: No hay framework de test en el repo (confirmado en `CLAUDE.md`). Verificación manual: generar un informe con incidencias que compartan/no compartan clasificación y comparar vista previa, PDF y PPTX entre sí y contra el comportamiento de hoy (ver `quickstart.md`).

**Target Platform**: Navegador web (frontend estático servido sin build), igual que el resto de la app — sin entorno nuevo.

**Project Type**: Aplicación web existente (frontend estático + backend FastAPI) — esta feature solo toca la capa de renderizado del frontend, sin cambios de backend.

**Performance Goals**: No aplica un objetivo de rendimiento nuevo — el volumen de incidencias por informe semanal es pequeño (decenas), y agrupar no añade trabajo relevante frente a iterar la lista una vez como ya se hace hoy.

**Constraints**: Las tres superficies de exportación (vista previa web, PDF, PPTX) deben mostrar exactamente la misma agrupación — convención ya establecida en el proyecto (`report-render.js` como fuente única para cualquier cosa derivada de la lista de incidencias, compartida por `app.js`, `home.js` y `buildPptxDeck`). El PDF del dashboard (`home.js` → `downloadPDF()`) tiene hoy su propio bucle de renderizado duplicado (no usa `incidentSlideTemplate` de `app.js`, aunque sí comparte ya `buildPptxDeck` para el PPTX) — esta feature no corrige esa duplicación de raíz, solo la extiende de forma consistente en ambos sitios, igual que ya advierte `CLAUDE.md` sobre tocar campos de incidencia en `home.js`.

**Scale/Scope**: 3 ficheros de frontend a tocar (`app/report-render.js`, `app/app.js`, `app/home.js`), ninguno de gran tamaño; ningún fichero de backend.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

El fichero `.specify/memory/constitution.md` de este proyecto sigue sin completarse (plantilla con placeholders, sin principios ratificados) — no hay gates formales que evaluar para esta feature.

**Resultado**: PASS (no hay gates aplicables). Como en las features anteriores (`001-executive-summary-dashboard`, `002-junior-ops-deploy-docs`), si en el futuro se ratifica una constitución, esta feature debería revalidarse contra ella.

**Re-check post Phase 1 (diseño)**: El diseño resultante (`research.md`, `data-model.md`) no añade dependencias, servicios ni persistencia nueva — es una nueva función de agrupación puramente derivada (mismo patrón que `computeStats`/`highlightIncident` ya existentes en `report-render.js`) más adaptaciones de plantillas de renderizado ya existentes. **Resultado**: PASS, sin cambios respecto al check inicial.

## Project Structure

### Documentation (this feature)

```text
specs/003-group-incidents-slide/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
app/report-render.js   # NUEVO: groupIncidentsForSlides(incidents) — agrupa incidencias
                        #   por Grupo+Severidad+Categoría (máx. 3, categoría vacía nunca
                        #   agrupa) reutilizando sortIncidents() para el orden. Exportado
                        #   junto al resto de helpers en window.ReportRender.
                        # AJUSTE: buildPptxDeck() cambia su bucle "una slide por
                        #   incidencia" (inc.forEach) por un bucle sobre los grupos
                        #   devueltos por groupIncidentsForSlides(), con layout de slide
                        #   que depende de si el grupo tiene 1, 2 o 3 incidencias.

app/app.js              # AJUSTE: renderDeck() itera sobre ReportRender.groupIncidentsForSlides(...)
                        #   en vez de sortIncidents(...).map(incidentSlideTemplate); nueva
                        #   plantilla de slide agrupada (HTML/CSS) con los mismos 3 casos
                        #   de layout que el PPTX. Sin cambios en editor.js/preview.html
                        #   (reutilizan renderDeck() sin más).

app/home.js              # AJUSTE: downloadPDF() cambia su bucle inc.map(...) (duplicado
                        #   respecto a app.js, ver CLAUDE.md) por el mismo agrupamiento,
                        #   con su propia plantilla HTML equivalente para html2pdf().
                        #   downloadPPTX() no necesita cambios propios: ya delega en el
                        #   buildPptxDeck() compartido, que absorbe el cambio.

backend/                # Sin cambios — group/severity/category ya existen en
                        #   IncidentBase (backend/schemas.py); esta feature no toca
                        #   backend ni esquema de datos.
```

**Structure Decision**: No se crean directorios ni módulos nuevos — todo el trabajo son ediciones y una función nueva dentro de los 3 ficheros de frontend ya existentes que construyen las slides (`report-render.js`, `app.js`, `home.js`), siguiendo el patrón ya establecido de helpers derivados compartidos en `report-render.js` (junto a `computeStats`, `highlightIncident`, `weekdayBreakdown`). No aplica ninguna de las estructuras de opciones genéricas de la plantilla (no es un proyecto/servicio nuevo).

## Complexity Tracking

*No aplica — el Constitution Check no encontró gates ni violaciones que justificar (ver sección anterior).*
