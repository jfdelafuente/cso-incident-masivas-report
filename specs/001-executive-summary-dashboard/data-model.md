# Data Model: Dashboard del Resumen Ejecutivo

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Esta feature no introduce campos, tablas ni endpoints nuevos (ver Assumptions de la spec). Los "datos" nuevos son puramente **derivados en memoria** a partir de entidades ya existentes. Se documentan aquí para que la fase de tareas (`/speckit-tasks`) tenga claro qué se lee y qué se calcula.

## Entidades existentes (sin cambios de esquema)

### Informe semanal (`Report`)
Ya definido en `backend/models.py`/`backend/schemas.py`. Relevante para esta feature solo como contenedor de la lista `incidents` que el dashboard resume.

| Campo | Tipo | Uso en esta feature |
|---|---|---|
| `incidents` | `List[Incidencia]` | Colección sobre la que se calculan las métricas y se elige la incidencia destacada |
| `year`, `week`, `range`, `dept` | primitivos | Sin uso directo en esta feature (ya se muestran en la cabecera del resumen ejecutivo) |

### Incidencia (`IncidentBase`)
Ya definida en `backend/schemas.py`. Campos relevantes para el dashboard (todos ya existentes, ninguno nuevo):

| Campo | Tipo | Uso en esta feature |
|---|---|---|
| `group` | `str` | Determina el área (IT/RED) vía `areaOf(group)` — clasifica cada incidencia y filtra el área al elegir la destacada |
| `severity` | `str` (`SL1`\|`SL2`\|`SL3`\|`EMERGENCIA`\|`CRITICA`) | Rango de severidad dentro de su área (vía `SEVERITY_KEYS_BY_AREA`) — criterio principal de selección (FR-007) y de agrupación (FR-002) |
| `duration` | `str` (p. ej. `"3h 15min"`) | Parseado con `parseDurMin()` — criterio de desempate (FR-007) y ya usado en el total de tiempo de afectación |
| `ministry` | `bool` | Cuenta para "Reportada al Ministerio" (FR-003) |
| `platform` | `bool` | Cuenta para "Impacto en plataforma" (FR-004) |
| `externalOrigin` | `bool` | Cuenta para "Origen Externo" (FR-005) |
| `title` | `str` | Texto mostrado en la reseña de la incidencia destacada (FR-011) |
| `ticket`, `cause`, `impact` | `str` | Candidatos para el "dato clave" adicional de la reseña (más allá del mínimo título+severidad exigido por FR-011) |

## Concepto derivado nuevo (no persistido)

### Incidencia destacada (`HighlightedIncident`)
No es una entidad de base de datos ni un campo nuevo de `IncidentBase` — es el **resultado de una función pura** (`highlightIncident(incidents, area)` en `app/report-render.js`) que se recalcula cada vez que se renderiza el resumen ejecutivo, a partir de la lista de incidencias ya cargada.

| Campo (forma del resultado) | Origen | Notas |
|---|---|---|
| `area` | parámetro de entrada (`'IT'` \| `'RED'`) | — |
| `incident` | la incidencia ganadora, o `null` | `null` cuando el área no tiene incidencias esa semana (FR-010) |
| — | — | No se añaden campos calculados a la incidencia; el consumidor (plantilla HTML/PPTX) decide qué mostrar (mínimo título+severidad, FR-011) leyendo directamente de `incident` |

**Reglas de selección** (determinismo, ver `research.md` Decisión 2-3):
1. Filtrar incidencias cuyo `areaOf(group) === area`.
2. Si no hay ninguna → resultado `null` (FR-010).
3. Elegir la de menor índice en `SEVERITY_KEYS_BY_AREA[area]` (= mayor severidad).
4. Empate → elegir la de mayor `parseDurMin(duration)`.
5. Empate persistente → conservar el orden de aparición en el array recibido (estable).

**Relaciones**: `HighlightedIncident.incident` es una referencia directa (no copia) a un elemento de `Report.incidents` — no se crea ninguna estructura de persistencia nueva.

## Diagrama de flujo de datos

```text
Report.incidents (ya cargado en memoria: editor, dashboard o exportador)
        │
        ├─▶ computeStats(incidents)          → totales, por severidad, marcas (YA EXISTE)
        ├─▶ weekdayBreakdown(incidents)       → gráfico por día (YA EXISTE, sin relación con esta feature)
        └─▶ highlightIncident(incidents,'IT') → incidencia IT destacada  (NUEVO)
            highlightIncident(incidents,'RED')→ incidencia RED destacada (NUEVO)
                        │
                        ▼
        app.js (vista previa web) ─┐
        home.js (PDF)              ├─▶ misma función, mismo resultado → paridad garantizada (FR-009)
        buildPptxDeck() (PPTX)     ─┘
```
