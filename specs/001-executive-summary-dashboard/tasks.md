---

description: "Task list template for feature implementation"
---

# Tasks: Dashboard del Resumen Ejecutivo

**Input**: Design documents from `/specs/001-executive-summary-dashboard/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: No se solicitaron tests automatizados (el repo no tiene framework de test, ver `plan.md` → Testing). Las tareas de verificación reemplazan a los tests formales, siguiendo `quickstart.md`.

**Organization**: Las tareas se agrupan por historia de usuario (spec.md) para permitir implementación y verificación independientes de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Cada tarea incluye la ruta de fichero exacta

## Path Conventions

Este repo es una aplicación web de un único proyecto (no monorepo): frontend estático sin build en `app/`, backend FastAPI en `backend/`. Todas las rutas de abajo son relativas a la raíz del repo.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar el entorno local para poder verificar manualmente cada historia (no hay dependencias/build nuevos que instalar — ver `plan.md` → Constraints).

- [X] T001 Levantar el entorno de desarrollo local: frontend estático (`app/`, vía `start-local.sh`/`start-local.bat` o `python -m http.server 8080`) y backend (`backend/main.py`, vía `python main.py`), según `CLAUDE.md` → "Running locally", para poder ejercitar el dashboard manualmente en las fases siguientes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Datos de prueba compartidos que necesitan las tres historias de usuario para poder verificarse.

**⚠️ CRITICAL**: Ninguna historia puede verificarse sin este fixture.

- [X] T002 Crear el fichero de datos de prueba `specs/001-executive-summary-dashboard/fixtures/test-report.json` (formato `ReportCreate`, ver `backend/schemas.py`) con: al menos 2 incidencias IT y 2 RED de severidades distintas; alguna incidencia con `ministry`/`platform`/`externalOrigin` activos, incluida una con más de una marca a la vez (FR-012); un empate de severidad dentro de la misma área con duraciones distintas (para el desempate de FR-007); y cubrir también el caso de un área sin incidencias (puede ser un segundo fichero `test-report-empty-red.json` o una variante documentada en el mismo fichero) — ver `quickstart.md` → paso 1.

**Checkpoint**: Fixture listo — puede empezar el trabajo de cualquier historia de usuario.

---

## Phase 3: User Story 1 - Ver el panorama semanal de un vistazo (Priority: P1) 🎯 MVP

**Goal**: Confirmar que el dashboard ya existente (totales IT/RED, por severidad, Ministerio/Plataforma/Origen Externo) es correcto y consistente en los tres formatos — es la base sobre la que se apoyan las historias 2 y 3.

**Independent Test**: Con el fixture de T002, abrir el resumen ejecutivo en el visor web, exportarlo a PPTX y a PDF, y comprobar que los tres muestran el mismo total, desglose IT/RED, desglose por severidad y los tres contadores de marcas.

> **Nota de alcance**: FR-001 a FR-005 y FR-012 ya están implementados en `computeStats()` (`app/report-render.js`) según `research.md`. Las tareas de esta fase son de **verificación**, no de implementación nueva — si alguna verificación falla, la corrección correspondiente se trata como un bug a resolver antes de continuar, no como parte del alcance original de esta historia.

### Implementation for User Story 1

- [X] T003 [P] [US1] Verificar `computeStats()` en `app/report-render.js` con el fixture de T002: total, `itCount`/`redCount`, desglose de severidad (`emergencia`/`critica`/`sl3`) y `ministryCount`/`platformCount`/`externalOriginCount` (incluyendo la incidencia con marcas simultáneas de FR-012), usando el arnés de Node/`vm` de `quickstart.md` → paso 3.
- [X] T004 [P] [US1] Verificar que la vista previa web (`dashboardTemplate()` en `app/app.js`, abierta vía `editor.html` con el fixture cargado) muestra los mismos totales verificados en T003.
- [X] T005 [P] [US1] Verificar que el PPTX exportado (`buildPptxDeck()` en `app/report-render.js`) muestra los mismos totales, usando el mock de `pptxgenjs` de `quickstart.md` → paso 4.
- [X] T006 [P] [US1] Verificar que el PDF exportado (`downloadPDF()` en `app/home.js`) muestra los mismos totales.
- [X] T007 [US1] Verificar el caso límite de informe sin incidencias (FR-010, parte de totales): todos los contadores en cero, sin errores, en los tres formatos (visor, mock PPTX, plantilla PDF).

**Checkpoint**: El dashboard base (totales/severidad/marcas) está verificado como correcto y consistente en las tres superficies — listo para construir encima la Historia 2.

---

## Phase 4: User Story 2 - Identificar las incidencias más destacadas sin leer todo el informe (Priority: P2)

**Goal**: Añadir la reseña breve de la incidencia IT y RED más destacada (mayor severidad dentro de su área, desempate por duración) al dashboard, en las tres superficies.

**Independent Test**: Con el fixture de T002, comprobar que el dashboard incluye una reseña (título + severidad como mínimo) de la incidencia IT de mayor severidad y de la incidencia RED de mayor severidad, mostradas por separado.

### Implementation for User Story 2

- [X] T008 [US2] Implementar `highlightIncident(incidents, area)` en `app/report-render.js`: filtrar por `areaOf(group) === area`; elegir la de menor índice en `SEVERITY_KEYS_BY_AREA[area]` (mayor severidad); desempatar por `parseDurMin(duration)` descendente; si persiste el empate, conservar el orden de aparición; devolver `null` si el área no tiene incidencias (FR-006, FR-007, FR-008, FR-010). Exportarla junto al resto de helpers en el objeto `window.ReportRender` del mismo fichero.
- [X] T009 [P] [US2] Añadir la sección/diapositiva "Incidencias destacadas" a `buildPptxDeck()` en `app/report-render.js`, consumiendo `highlightIncident()` (depende de T008): reseña de la incidencia IT y de la RED (título + severidad, y un dato adicional si el espacio lo permite, p. ej. ticket o causa — FR-011), colocada como diapositiva complementaria siguiendo el patrón ya usado para "incidencias por día de la semana" (ver `research.md` → Decisión 4), con mensaje claro cuando `highlightIncident()` devuelva `null` para un área (FR-010).
- [X] T010 [P] [US2] Añadir la misma sección "Incidencias destacadas" a la vista previa web (`dashboardTemplate()` en `app/app.js`), consumiendo `highlightIncident()` (depende de T008), con el mismo tratamiento del caso de área vacía.
- [X] T011 [P] [US2] Añadir la misma sección "Incidencias destacadas" al PDF exportado (`downloadPDF()` en `app/home.js`), consumiendo `highlightIncident()` (depende de T008), con el mismo tratamiento del caso de área vacía. (`downloadPPTX()` en `app/home.js` ya delega en `buildPptxDeck()` compartido — no necesita cambio propio, ver `plan.md`.)
- [X] T012 [US2] Verificar el desempate por duración (FR-007) con las incidencias empatadas en severidad del fixture de T002, confirmando que gana la de mayor duración, usando el arnés de Node/`vm` sobre `highlightIncident()`.
- [X] T013 [P] [US2] Verificar el caso límite de título largo (Edge Cases de `spec.md`): añadir al fixture una incidencia con título muy largo y confirmar que la reseña no desborda el layout fijo del PPTX ni el contenedor del visor/PDF.

**Checkpoint**: El dashboard ya muestra la incidencia IT y RED más destacadas en las tres superficies — funcionalidad nueva completa y verificable de forma independiente.

---

## Phase 5: User Story 3 - Coherencia entre PPT, PDF y visor web (Priority: P3)

**Goal**: Confirmar que las tres superficies muestran exactamente los mismos datos (totales + incidencias destacadas), y que el resultado es estable entre generaciones sucesivas del mismo informe.

**Independent Test**: Exportar el mismo informe (con el fixture de T002) a PPTX y PDF, y visualizarlo en el navegador; los tres deben coincidir en todos los valores del dashboard.

> **Nota de alcance**: Dado que T008-T011 centralizan toda la lógica en `app/report-render.js` (fuente única), esta historia es principalmente una verificación de que ese diseño cumple su promesa, no una implementación adicional.

### Implementation for User Story 3

- [X] T014 [US3] Verificación cruzada de consistencia: con el fixture de T002, comparar el resumen ejecutivo del visor web, del PPTX exportado y del PDF exportado, y confirmar que los totales, el desglose por severidad, los contadores de marcas y las incidencias destacadas de IT/RED son idénticos en los tres (FR-009, SC-002) — ver `quickstart.md` → paso 5.
- [X] T015 [P] [US3] Verificar la estabilidad entre generaciones: regenerar/recargar el mismo informe fixture una segunda vez y confirmar que la incidencia destacada elegida y el resultado del desempate no cambian entre generaciones sucesivas (Edge Cases de `spec.md`).

**Checkpoint**: Las tres historias de usuario están verificadas de forma independiente; el dashboard del resumen ejecutivo es consistente en PPT, PDF y visor web.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cierre de calidad transversal a las tres historias, antes de fusionar la rama.

- [X] T016 [P] Ejecutar `node --check app/report-render.js`, `node --check app/app.js` y `node --check app/home.js` para confirmar que no se ha introducido ningún error de sintaxis.
- [X] T017 [P] Actualizar la sección "Data model notes" de `CLAUDE.md` para mencionar `highlightIncident()` junto al resto de helpers compartidos de `app/report-render.js` (mismo patrón ya usado ahí para `computeStats()`/`weekdayBreakdown()`/`sortIncidents()`).
- [X] T018 Ejecutar de principio a fin `specs/001-executive-summary-dashboard/quickstart.md` como pase de regresión manual final antes de fusionar la rama.
- [X] T019 [P] Decidir el destino de `specs/001-executive-summary-dashboard/fixtures/` creado en T002: conservarlo como fixture de regresión reutilizable, o eliminarlo si ya no aporta valor tras el pase de regresión de T018.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: Depende de Setup. BLOQUEA las tres historias de usuario (todas necesitan el fixture de T002 para poder verificarse).
- **User Story 1 (Phase 3)**: Depende de Foundational. Sin dependencia de otras historias.
- **User Story 2 (Phase 4)**: Depende de Foundational. No requiere que la Historia 1 esté "terminada" (ya lo está de por sí), pero conceptualmente se apoya en que el resto del dashboard (Historia 1) ya es correcto.
- **User Story 3 (Phase 5)**: Depende de que Historia 2 haya añadido la sección de incidencias destacadas (T008-T011), ya que verifica su consistencia entre formatos junto con el resto de datos de la Historia 1.
- **Polish (Phase 6)**: Depende de que las tres historias estén completas.

### User Story Dependencies

- **US1 (P1)**: Ninguna — es pura verificación de lo ya implementado.
- **US2 (P2)**: Depende de Foundational (fixture). Es la única historia con implementación de código nueva.
- **US3 (P3)**: Depende de que T008-T011 (US2) existan, ya que verifica la sección que esas tareas crean.

### Within Each User Story

- US1: las verificaciones T003-T006 son independientes entre sí (marcadas `[P]`); T007 (caso límite) se hace después para no duplicar el fixture "feliz" en las mismas pasadas.
- US2: T008 (la función compartida) bloquea a T009, T010 y T011 (los tres consumidores), que sí son paralelos entre sí por tocar ficheros distintos. T012/T013 (verificación) van después de que exista al menos una superficie que renderice el resultado.
- US3: T014 antes que T015 (primero se confirma que coincide, luego que es estable en el tiempo).

### Parallel Opportunities

- T003, T004, T005, T006 (verificación de US1 en las 4 superficies/capas) pueden ejecutarse en paralelo.
- T009, T010, T011 (los tres consumidores de `highlightIncident()`) pueden ejecutarse en paralelo una vez completada T008.
- T016, T017, T019 (Polish) pueden ejecutarse en paralelo entre sí.

---

## Parallel Example: User Story 2

```bash
# T008 debe completarse primero (función compartida, bloquea al resto):
Task: "Implementar highlightIncident(incidents, area) en app/report-render.js"

