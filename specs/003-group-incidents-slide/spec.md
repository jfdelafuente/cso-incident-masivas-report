# Feature Specification: Agrupar incidencias por categorización en una slide

**Feature Branch**: `003-group-incidents-slide`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Quiero agrupar en una solo slide las incidencias (con un máximo de 3 incidencias por slide) que tengan la misma categorizacion que te voy a indicar: GRUPO, SEVERIDAD y CATEGORÍA"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agrupar incidencias con la misma clasificación (Priority: P1)

Como autor de un informe semanal, quiero que las incidencias que comparten Grupo, Severidad y Categoría aparezcan juntas en una sola slide (hasta un máximo de 3 por slide), en vez de una slide independiente por cada incidencia, para que el informe sea más compacto y fácil de repasar cuando hay varias incidencias de la misma clase en la misma semana.

**Why this priority**: Es el objetivo central de la feature — sin esto no hay ningún valor entregado.

**Independent Test**: Se puede probar de forma independiente creando o importando un informe con 2-3 incidencias que compartan Grupo, Severidad y Categoría, generando la vista previa/PDF/PPTX, y comprobando que aparecen juntas en una única slide en vez de en slides separadas.

**Acceptance Scenarios**:

1. **Given** un informe con 2 incidencias que comparten Grupo="IT MM", Severidad="SL2" y Categoría="Caída de red", **When** se genera el informe (vista previa, PDF o PPTX), **Then** ambas incidencias aparecen juntas en una única slide en vez de en dos slides separadas.
2. **Given** un informe con 4 incidencias que comparten exactamente el mismo Grupo, Severidad y Categoría, **When** se genera el informe, **Then** se reparten en 2 slides (3 y 1) sin perder ninguna incidencia.
3. **Given** un informe donde ninguna incidencia comparte su combinación de Grupo+Severidad+Categoría con otra, **When** se genera el informe, **Then** cada incidencia sigue apareciendo sola en su propia slide, igual que hoy.

---

### User Story 2 - Coherencia entre vista previa, PDF y PPTX (Priority: P2)

Como autor de un informe, quiero que la agrupación de incidencias se aplique igual en la vista previa web, el PDF y el PowerPoint exportados, para que los tres formatos del informe nunca muestren cosas distintas entre sí.

**Why this priority**: Es una convención ya establecida en el proyecto (vista previa/PDF/PPTX no deben divergir); sin esta historia, la agrupación solo funcionaría "a medias" y generaría confusión sobre cuál de los tres formatos es el correcto.

**Independent Test**: Se puede probar de forma independiente generando los tres formatos del mismo informe agrupado y comparando que la agrupación de incidencias en slides es idéntica en los tres.

**Acceptance Scenarios**:

1. **Given** un informe con incidencias agrupadas, **When** se exporta a PDF, **Then** la agrupación de incidencias en slides coincide exactamente con la vista previa web.
2. **Given** un informe con incidencias agrupadas, **When** se exporta a PowerPoint, **Then** la agrupación de incidencias en slides coincide exactamente con la vista previa web.

---

### User Story 3 - Distinguir cada incidencia dentro de una slide compartida (Priority: P3)

Como autor o lector de un informe, quiero poder identificar sin ambigüedad qué datos (ID, fecha, duración, causa, métricas, solución) pertenecen a cada incidencia concreta dentro de una slide que agrupa varias, para no confundir el contenido de una incidencia con el de otra que comparte la misma slide.

**Why this priority**: Es de menor prioridad que el propio mecanismo de agrupación, pero imprescindible para que el resultado sea utilizable — una slide compartida con límites ambiguos entre incidencias sería peor que no tener la feature.

**Independent Test**: Se puede probar de forma independiente inspeccionando visualmente una slide con 2-3 incidencias agrupadas y confirmando que los datos de cada una están claramente separados de los de las demás.

**Acceptance Scenarios**:

1. **Given** una slide con 3 incidencias agrupadas, **When** se inspecciona visualmente, **Then** los datos identificativos (ID, fecha, duración) y el contenido (causa, métricas, solución) de cada incidencia están claramente diferenciados de los de las otras dos.

---

### Edge Cases

