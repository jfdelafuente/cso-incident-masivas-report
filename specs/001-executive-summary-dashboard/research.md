# Research: Dashboard del Resumen Ejecutivo

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

No quedaron marcadores `[NEEDS CLARIFICATION]` en el Technical Context del plan (el codebase ya se conoce en detalle tras trabajo previo en esta misma rama de sesión). Este documento recoge las decisiones de enfoque tomadas para pasar de la especificación al diseño (Phase 1), no incertidumbres de stack tecnológico.

## Decisión 1: Dónde vive la lógica de selección de "incidencia destacada"

- **Decision**: Nueva función `highlightIncident(incidents, area)` en `app/report-render.js`, junto al resto de funciones de agregación compartidas (`computeStats`, `weekdayBreakdown`, `sortIncidents`, `severityOptions`).
- **Rationale**: `report-render.js` es ya la única fuente de verdad consumida por `app.js` (editor/vista previa), `home.js` (dashboard/PDF) y `buildPptxDeck()` (PPTX, compartido por ambos). Añadir la lógica ahí garantiza por construcción el requisito FR-009 (mismos datos en los tres formatos) sin necesidad de sincronizar tres implementaciones. Es exactamente el patrón ya usado para resolver el mismo problema con `computeStats()`/`weekdayBreakdown()` en cambios anteriores de esta rama.
- **Alternatives considered**:
  - Calcularlo por separado dentro de `app.js` y `home.js`: rechazado — es la causa raíz ya documentada en `CLAUDE.md` de divergencias pasadas entre el editor y el dashboard (p. ej. `home.js` olvidó renderizar `metrics` en su PDF durante un tiempo).
  - Calcularlo en el backend (endpoint nuevo o campo derivado en `ReportResponse`): rechazado por desproporcionado — no hay necesidad de persistir ni cachear la selección, es una función pura sobre datos que el frontend ya tiene cargados; añadir un endpoint solo para esto contradice el alcance de la spec ("mejora de la capa de presentación", ver Assumptions).

## Decisión 2: Cómo comparar severidad entre IT y RED para elegir la "más alta"

- **Decision**: Reutilizar el orden ya codificado en `SEVERITY_KEYS_BY_AREA` (`IT: ['SL1','SL2','SL3']`, `RED: ['EMERGENCIA','CRITICA']`): el índice de la severidad de una incidencia dentro del array de su área **es** su rango (0 = más severa). `highlightIncident()` filtra las incidencias del área solicitada y minimiza ese rango.
- **Rationale**: FR-007 solo exige comparar "dentro de esa área" (IT vs. IT, RED vs. RED), nunca entre escalas distintas (una incidencia SL1 de IT nunca se compara contra una Emergencia de RED) — por eso alcanza con el orden ya existente, sin inventar una escala unificada de 5 niveles. Es coherente con la decisión ya tomada para la tabla "Por Severidad" del resumen ejecutivo (que trata SL1↔Emergencia y SL2↔Crítica como el mismo nivel, pero sin necesitar compararlos entre sí aquí).
- **Alternatives considered**:
  - Definir un ranking global (Emergencia > SL1 > Crítica > SL2 > SL3): rechazado — la especificación no pide comparar incidencias de áreas distintas entre sí, solo elegir la mejor de cada área por separado; añadir ese ranking sería complejidad no solicitada.

## Decisión 3: Desempate por duración y estabilidad del resultado

- **Decision**: Si varias incidencias del área comparten el rango de severidad más alto, se elige la de mayor `duration` (parseada con `parseDurMin()`, ya existente). Si también empatan en duración, se conserva el orden de aparición en el array de incidencias (estable, no aleatorio).
- **Rationale**: `parseDurMin()` ya existe y ya se usa para el total de "Tiempo de afectación"; reutilizarlo evita un segundo parser de duración. El desempate final por orden de aparición (en vez de, p. ej., alfabético por título) hace que el resultado sea 100% determinista sin necesitar un criterio adicional inventado, cumpliendo el edge case de la spec ("el resultado no varíe entre formatos ni entre generaciones sucesivas del mismo informe") siempre que las tres superficies reciban las incidencias en el mismo orden — lo cual ya garantiza `sortIncidents()`/sus consumidores existentes.

## Decisión 4: Dónde colocar la sección en el PPTX sin romper el layout existente

- **Decision**: La franja "Incidencias destacadas" (IT + RED) se añade como contenido adicional en la diapositiva/sección de resumen ejecutivo ya existente si hay espacio libre, o como diapositiva complementaria inmediatamente después (mismo patrón ya usado para la diapositiva de "incidencias por día de la semana"), en vez de forzarla dentro de las cajas ya ocupadas (tiles de totales, "Por severidad", caja negra de Ministerio/Plataforma/Origen Externo).
- **Rationale**: La diapositiva de resumen ejecutivo actual (`buildPptxDeck()`) ya ocupa el espacio vertical disponible (y:2.0 a y:7.0) con los cuatro tiles y las dos cajas inferiores; intentar encajar dos reseñas de texto (título + severidad + posible frase de causa/impacto) ahí arriesga solaparse con contenido existente. Añadir una diapositiva complementaria es el patrón que ya se estableció y validó (sin errores de layout) para el desglose semanal por día, y evita repetir el mismo tipo de ajuste manual de coordenadas ya hecho una vez para encajar 3 filas en la caja "Por severidad".
- **Alternatives considered**:
  - Sustituir alguno de los cuatro tiles existentes: rechazado — esos tiles responden a requisitos ya vigentes (FR-001..FR-005), no hay ninguno "de sobra" que quitar.
  - Reducir el tamaño de fuente/elementos existentes para hacer sitio: rechazado — mayor riesgo de romper visualmente diapositivas ya probadas, por un beneficio menor (evitar una diapositiva más) que no pidió la spec.

## Resumen de compatibilidad con la spec

| Requisito | Cómo se resuelve |
|---|---|
| FR-001..FR-005 (totales/severidad/marcas) | Ya implementado en `computeStats()` — sin cambios necesarios |
| FR-006, FR-011 (reseña con título+severidad, separada IT/RED) | Nueva `highlightIncident(incidents, 'IT' \| 'RED')` + plantilla de presentación en las 3 superficies |
| FR-007 (criterio de selección) | Rango vía `SEVERITY_KEYS_BY_AREA`, desempate por `parseDurMin()`, luego orden de aparición |
| FR-008 (1 por área) | `highlightIncident()` devuelve como máximo un resultado por llamada |
| FR-009 (paridad entre formatos) | Fuente única en `report-render.js`, consumida por los tres renderizadores |
| FR-010 (área sin incidencias) | `highlightIncident()` devuelve `null` cuando el área no tiene incidencias; cada plantilla debe mostrar el mensaje vacío correspondiente |
| FR-012 (marcas múltiples) | Ya cubierto — `computeStats()` cuenta cada marca de forma independiente, no mutuamente excluyente |
