# Research: Agrupar incidencias por categorización en una slide

## Estado actual (auditoría del código)

- **Una slide por incidencia, siempre**, en las tres superficies:
  - `app/app.js:368` (`renderDeck()`): `sortIncidents(this.state.incidents).map(inc => this.incidentSlideTemplate(inc))` — vista previa web (y por tanto también el PDF vía impresión del navegador desde el editor, que usa el mismo DOM).
  - `app/report-render.js:353` (`buildPptxDeck()`): `inc.forEach((it) => { ... })` — PPTX, compartido por `app.js` (botón "Exportar PPTX" del editor) y `app/home.js` (botón "Descargar PPTX" del dashboard).
  - `app/home.js` (`downloadPDF()`, ~línea 519): `inc.map((it, idx) => ...)` — PDF del dashboard ("descargar sin abrir el editor"), con su **propia** plantilla HTML duplicada respecto a `app.js` (ya señalado como deuda técnica en `CLAUDE.md`; a diferencia del PPTX, que **ya no** está duplicado — `home.js` delega en el `buildPptxDeck()` compartido).
- **Orden actual**: `app/report-render.js:86-102` (`compareIncidents`/`sortIncidents`) ordena por Grupo (según el orden fijo `GROUP_ORDER`) y luego por Fecha ascendente. No hay ningún agrupamiento por Severidad/Categoría hoy.
- **Campos de clasificación**: `group`, `severity`, `category` son campos de texto normales de la incidencia (confirmados en `IncidentBase`, `backend/schemas.py`, y en `seed()`, `app/app.js`). `category` es un campo libre editable (con `<datalist>` de sugerencias), no derivado — distinto de `titleOrCat()` (que decide el título grande de la slide, con `category`/`system` solo como *fallback* si no hay `title`).
- **Slide "Incidencias destacadas"** (resumen ejecutivo): selecciona **una única** incidencia por área (IT/RED) vía `highlightIncident()` — mecanismo totalmente distinto (selección + resumen truncado), no afectado por esta feature (ver FR-007 de la spec).

## Decisión 1: Dónde vive la lógica de agrupamiento

**Decisión**: Nueva función `groupIncidentsForSlides(incidents)` en `app/report-render.js`, exportada junto al resto de helpers en `window.ReportRender`.

**Razón**: `report-render.js` ya es la fuente única establecida para "cualquier cosa derivada de la lista de incidencias" (`computeStats`, `weekdayBreakdown`, `highlightIncident`, `sortIncidents`), compartida por `app.js`, `home.js` y `buildPptxDeck()` precisamente para que la vista previa, el PDF y el PPTX no diverjan (mandato de US2/FR-006 de la spec). Poner la lógica de agrupamiento en cualquier otro sitio (p. ej. duplicarla en `app.js` y en `home.js`) reproduciría exactamente el tipo de divergencia que este patrón ya existe para evitar.

**Alternativas consideradas**: Calcular la agrupación de forma independiente en cada uno de los 3 sitios que hoy iteran incidencias → descartado, mismo riesgo de divergencia que motivó la extracción de `report-render.js` en primer lugar.

## Decisión 2: Algoritmo de agrupamiento y orden

**Decisión**:

1. Partir de `sortIncidents(incidents)` (orden Grupo→Fecha ya existente) para no alterar FR-008.
2. Clave de agrupamiento por incidencia: `group + '|' + severity + '|' + category.trim().toLowerCase()` — pero **solo si `category` no está vacía** tras recortar espacios; si está vacía, la incidencia recibe una clave "no agrupable" única (FR-004: nunca se agrupa, ni con otra de categoría también vacía).
3. Recorrer la lista ya ordenada una vez; para cada incidencia no consumida todavía:
   - Si su clave es "no agrupable", o si ninguna otra incidencia comparte esa clave → grupo de 1 (slide igual que hoy).
   - Si ≥2 incidencias comparten la clave → formar un grupo tomando, en el mismo orden ya establecido, hasta 3 incidencias con esa clave (marcándolas como consumidas). Si sobran más de 3 con la misma clave, las restantes forman el/los siguientes grupo(s) de hasta 3 cuando el recorrido llegue a ellas (siguen sin estar consumidas) — cumple FR-003 sin necesidad de una segunda pasada.
4. El resultado es una lista de grupos (arrays de 1 a 3 incidencias), en el mismo orden relativo que `sortIncidents` ya producía — satisface FR-008 (una slide agrupada ocupa la posición de la incidencia con fecha más temprana del grupo, que es la primera encontrada en el recorrido).

**Razón**: Reutiliza el orden ya validado (Grupo→Fecha) en vez de inventar uno nuevo, y resuelve el reparto en over-flow (>3 coincidencias) con una sola pasada sin necesidad de post-procesado adicional.