# Una vez completada T008, lanzar en paralelo los tres consumidores:
Task: "Añadir sección 'Incidencias destacadas' a buildPptxDeck() en app/report-render.js"
Task: "Añadir sección 'Incidencias destacadas' a dashboardTemplate() en app/app.js"
Task: "Añadir sección 'Incidencias destacadas' a downloadPDF() en app/home.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (fixture de prueba)
3. Completar Fase 3: Historia 1 (verificación del dashboard ya existente)
4. **PARAR y VALIDAR**: en este punto ya se confirma que el dashboard base es correcto y consistente — es el terreno sobre el que se construye el resto.

### Incremental Delivery

1. Setup + Foundational → fixture listo
2. Historia 1 → dashboard base verificado (sin cambios de código, solo confirmación)
3. Historia 2 → nueva sección de incidencias destacadas implementada y verificada → **entrega principal de esta feature**
4. Historia 3 → consistencia entre formatos confirmada de forma explícita
5. Polish → sintaxis, documentación y regresión final antes de fusionar

### Parallel Team Strategy

Con más de una persona disponible:

1. Completar juntos Setup + Foundational (el fixture es compartido).
2. Una persona verifica Historia 1 (T003-T007) mientras otra empieza a implementar `highlightIncident()` (T008) — no hay bloqueo real entre ambas ya que Historia 1 no depende de código nuevo.
3. Una vez lista T008, repartir T009/T010/T011 (un consumidor cada una) entre hasta 3 personas.
4. Historia 3 y Polish se hacen en conjunto al final, ya que dependen de que todo lo anterior esté integrado.

---

## Notes

- [P] tasks = ficheros distintos, sin dependencias pendientes entre sí
- La etiqueta [Story] traza cada tarea a su historia de usuario en `spec.md`
- No hay framework de test automatizado en este repo — las tareas de "verificación" siguen los pasos manuales de `quickstart.md` en su lugar
- Historia 1 no requiere cambios de código: sus tareas son de confirmación, no de implementación
- Toda la lógica nueva de Historia 2 vive en un único punto (`app/report-render.js`) para que Historia 3 (coherencia entre formatos) se cumpla por construcción
- Evitar: tocar `app/home.js`/`app/app.js` con lógica de selección propia en vez de reutilizar `highlightIncident()` — es exactamente el patrón de duplicación que `CLAUDE.md` ya identifica como problema recurrente en este repo
