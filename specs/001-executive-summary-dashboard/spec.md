# Feature Specification: Dashboard del Resumen Ejecutivo

**Feature Branch**: `001-executive-summary-dashboard`

**Created**: 2026-07-16

**Status**: Draft

**Input**: User description: "Vamos a mejorar el "Resumen Ejecutivo" que generamos en la colección de incidencias. Cuando un usuario visualice en ppt, pdf o visor quiero que tenga una dashboard con los principales datos de las incidencia: Número incidencias total(mostrar por IT y/o RED), Por severidad, Numero de "REPORTADO AL MINISTERIO", "IMPACTO EN PLATAFORMA", "ORIGEN EXTERNO". breve reseña de las incidencia más reseñables de IT y RED."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el panorama semanal de un vistazo (Priority: P1)

Un responsable que abre el reporte semanal (en PowerPoint, PDF o en el visor web) quiere entender, sin leer incidencia por incidencia, cuántas incidencias hubo, cómo se repartieron entre IT y RED, su gravedad, y cuántas tuvieron impacto especial (Ministerio, Plataforma, Origen Externo).

**Why this priority**: Es el valor central de la petición: consolidar los datos clave de la semana en un único punto de lectura rápida, disponible en cualquiera de los tres formatos.

**Independent Test**: Se genera un informe con una mezcla de incidencias IT y RED, de distintas severidades y con distintas combinaciones de las marcas Ministerio/Plataforma/Origen Externo. Se verifica que el dashboard muestra el total correcto, el desglose IT/RED, el desglose por severidad y los tres contadores de marcas, tanto en el PPT exportado como en el PDF y en el visor web.

**Acceptance Scenarios**:

1. **Given** un informe con incidencias IT y RED de distintas severidades, **When** el usuario abre el dashboard del resumen ejecutivo (en cualquiera de los tres formatos), **Then** ve el número total de incidencias y su desglose entre IT y RED.
2. **Given** ese mismo informe, **When** el usuario consulta el dashboard, **Then** ve cuántas incidencias hay de cada severidad y cuántas están marcadas como "Reportada al Ministerio", "Impacto en plataforma" y "Origen Externo".
3. **Given** un informe sin incidencias registradas, **When** el usuario abre el dashboard, **Then** todos los contadores muestran cero sin errores ni huecos visuales en ningún formato.

---

### User Story 2 - Identificar las incidencias más destacadas sin leer todo el informe (Priority: P2)

Un responsable que solo dispone de unos segundos quiere saber, para IT y para RED por separado, cuál fue la incidencia más relevante de la semana, con una breve reseña de cada una, sin tener que abrir cada diapositiva/página de incidencia individual.

**Why this priority**: Es la capacidad nueva explícitamente pedida (la actual "semana en cifras" ya muestra los totales, pero no destaca ninguna incidencia concreta). Depende de que la User Story 1 ya muestre el resto del dashboard, por lo que se prioriza justo después.

**Independent Test**: Se genera un informe con varias incidencias IT y varias RED de distinta gravedad. Se verifica que el dashboard incluye una reseña breve (título + severidad) de la incidencia de mayor severidad de IT y de la de mayor severidad de RED, mostradas en columnas o bloques separados.

**Acceptance Scenarios**:

1. **Given** un informe con varias incidencias IT y varias RED, **When** el usuario ve el dashboard, **Then** aparece una reseña breve de la incidencia de mayor severidad de IT, separada de la reseña de la incidencia de mayor severidad de RED.
2. **Given** un informe en el que un área (por ejemplo RED) no tiene ninguna incidencia esa semana, **When** el usuario ve el dashboard, **Then** la sección de reseñas de esa área se muestra vacía de forma clara (p. ej. "Sin incidencias RED esta semana") en lugar de un hueco o error.

---

### User Story 3 - Coherencia entre PPT, PDF y visor web (Priority: P3)

Un destinatario del informe que lo recibe como PowerPoint, como PDF, o que simplemente lo consulta en el visor web, quiere ver exactamente los mismos números y las mismas incidencias destacadas sin importar el formato elegido.

**Why this priority**: Evita que los tres formatos de salida diverjan entre sí (ya ha ocurrido antes en esta app que un formato se actualiza y otro se queda desactualizado). Es una garantía de calidad transversal a las dos historias anteriores.

**Independent Test**: Se exporta el mismo informe como PPTX y como PDF, y se abre también en el visor web; se comprueba que los tres muestran los mismos totales, el mismo desglose por severidad, los mismos contadores de marcas y las mismas incidencias destacadas.

**Acceptance Scenarios**:

1. **Given** un informe ya generado, **When** se exporta a PPTX, se exporta a PDF y se visualiza en el navegador, **Then** los tres muestran exactamente los mismos valores en el dashboard del resumen ejecutivo.

---

### Edge Cases