**Alternativas consideradas**:
- Agrupar primero (con un `Map`) y ordenar los grupos después por la fecha mínima de cada uno → funcionalmente equivalente pero más código; se descarta por simplicidad ya que una sola pasada sobre la lista ya ordenada basta.
- Permitir que Categoría vacía agrupe consigo misma → descartado explícitamente por FR-004 (asunción documentada en la spec: evita juntar incidencias que simplemente no rellenaron el campo).

## Decisión 3: Adaptación del layout de slide según el tamaño del grupo

**Decisión**: La slide de un grupo agrupado (2 o 3 incidencias) muestra **una cabecera compartida** con Grupo + Severidad + Categoría (mostrados una sola vez, ya que son idénticos para todo el grupo por definición), y debajo, un panel por incidencia con sus propios datos distintivos:

- **Cabecera compartida** (una vez por slide): Grupo (etiqueta), Severidad (píldora de color), Categoría (como subtítulo/etiqueta de la slide).
- **Panel por incidencia** (1, 2 o 3 según el tamaño del grupo, en columnas de igual ancho — mismo patrón de columnas que ya usa la slide individual de hoy, adaptado a 1/2/3 en vez de fijo a 3 columnas Impacto/Causa/Solución):
  - Siempre por incidencia (no compartido, pueden diferir dentro del grupo): ID, Fecha, Duración, System/Título (si difiere), flags Ministerio/Plataforma/Origen Externo, y el pie de "Marcas" (cada incidencia conserva su propia línea de marcas — no se fusionan, ya que pueden ser distintas por incidencia).
  - **Grupo de 2** (FR-005): cada panel mantiene el detalle completo de hoy — Métricas, Impacto, Causa, Solución y Puntos de Acción.
  - **Grupo de 3** (FR-005): cada panel mantiene Causa y Solución completas (texto íntegro), pero **sin** puntos de acción individuales, para que las 3 quepan en la slide. Métricas y el pie de marcas se mantienen igual que en el grupo de 2 (ver Asunciones de la spec).
  - **Grupo de 1** (sin coincidencias): sin cambios — exactamente la slide de hoy, cabecera + 3 columnas Impacto/Causa/Solución de una sola incidencia.

**Razón**: Grupo+Severidad+Categoría son por definición idénticos dentro del grupo (son la clave de agrupamiento), así que repetirlos en cada panel sería ruido visual; el resto de campos sí pueden variar por incidencia y deben mostrarse por panel para no perder la trazabilidad individual (US3/SC-003 de la spec). Reutilizar el patrón de columnas ya existente (en vez de inventar un layout nuevo) minimiza el rediseño necesario en las tres superficies.

**Alternativas consideradas**: Repetir la cabecera completa (Grupo+Severidad+Categoría) en cada panel, igual que hace la slide individual hoy → descartado por redundante y por ocupar espacio que hace falta para el contenido cuando hay 2-3 incidencias en la misma slide.

## Decisión 4: Las 3 superficies de exportación se actualizan por separado, sin resolver la duplicación PDF/web ya existente

**Decisión**: Se adapta el bucle de generación de slides en los 3 sitios que hoy iteran incidencias una a una (`buildPptxDeck()` en `report-render.js`, `renderDeck()`/`incidentSlideTemplate()` en `app.js`, `downloadPDF()` en `home.js`), cada uno con su propia implementación del layout descrito en la Decisión 3 (HTML/CSS para `app.js`/`home.js`, coordenadas fijas de PptxGenJS para `report-render.js`). No se unifica la plantilla PDF de `home.js` con la de `app.js` en esta feature.

**Razón**: `CLAUDE.md` ya documenta que `home.js` duplica deliberadamente ciertos builders (PDF) porque no comparte módulos con `app.js` (no hay sistema de módulos, cada script es su propia IIFE); resolver esa duplicación de raíz sería una refactorización mayor y no acotada al alcance pedido por el usuario. Esta feature sigue el patrón ya establecido: extender ambos sitios de forma consistente (mismo resultado visual/de contenido), no fusionarlos.

**Alternativas consideradas**: Refactorizar `home.js` para reutilizar una plantilla HTML compartida con `app.js` → fuera de alcance; se documenta como posible mejora futura pero no se aborda aquí.

## Decisión 5: Sin cambios de backend ni de datos

**Decisión**: No se toca `backend/schemas.py`, `backend/models.py` ni `reports.db`. `group`, `severity` y `category` ya existen como campos de la incidencia; el agrupamiento es puramente una decisión de renderizado (client-side), no un dato persistido.

**Razón**: No hay ningún requisito de la spec que implique guardar la agrupación en sí (no es una preferencia del usuario que deba persistir entre sesiones) — se recalcula cada vez que se genera la slide, igual que ya ocurre con `computeStats()`/`highlightIncident()`.