- ¿Qué pasa si solo hay 1 incidencia para una combinación concreta de Grupo+Severidad+Categoría? Sigue apareciendo sola en su propia slide, igual que hoy.
- ¿Qué pasa si la Categoría de una incidencia está vacía? No se agrupa con ninguna otra incidencia (ni siquiera con otra que también tenga la Categoría vacía) — mantiene su propia slide individual, para evitar juntar incidencias que simplemente no rellenaron ese campo.
- ¿Qué pasa si más de 3 incidencias comparten la misma clasificación (p. ej. 7)? Se reparten de forma secuencial en slides de hasta 3 (3+3+1), respetando el orden cronológico ya existente.
- ¿Afecta esto a la slide de "Incidencias destacadas" del resumen ejecutivo? No — esa slide sigue seleccionando una única incidencia por área de forma independiente, sin cambios.
- ¿Cambia el orden general de las slides en el informe? No — se mantiene el criterio de ordenación actual (Grupo, luego Fecha); una slide agrupada ocupa la posición que le correspondería a su incidencia con la fecha más temprana del grupo.
- ¿Se muestra el mismo contenido por incidencia en un grupo de 2 que en uno de 3? No — en un grupo de 2 se mantiene el detalle completo de hoy (incluidos los puntos de acción); en un grupo de 3 se omiten los puntos de acción individuales para que quepan las 3, manteniendo Causa y Solución completas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE identificar como "coincidentes" (agrupables) las incidencias que comparten exactamente el mismo Grupo, Severidad y Categoría (comparación de texto insensible a mayúsculas/minúsculas para Categoría).
- **FR-002**: Para cada conjunto de 2 o más incidencias coincidentes, el sistema DEBE mostrarlas juntas en una única slide en vez de en una slide por incidencia.
- **FR-003**: El sistema NUNCA DEBE colocar más de 3 incidencias en una misma slide; cuando más de 3 incidencias coincidan, DEBE repartirlas en varias slides de hasta 3 cada una, respetando el orden cronológico ya existente para decidir qué incidencias van en cada slide.
- **FR-004**: Las incidencias con Categoría vacía o sin definir NUNCA DEBEN agruparse con ninguna otra incidencia (incluida otra con Categoría también vacía) — cada una mantiene su propia slide individual.
- **FR-005**: El nivel de detalle mostrado por incidencia dentro de una slide agrupada DEBE depender del tamaño del grupo:
  - Grupos de **2** incidencias coincidentes: cada incidencia se muestra con el mismo nivel de detalle que tiene hoy en su propia slide individual (ID, fecha, duración, causa, métricas, solución y puntos de acción).
  - Grupos de **3** incidencias coincidentes: cada incidencia mantiene sus campos de Causa y Solución completos (texto íntegro, sin resumir ni truncar), pero se omiten los puntos de acción individuales de cada incidencia, para que las 3 quepan en la slide.
  - Las métricas (tarjetas de Impacto) y el pie de marcas se mantienen en ambos tamaños de grupo — solo los puntos de acción se recortan al pasar a un grupo de 3.
- **FR-006**: El contenido y la agrupación de las slides DEBE aplicarse de forma idéntica en la vista previa web, el PDF exportado y el PowerPoint exportado — sin divergencias entre los tres formatos.
- **FR-007**: La slide "Incidencias destacadas" del resumen ejecutivo DEBE permanecer sin cambios por esta funcionalidad (sigue eligiendo una incidencia por área de forma independiente al agrupamiento de las slides de detalle).
- **FR-008**: El orden general de las slides del informe DEBE mantener el criterio ya existente (Grupo, luego Fecha); una slide agrupada ocupa la posición correspondiente a la fecha más temprana de sus incidencias.

### Key Entities

- **Incidencia**: entidad ya existente en el informe. Para esta funcionalidad son relevantes sus tres campos de clasificación (Grupo, Severidad, Categoría), usados para decidir el agrupamiento, además de su contenido habitual (causa, métricas, solución, puntos de acción, ID, fecha, duración, marcas).
- **Slide de incidencias agrupadas**: nuevo tipo de slide de detalle que puede contener de 1 (caso sin coincidencias, comportamiento igual que hoy) a 3 incidencias que comparten Grupo, Severidad y Categoría.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un informe con incidencias repetidas de la misma clasificación ocupa menos slides de detalle que hoy (al menos una slide menos por cada grupo de 2 o 3 incidencias coincidentes), sin perder ninguna incidencia del contenido del informe.
- **SC-002**: El 100% de las incidencias de un informe (agrupadas o no) aparecen en al menos una slide, sin duplicados ni omisiones, en los tres formatos (vista previa, PDF, PPTX).
- **SC-003**: Una persona que revisa una slide con varias incidencias agrupadas puede identificar en menos de 5 segundos a qué incidencia concreta pertenece cada dato mostrado.
- **SC-004**: La vista previa, el PDF y el PPTX de un mismo informe muestran exactamente la misma agrupación de incidencias en slides (0 divergencias detectadas).

## Assumptions

- La agrupación es totalmente automática, basada en la coincidencia exacta de Grupo+Severidad+Categoría — no se añade ningún control manual nuevo para forzar o impedir el agrupamiento (a diferencia del flag "Destacar" ya existente para "Incidencias destacadas", que es una funcionalidad distinta y no se ve afectada por este cambio).
- El orden de las incidencias dentro de una misma slide agrupada, y el de las propias slides agrupadas dentro del informe, sigue el criterio de ordenación ya existente (Grupo según el orden fijo actual, luego Fecha ascendente).
- La slide "Incidencias destacadas" del resumen ejecutivo (que ya selecciona una única incidencia por área) es una funcionalidad independiente que no cambia con esta feature.
- Esta agrupación se aplica de forma uniforme a los tres formatos de salida del informe (vista previa web, PDF, PPTX), siguiendo la convención ya establecida en el proyecto de no dejar que estos tres formatos diverjan.
- Las métricas y el pie de marcas no se consideran "recortables" — solo los puntos de acción se omiten al pasar a un grupo de 3, por ser el único campo que se pidió explícitamente eliminar en ese caso.
