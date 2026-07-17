---

description: "Task list template for feature implementation"
---

# Tasks: Agrupar incidencias por categorización en una slide

**Input**: Design documents from `/specs/003-group-incidents-slide/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: No se solicitaron tests automatizados (el repo no tiene framework de test ni linter configurado, ver `plan.md` → Testing). La verificación sigue los pasos manuales de `quickstart.md`.

**Organization**: Las tareas se agrupan por historia de usuario (spec.md) para permitir implementación y verificación independientes de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Cada tarea incluye la ruta de fichero exacta

## Path Conventions

Todas las rutas son relativas a la raíz del repo. Todo el trabajo cae dentro de `app/` (frontend estático) — no hay cambios de backend.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar que se parte de un estado limpio antes de editar los 3 ficheros de renderizado.

- [X] T001 Confirmar que la rama `003-group-incidents-slide` está limpia (`git status`) y actualizada antes de tocar `app/report-render.js`, `app/app.js` y `app/home.js`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: El helper de agrupamiento es la base que las 3 historias de usuario necesitan — ninguna puede completarse sin él.

**⚠️ CRITICAL**: No puede empezar ninguna historia de usuario hasta que esta fase esté completa.

- [X] T002 Implementar y exportar `groupIncidentsForSlides(incidents)` en `app/report-render.js` (junto a `computeStats`/`highlightIncident`/`sortIncidents`, añadida también a `window.ReportRender`): clave de agrupamiento `group + '|' + severity + '|' + category.trim().toLowerCase()` solo si `category` no está vacía (categoría vacía ⇒ nunca agrupa, FR-004); recorrido en una sola pasada sobre `sortIncidents(incidents)` formando grupos de hasta 3 incidencias coincidentes (overflow >3 se reparte en los siguientes grupos de la misma pasada, FR-003); ver Decisión 1 y 2 de `research.md` para el algoritmo exacto y la justificación.

**Checkpoint**: Helper de agrupamiento listo y disponible vía `ReportRender.groupIncidentsForSlides` — puede empezar el trabajo de cualquier historia de usuario.

---

## Phase 3: User Story 1 - Agrupar incidencias con la misma clasificación (Priority: P1) 🎯 MVP

**Goal**: La vista previa web (editor y `preview.html`) muestra las incidencias que comparten Grupo+Severidad+Categoría juntas en una sola slide (hasta 3 por slide), en vez de una slide por incidencia.

**Independent Test**: Crear/editar un informe con 2-4 incidencias que coincidan en Grupo+Severidad+Categoría, abrir la vista previa, y confirmar que aparecen agrupadas según las reglas de la spec (casos 1, 2, 3, 4 y 8 de `quickstart.md`).

### Implementation for User Story 1

- [X] T003 [US1] Añadir una plantilla de slide agrupada en `app/app.js` (nueva función junto a `incidentSlideTemplate()`, p. ej. `incidentGroupSlideTemplate(group)`) implementando el layout de la Decisión 3 de `research.md`: cabecera compartida con Grupo+Severidad+Categoría mostrados una sola vez, y 1/2/3 paneles según el tamaño del grupo — cada panel con su propio ID/Fecha/Duración, flags (Ministerio/Plataforma/Origen Externo) y "Marcas"; detalle completo (Métricas, Impacto, Causa, Solución, Puntos de Acción) para grupos de 2; Causa/Solución completas pero sin Puntos de Acción individuales para grupos de 3 (FR-005). Los grupos de tamaño 1 siguen usando `incidentSlideTemplate()` sin cambios.
- [X] T004 [US1] Modificar `renderDeck()` en `app/app.js` (línea ~368) para iterar sobre `ReportRender.groupIncidentsForSlides(this.state.incidents)` en vez de `sortIncidents(this.state.incidents).map(inc => this.incidentSlideTemplate(inc))`, invocando `incidentSlideTemplate()` para grupos de 1 incidencia y la nueva plantilla de T003 para grupos de 2 o 3.
- [X] T005 [US1] Verificar manualmente en `editor.html`/`preview.html` los casos 1, 2, 3, 4 y 8 de `specs/003-group-incidents-slide/quickstart.md`: agrupamiento básico de 2, reparto por overflow (4 coincidentes → slides de 3+1), categoría vacía nunca agrupa (ni con otra vacía), incidencia sin coincidencias sin cambios, y regresión de un informe existente sin incidencias coincidentes (debe verse exactamente igual que antes).

**Checkpoint**: User Story 1 funcional e independientemente verificable — la vista previa ya agrupa correctamente.

---

## Phase 4: User Story 2 - Coherencia entre vista previa, PDF y PPTX (Priority: P2)

**Goal**: La misma agrupación de incidencias se refleja, sin divergencias, en el PDF exportado y en el PowerPoint exportado.

**Independent Test**: Exportar el mismo informe agrupado a PDF (editor vía impresión, y botón "Descargar PDF" del dashboard) y a PPTX (editor y dashboard), y confirmar que la agrupación coincide exactamente con la vista previa (caso 5 de `quickstart.md`).

> **Nota de dependencia**: Depende de T002 (Foundational). No depende de las tareas de US1 (T003/T004), aunque comparte el mismo criterio de layout (Decisión 3 de `research.md`) que conviene mantener consistente con lo implementado allí.

### Implementation for User Story 2

- [X] T006 [US2] Modificar `buildPptxDeck()` en `app/report-render.js` (sustituir el bucle `inc.forEach((it) => {...})`, línea ~353, por un bucle sobre `groupIncidentsForSlides(inc)`), aplicando el layout de la Decisión 3 con coordenadas de PptxGenJS: cabecera compartida (Grupo+Severidad+Categoría) + 1/2/3 columnas de panel; grupos de 2 con detalle completo (incl. Puntos de Acción), grupos de 3 con Causa/Solución completas sin Puntos de Acción. Este builder es compartido por el botón "Exportar PPTX" del editor y el "Descargar PPTX" del dashboard — un solo cambio cubre ambos.
- [X] T007 [US2] Modificar `downloadPDF()` en `app/home.js` (sustituir el bucle `inc.map((it, idx) => ...)`, línea ~519, por la misma lógica de agrupamiento vía `ReportRender.groupIncidentsForSlides`), con una plantilla HTML equivalente para `html2pdf()` que siga el mismo criterio de detalle por tamaño de grupo que T003/T006 (duplicación deliberada respecto a `app.js`, ya documentada en `CLAUDE.md` — no se unifica en esta feature, ver Decisión 4 de `research.md`).
- [X] T008 [US2] Verificar manualmente el caso 5 de `quickstart.md`: exportar el mismo informe a PDF (editor + dashboard) y a PPTX (editor + dashboard), y confirmar que la agrupación de incidencias en slides es idéntica en los 4 casos y respecto a la vista previa (0 divergencias, SC-004).

**Checkpoint**: User Stories 1 y 2 completas — las 3 superficies de exportación no divergen.

---

## Phase 5: User Story 3 - Distinguir cada incidencia dentro de una slide compartida (Priority: P3)

**Goal**: Dentro de una slide que agrupa 2-3 incidencias, los datos de cada una son inequívocamente distinguibles de los de las demás.

**Independent Test**: Inspeccionar visualmente una slide con 2-3 incidencias agrupadas en las 3 superficies y confirmar que se puede identificar en menos de 5 segundos a qué incidencia pertenece cada dato mostrado (SC-003).

> **Nota de dependencia**: T009 depende de T003 (mismo fichero/plantilla), T010 de T006, T011 de T007 — cada una refuerza visualmente el layout ya implementado por su historia correspondiente en esa misma superficie.

### Implementation for User Story 3

- [X] T009 [P] [US3] En la plantilla de slide agrupada de `app/app.js` (T003), añadir separadores visuales explícitos entre paneles (borde/línea divisoria) y resaltar la mini-cabecera de cada panel (ID/Fecha/Duración) para que cada incidencia sea inequívocamente distinguible dentro de la slide compartida.
- [X] T010 [P] [US3] Aplicar el mismo refuerzo visual (líneas divisorias entre columnas de panel, cabecera ID/Fecha/Duración destacada por panel) al layout PPTX de `buildPptxDeck()` (T006) en `app/report-render.js`.
- [X] T011 [P] [US3] Aplicar el mismo refuerzo visual al layout PDF de `downloadPDF()` (T007) en `app/home.js`.
- [X] T012 [US3] Verificar manualmente los casos 1 y 2 de `quickstart.md` centrándose en SC-003, en las 3 superficies: confirmar que se identifica en menos de 5 segundos a qué incidencia concreta pertenece cada dato mostrado en una slide con 2 o 3 incidencias agrupadas.

**Checkpoint**: Las 3 historias de usuario completas — la feature es funcionalmente correcta, coherente entre formatos, y legible.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cierre de calidad transversal a las tres historias, antes de fusionar la rama.

- [X] T013 [P] Ejecutar `node --check app/report-render.js`, `node --check app/app.js` y `node --check app/home.js` para confirmar que no se ha introducido ningún error de sintaxis (no hay linter configurado en el repo, ver `CLAUDE.md`).
- [X] T014 [P] Ejecutar `specs/003-group-incidents-slide/quickstart.md` de principio a fin (los 8 casos) como pase de regresión manual final antes de fusionar la rama.
- [X] T015 Confirmar que `CLAUDE.md` sigue siendo preciso: la nueva `groupIncidentsForSlides()` en `app/report-render.js` encaja en la descripción ya existente de ese fichero como fuente única para lo derivado de la lista de incidencias — añadir una mención breve si aporta claridad, sin cambios si ya es adecuada tal cual.
- [X] T016 Confirmar (caso 6 de `quickstart.md`, FR-007) que la slide "Incidencias destacadas" (`highlightIncident()`) y el resto de agregados ya existentes de `report-render.js` (`computeStats`, `weekdayBreakdown`) siguen operando sobre la lista completa de incidencias sin verse afectados por `groupIncidentsForSlides` — no filtran ni reordenan la lista de entrada de forma distinta a como ya lo hacían.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: Depende de Setup. **Bloquea las 3 historias de usuario** (todas consumen `groupIncidentsForSlides`).
- **User Story 1 (Phase 3)**: Depende de Foundational. Sin dependencia de otras historias.
- **User Story 2 (Phase 4)**: Depende de Foundational. Independiente de User Story 1 (toca ficheros distintos: `report-render.js`/`home.js` vs. `app.js`).
- **User Story 3 (Phase 5)**: Depende de Foundational, y de que exista una base de layout que reforzar en cada superficie — **T009 depende de T003 (US1)**, **T010 depende de T006 (US2)**, **T011 depende de T007 (US2)**.
- **Polish (Phase 6)**: Depende de que las tres historias estén completas.

### User Story Dependencies

- **US1 (P1)**: Ninguna — es la base de la que depende parcialmente US3 (T009).
- **US2 (P2)**: Ninguna sobre US1 — toca ficheros distintos (PPTX/PDF vs. vista previa). Es la base de la que dependen T010/T011 de US3.
- **US3 (P3)**: T009 depende de T003 (US1); T010/T011 dependen de T006/T007 (US2) respectivamente.

### Within Each User Story

- US1: T003 antes que T004 (la plantilla debe existir antes de invocarla desde `renderDeck()`); T005 al final como verificación.
- US2: T006 y T007 tocan ficheros distintos (`report-render.js` vs. `home.js`) y son paralelos entre sí; T008 al final como verificación conjunta.
- US3: T009, T010 y T011 tocan ficheros distintos y son paralelos entre sí (cada una depende solo de la tarea base de su propia superficie); T012 al final como verificación conjunta.

### Parallel Opportunities

- T006 y T007 (Historia 2, ficheros distintos) pueden ejecutarse en paralelo.
- T009, T010 y T011 (Historia 3, cada una en un fichero distinto: `app.js`, `report-render.js`, `home.js`) pueden ejecutarse en paralelo entre sí, siempre que su tarea base respectiva (T003, T006, T007) ya esté completa.
- T013 y T014 (Polish, comprobaciones independientes) pueden ejecutarse en paralelo.

---

## Parallel Example: User Story 2

```bash
# T006 y T007 tocan ficheros distintos, pueden ir en paralelo una vez completada la Fase 2:
Task: "Adaptar buildPptxDeck() a groupIncidentsForSlides en app/report-render.js"
Task: "Adaptar downloadPDF() a groupIncidentsForSlides en app/home.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (`groupIncidentsForSlides` implementado y expuesto)
3. Completar Fase 3: Historia 1 (vista previa web agrupando correctamente)
4. **PARAR y VALIDAR**: en este punto ya se puede comprobar visualmente la agrupación en la vista previa — es la entrega de mayor impacto de esta feature.

