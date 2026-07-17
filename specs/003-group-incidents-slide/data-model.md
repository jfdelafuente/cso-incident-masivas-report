# Data Model: Agrupar incidencias por categorización en una slide

Esta feature no introduce ninguna entidad persistida nueva ni cambia el esquema de datos existente. Lo que sigue es el modelo del **concepto de renderizado nuevo** (no persistido) que introduce la feature, y cómo se relaciona con la entidad `Incidencia` ya existente.

## Entidades existentes (sin cambios)

### Incidencia

Ya definida en `backend/schemas.py` (`IncidentBase`) y `app/app.js` (`seed()`). Campos relevantes para esta feature (sin cambios de tipo ni de valor por defecto):

| Campo | Tipo | Uso en esta feature |
|---|---|---|
| `group` | string | 1 de las 3 claves de agrupamiento (Grupo) |
| `severity` | string (`SL1`/`SL2`/`SL3` para IT, `EMERGENCIA`/`CRITICA` para RED) | 1 de las 3 claves de agrupamiento (Severidad) |
| `category` | string libre | 1 de las 3 claves de agrupamiento (Categoría) — vacía ⇒ nunca agrupable (FR-004) |
| `ticket`, `date`, `duration` | string | Distintivos por incidencia dentro de una slide agrupada (no se fusionan) |
| `system`, `title` | string | Distintivos por incidencia; título grande de cada panel vía `titleOrCat()` |
| `metrics`, `impact`, `cause`, `solution`, `actionPoints` | string (delimitado) | Contenido por incidencia; `actionPoints` se omite en grupos de 3 (FR-005) |
| `brands` | string (CSV) | Pie "Marcas" por incidencia (no fusionado entre incidencias del grupo) |
| `ministry`, `platform`, `externalOrigin` | boolean | Flags por incidencia (pueden diferir dentro de un mismo grupo) |
| `featured` | boolean | Sin relación con esta feature (pertenece a "Incidencias destacadas", FR-007) |

No se añade ningún campo nuevo a esta entidad.

## Concepto nuevo (no persistido): Grupo de slide

Estructura puramente en memoria, recalculada cada vez que se genera el informe (vista previa/PDF/PPTX) — nunca se guarda en `reports.db` ni se envía al backend.

```
GrupoDeSlide = Incidencia[]   // longitud 1, 2 o 3
```

- **Longitud 1**: incidencia sin coincidencias de Grupo+Severidad+Categoría con ninguna otra (o con Categoría vacía) — se renderiza exactamente igual que hoy.
- **Longitud 2 o 3**: incidencias que comparten exactamente Grupo+Severidad+Categoría (comparación de Categoría insensible a mayúsculas/minúsculas y a espacios en los extremos). Nunca supera 3 (FR-003); si hay más de 3 coincidencias, se reparten en varios `GrupoDeSlide` consecutivos.

**Clave de agrupamiento** (derivada, no almacenada): `group + '|' + severity + '|' + category.trim().toLowerCase()`, solo si `category` no está vacía tras recortar espacios. Categoría vacía ⇒ clave única no compartible (FR-004).

**Invariantes**:
- Todas las incidencias de un `GrupoDeSlide` de longitud ≥2 tienen exactamente el mismo `group`, la misma `severity` y la misma `category` (salvo mayúsculas/minúsculas y espacios).
- El orden de los `GrupoDeSlide` generados, y el de las incidencias dentro de cada uno, respeta el orden ya existente de `sortIncidents()` (Grupo según `GROUP_ORDER`, luego Fecha ascendente) — FR-008.
- La unión de todas las incidencias de todos los `GrupoDeSlide` es exactamente el conjunto de incidencias del informe, sin duplicados ni omisiones (SC-002).

## Flujo de generación (las 3 superficies)

```
incidents[] (del informe)
      │
      ▼
sortIncidents(incidents)              // ya existente, sin cambios
      │
      ▼
groupIncidentsForSlides(incidents)    // NUEVO — devuelve GrupoDeSlide[]
      │
      ├──► app/app.js: renderDeck()          → 1 slide HTML por GrupoDeSlide (vista previa)
      ├──► app/report-render.js: buildPptxDeck() → 1 slide PPTX por GrupoDeSlide
      └──► app/home.js: downloadPDF()        → 1 página HTML por GrupoDeSlide (PDF dashboard)
```

## Layout por tamaño de `GrupoDeSlide` (aplicado igual en las 3 superficies)

| Elemento | Longitud 1 (sin cambios) | Longitud 2 | Longitud 3 |
|---|---|---|---|
| Cabecera de slide | Grupo + Severidad + Categoría/título de la incidencia (como hoy) | Grupo + Severidad + Categoría, **una sola vez** (compartidos por definición) | Igual que longitud 2 |
| Paneles por incidencia | 1 panel a ancho completo (3 columnas Impacto/Causa/Solución, como hoy) | 2 paneles lado a lado, cada uno con detalle completo (Métricas, Impacto, Causa, Solución, Puntos de Acción) | 3 paneles lado a lado, cada uno con Causa y Solución completas, **sin** Puntos de Acción |
| ID / Fecha / Duración / flags / Marcas | Por incidencia (como hoy) | Por incidencia, dentro de cada panel | Por incidencia, dentro de cada panel |

## Contratos de datos

No aplica — esta feature no expone ni consume ninguna API nueva (ver `contracts/README.md`).