- ¿Qué ocurre cuando el informe no tiene ninguna incidencia? Todos los contadores deben mostrar cero y la sección de incidencias destacadas debe indicarlo claramente, sin errores.
- ¿Qué ocurre cuando un área (IT o RED) no tiene incidencias esa semana, pero la otra sí? El dashboard debe seguir mostrando el desglose y las reseñas del área que sí tiene datos, sin que la ausencia de la otra rompa el diseño.
- ¿Qué ocurre si una incidencia está marcada con más de una de las etiquetas Ministerio/Plataforma/Origen Externo a la vez? Debe contarse en cada uno de los contadores que le correspondan, no solo en uno.
- ¿Qué ocurre si el título o la descripción de una incidencia destacada es muy largo? La reseña debe mantenerse legible y no desbordar el diseño fijo de la diapositiva/página, recortando o resumiendo si es necesario.
- ¿Qué ocurre si varias incidencias empatan en la severidad más alta de su área? Se resuelve el empate eligiendo la de mayor duración; si también empatan en duración, se conserva el orden en que aparecen en el informe (ver FR-007), de forma que el resultado no varíe entre formatos ni entre generaciones sucesivas del mismo informe.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mostrar, para cada informe, el número total de incidencias junto con su desglose entre IT y RED.
- **FR-002**: El sistema DEBE mostrar el número de incidencias agrupado por severidad.
- **FR-003**: El sistema DEBE mostrar el número de incidencias marcadas como "Reportada al Ministerio".
- **FR-004**: El sistema DEBE mostrar el número de incidencias marcadas como "Impacto en plataforma".
- **FR-005**: El sistema DEBE mostrar el número de incidencias marcadas como "Origen Externo".
- **FR-006**: El sistema DEBE incluir en el dashboard una sección de reseñas breves con la incidencia más destacada, mostrando por separado la de IT y la de RED.
- **FR-007**: El sistema DEBE seleccionar la incidencia "más destacada" de cada área como la de mayor severidad dentro de esa área (Emergencia/SL1 primero, luego Crítica/SL2, y así sucesivamente). En caso de empate en la severidad más alta, se elige la de mayor duración; si persiste el empate, se conserva el orden en que aparecen en el informe.
- **FR-008**: El sistema DEBE limitar la sección de reseñas a exactamente 1 incidencia por área (IT y RED), para que la sección se mantenga breve.
- **FR-009**: El dashboard DEBE presentar la misma información (mismos totales, mismo desglose, mismas incidencias destacadas) tanto en el PowerPoint exportado, como en el PDF exportado, como en el visor web.
- **FR-010**: El sistema DEBE manejar informes en los que un área (IT o RED) no tenga ninguna incidencia, mostrando el contador correspondiente a cero y la sección de reseñas de esa área de forma clara (sin errores ni huecos visuales), en cualquiera de los tres formatos.
- **FR-011**: Cada reseña de incidencia destacada DEBE mostrar, como mínimo, el título y la severidad de la incidencia, de forma que el lector pueda identificarla sin necesidad de abrir su diapositiva/página individual.
- **FR-012**: El sistema DEBE contar una incidencia en todos los contadores de marca (Ministerio/Plataforma/Origen Externo) que le correspondan cuando tenga más de una marca activa simultáneamente.

### Key Entities

- **Informe semanal**: la colección de incidencias de una semana concreta (año + número de semana), con sus metadatos; es la fuente de datos que resume el dashboard.
- **Incidencia**: registro individual con grupo (que determina su clasificación IT/RED), severidad, y marcas booleanas de Ministerio, Plataforma y Origen Externo; el dashboard agrega y destaca sobre estos campos.
- **Dashboard del Resumen Ejecutivo**: la vista consolidada objeto de esta especificación — un conjunto de métricas agregadas más una lista curada de incidencias destacadas, presentada de forma idéntica en PPT, PDF y visor web.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un lector puede determinar el total de incidencias de la semana, su reparto IT/RED y su desglose por severidad en menos de 5 segundos, en cualquiera de los tres formatos.
- **SC-002**: El 100% de los informes generados muestran las mismas cifras del dashboard en los tres formatos (PPT, PDF y visor web), sin discrepancias entre ellos.
- **SC-003**: Un lector puede identificar la incidencia IT y la incidencia RED más relevantes de la semana sin necesidad de leer ninguna diapositiva/página de incidencia individual.
- **SC-004**: El 100% de los informes con cero incidencias en un área (IT o RED) se muestran sin errores ni secciones visualmente rotas en ninguno de los tres formatos.

## Assumptions

- Las métricas que ya existen hoy en la aplicación (total/IT/RED, desglose por severidad, contadores de Ministerio/Plataforma/Origen Externo) forman la base de este dashboard; esta funcionalidad lo completa añadiendo la reseña de incidencias destacadas que falta y garantizando que los tres formatos la muestren de forma consistente.
- La clasificación IT/RED sigue basándose en el campo Grupo de la incidencia, tal y como funciona actualmente.
- La selección de la incidencia destacada es automática, a partir de la severidad (y la duración como desempate) ya registrada en cada incidencia, y no requiere que el autor del informe la marque manualmente.
- No se necesitan nuevos campos de incidencia para esta funcionalidad; es una mejora de la capa de presentación sobre los datos ya existentes.
- El dashboard sigue formando parte de la sección/diapositivas de "Resumen Ejecutivo" ya existente, en lugar de convertirse en una página completamente independiente.