### Incremental Delivery

1. Setup + Foundational → helper de agrupamiento listo y disponible
2. Historia 1 → vista previa agrupa correctamente → **entrega principal (MVP)**
3. Historia 2 → PDF y PPTX no divergen de la vista previa
4. Historia 3 → cada incidencia es inequívocamente distinguible dentro de una slide compartida
5. Polish → sintaxis, regresión final, coherencia de documentación

### Parallel Team Strategy

Con más de una persona disponible:

1. Completar juntos Setup + Foundational (el helper es compartido).
2. Una persona hace Historia 1 (`app.js`, vista previa) mientras otra empieza Historia 2 (`report-render.js`/`home.js`, PPTX/PDF) — son independientes entre sí.
3. Una vez lista cada base de layout, repartir las tareas de Historia 3 (T009/T010/T011) entre superficies.
4. Polish se hace en conjunto al final.

---

## Notes

- [P] tasks = ficheros distintos, sin dependencias pendientes entre sí
- La etiqueta [Story] traza cada tarea a su historia de usuario en `spec.md`
- No hay framework de test automatizado ni linter en este repo — las tareas de "verificación" siguen los pasos manuales de `quickstart.md`, y la única comprobación mecánica es `node --check` para sintaxis
- Historia 2 no depende de Historia 1 (ficheros distintos) — pueden desarrollarse en paralelo si hay más de una persona
- T009/T010/T011 (Historia 3) son la única dependencia cruzada real hacia atrás (cada una depende de la tarea base de su propia superficie en US1/US2) — documentarla así evita que alguien las planifique como completamente independientes por error
- Evitar: reintroducir la cabecera completa (Grupo+Severidad+Categoría) por incidencia dentro de un panel — es exactamente la redundancia que la Decisión 3 de `research.md` descarta

## Enmienda post-implementación: FR-009 (restricción por Severidad)

Tras completar T001-T016, se añadió **FR-009**: el agrupamiento solo aplica a incidencias de Severidad `SL2` (IT) o `CRITICA` (RED) — el resto de severidades (`SL1`/`SL3` en IT, `EMERGENCIA` en RED) nunca se agrupan, aunque coincidan en Grupo y Categoría. Cambio aplicado directamente sobre el trabajo ya implementado (sin task IDs nuevos):
- `groupKey()` en `app/report-render.js` ahora comprueba `GROUPABLE_SEVERITIES` (`SL2`/`CRITICA`) antes de mirar la Categoría.
- `spec.md` (FR-001, FR-009, nuevo edge case, nuevo escenario de aceptación US1), `research.md` (Decisión 2) y `data-model.md` actualizados en consecuencia.
- `quickstart.md`: nuevo caso 9 (incidencias J/K, mismo Grupo+Categoría que A/B pero Severidad SL1 — no deben agruparse).
- Reverificado con el mismo script Node de T005, ampliado con J/K — todas las aserciones (incluida la nueva) pasan.
