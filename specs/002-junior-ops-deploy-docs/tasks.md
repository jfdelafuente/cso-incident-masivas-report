---

description: "Task list template for feature implementation"
---

# Tasks: Despliegue y mantenimiento para operador junior

**Input**: Design documents from `/specs/002-junior-ops-deploy-docs/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: No se solicitaron tests automatizados (el repo no tiene framework de test, ver `plan.md` → Testing). Las tareas de verificación siguen `quickstart.md` en su lugar.

**Organization**: Las tareas se agrupan por historia de usuario (spec.md) para permitir implementación y verificación independientes de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (ficheros distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Cada tarea incluye la ruta de fichero exacta

## Path Conventions

Todas las rutas son relativas a la raíz del repo. Los scripts a tocar están en la raíz (`deploy.sh`) y en `backend/`; los documentos operativos están en la raíz.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar que se parte de un estado limpio antes de editar scripts y documentación compartidos.

- [X] T001 Confirmar que la rama `002-junior-ops-deploy-docs` está limpia (`git status`) y actualizada antes de empezar a editar `deploy.sh`, `MANUAL_OPERADOR.md`, `DEPLOYMENT.md`, `STAGING_DEPLOYMENT.md` y `README.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fijar los hechos reales que se van a citar de forma consistente en varios documentos, para que ninguna edición posterior los repita de forma distinta.

**⚠️ CRITICAL**: Los datos de esta fase alimentan tanto la Historia 1 (reescritura de `STAGING_DEPLOYMENT.md`) como la Historia 3 (menciones a `/problemas` en `MANUAL_OPERADOR.md`).

- [X] T002 Confirmar y anotar (para reutilizar literalmente en las tareas siguientes): el bloque `/problemas` real en `nginx.conf` (upstream `gestion_problemas_backend`, puerto 3001, pm2); el número real de opciones del combo Grupo (6: `IT OSP/JZZ`, `IT MM`, `RED >5.000 clientes`, `Otras RED`, `RED - Relevantes por duración/Climatología/Escalados RRII`, `RED - Impacto B2B`) y que Severidad depende del Grupo (`app/report-render.js` → `SEVERITY_KEYS_BY_AREA`); el conjunto actual de KPIs del resumen ejecutivo (Incidencias totales, Reportadas al Ministerio, Impacto en plataforma, Origen Externo) y la sección "Incidencias destacadas".

**Checkpoint**: Hechos verificados y listos — puede empezar el trabajo de cualquier historia de usuario.

---

## Phase 3: User Story 1 - Desplegar una actualización sin sobresaltos (Priority: P1) 🎯 MVP

**Goal**: Cerrar las 3 brechas concretas de `deploy.sh` (aviso de recurso compartido, backup automático de BD, commit previo para rollback) y poner `STAGING_DEPLOYMENT.md`/`DEPLOYMENT.md` al día con el estado real de la aplicación.

**Independent Test**: Un operador junior sigue solo `STAGING_DEPLOYMENT.md`/`DEPLOYMENT.md` para desplegar un cambio trivial y confirma, usando la salida de `deploy.sh` y la documentación, que el despliegue fue correcto y sabe cómo revertirlo si hiciera falta.

### Implementation for User Story 1

- [X] T003 [US1] En `deploy.sh`, antes del `git pull` (Paso 1), capturar el commit actual con `git rev-parse --short HEAD`, imprimirlo (`log_info`), y guardarlo para incluirlo en el resumen final junto al comando exacto de rollback (`git checkout <hash>`) (FR-007, Decisión 5 de `research.md`).
- [X] T004 [US1] En `deploy.sh`, justo antes de hacer backup/aplicar `nginx.conf` (Paso 4), añadir un aviso visible (`log_warn`) listando las apps que comparten esa configuración: `/static`, `/dashboards`, `/data`, `/problemas` (FR-005, Decisión 3 de `research.md`; usar los datos confirmados en T002). El aviso es informativo, no debe pedir confirmación interactiva.
- [X] T005 [US1] En `deploy.sh`, antes de reiniciar el backend (Paso 5, `service.sh restart`), invocar `backend/maintenance.sh backup` para generar un backup fresco de `reports.db` asociado a este despliegue (FR-007, Decisión 4 de `research.md`).
- [X] T006 [P] [US1] Reescribir `STAGING_DEPLOYMENT.md`: eliminar el checklist obsoleto (modo standalone sin backend, 4 opciones de Grupo, 3 opciones fijas de Severidad, KPIs ya retirados del resumen ejecutivo, sección "Próximos pasos" con features ya completadas) y sustituirlo por un checklist de validación que refleje el estado real de la app (usar los hechos de T002); remitir a `DEPLOYMENT.md` para el detalle manual paso a paso en vez de duplicar los pasos de backup/aplicación de `nginx.conf` (Decisión 2 de `research.md`).
- [X] T007 [P] [US1] Actualizar `DEPLOYMENT.md`: añadir `/problemas` a la lista de apps que comparten `nginx.conf`; añadir `--noproxy '*'` de forma consistente a todos los `curl` de ejemplo contra el servidor (incluidos los que pasan por Nginx en el puerto 8081, no solo los directos a `localhost:8000`); refrescar la fecha de "Última actualización".
- [X] T008 [US1] Revisar `README.md` tras T006 y actualizar la frase que describe `STAGING_DEPLOYMENT.md` si su rol o contenido ha cambiado con la reescritura.

**Checkpoint**: `deploy.sh` tiene los 3 comportamientos nuevos y los documentos de despliegue están al día — la Historia 1 es funcional y verificable de forma independiente.

---

## Phase 4: User Story 2 - Confirmar que todo funciona correctamente en cualquier momento (Priority: P2)

**Goal**: Confirmar que el chequeo de salud único ya existente (`maintenance.sh healthcheck`) sigue siendo correcto y que su documentación no ha quedado desfasada tras los cambios de la Historia 1.

**Independent Test**: Sin haber hecho ningún despliegue nuevo, un operador junior ejecuta `maintenance.sh healthcheck` y, usando solo `MANUAL_OPERADOR.md` sección 7, interpreta correctamente el resultado.

> **Nota de alcance**: Según `research.md`, `maintenance.sh`/`service.sh` ya cumplen FR-002/FR-004 sin cambios de comportamiento. Las tareas de esta historia son de verificación, no de implementación nueva.

### Implementation for User Story 2

- [X] T009 [US2] Releer `backend/maintenance.sh` (función `healthcheck`) y `backend/service.sh` (función `status`) y confirmar que ninguno de los ajustes de la Historia 1 (T003-T005) les afecta ni requiere tocar su lógica o mensajes.
- [X] T010 [US2] Releer `MANUAL_OPERADOR.md` sección 7 ("Chequeo de salud") frente al comportamiento real de `maintenance.sh healthcheck` (qué comprueba, en qué orden, formato `OK`/`??`/`!!`) y corregir cualquier descripción que ya no coincida.

**Checkpoint**: El chequeo de salud está confirmado como correcto y su documentación verificada — Historia 2 completa.

---

## Phase 5: User Story 3 - Diagnosticar y resolver un problema conocido sin escalar (Priority: P3)

**Goal**: Ampliar la guía de resolución de problemas (`MANUAL_OPERADOR.md` sección 8) para cubrir `/problemas` como recurso compartido, añadir la nueva capacidad de deshacer un despliegue, y añadir una entrada dedicada para el falso negativo del proxy corporativo.

**Independent Test**: Dada la descripción de uno de los escenarios conocidos (proceso huérfano, nginx sobrescrito, falso negativo del proxy, o despliegue que hay que deshacer), un operador junior localiza la entrada correspondiente en `MANUAL_OPERADOR.md` y la sigue hasta resolverlo.

> **Nota de dependencia**: T012 depende de que T003 y T005 (Historia 1) ya existan en `deploy.sh`, ya que documenta cómo usar exactamente lo que esas tareas producen (el commit impreso y el backup automático).

### Implementation for User Story 3

- [X] T011 [US3] En `MANUAL_OPERADOR.md`, añadir "Gestión de Problemas" (`/problemas`) a la lista de apps que comparten `nginx.conf` en la sección 3 ("Desplegar una actualización") y en la entrada de la sección 8 ("`nginx.conf` compartido sobrescrito a ciegas"), usando los datos confirmados en T002.
- [X] T012 [US3] En `MANUAL_OPERADOR.md`, añadir una nueva sección "Deshacer un despliegue" (tras la sección 3 o como nueva sección 4, renumerando lo que siga) que documente: revertir el código al commit impreso por `deploy.sh` (T003) con `git checkout <hash>`, y restaurar la base de datos con `maintenance.sh restore` eligiendo el backup generado automáticamente por el despliegue (T005).
- [X] T013 [US3] En `MANUAL_OPERADOR.md` sección 8, añadir una entrada de troubleshooting dedicada (síntoma → causa → solución) para "Falso negativo del healthcheck por el proxy corporativo" — hoy solo está mencionado como aviso general en la sección 1, no como escenario diagnosticable por sí solo.
- [X] T014 [US3] Revisar las 5 entradas de la sección 8 de `MANUAL_OPERADOR.md` (proceso huérfano, venv roto, error 500 por campo sin default, nginx sobrescrito, falso negativo del proxy) y confirmar que todas siguen la misma estructura síntoma→causa→solución, sin huecos (SC-003).

**Checkpoint**: La guía de resolución de problemas cubre los 3 incidentes obligatorios de la spec más los adicionales ya existentes, la nueva capacidad de rollback, y la advertencia de recurso compartido actualizada — Historia 3 completa.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cierre de calidad transversal a las tres historias, antes de fusionar la rama.

- [X] T015 [P] Ejecutar `bash -n deploy.sh`, `bash -n backend/service.sh` y `bash -n backend/maintenance.sh` para confirmar que no se ha introducido ningún error de sintaxis.
- [X] T016 [P] Revisar que los enlaces y la frase de propósito de cada documento en `README.md` siguen siendo ciertos tras todos los cambios de esta feature.
- [X] T017 Ejecutar de principio a fin `specs/002-junior-ops-deploy-docs/quickstart.md` como pase de regresión manual final antes de fusionar la rama.
- [X] T018 [P] Confirmar que `CLAUDE.md` no necesita actualizarse (documenta `service.sh`/`maintenance.sh`/`deploy.sh` a nivel de arquitectura de código, no como manual de operador) — comprobación rápida, sin cambios esperados.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: Depende de Setup. Alimenta a las Historias 1 y 3 (los hechos confirmados en T002 se citan literalmente en ambas).
- **User Story 1 (Phase 3)**: Depende de Foundational. Sin dependencia de otras historias.
- **User Story 2 (Phase 4)**: Depende de Foundational. Independiente de la Historia 1 (no requiere que `deploy.sh` haya cambiado).
- **User Story 3 (Phase 5)**: Depende de Foundational. **T012 depende además de T003 y T005 (Historia 1)** — el resto de tareas de la Historia 3 son independientes de la Historia 1.
- **Polish (Phase 6)**: Depende de que las tres historias estén completas.

### User Story Dependencies

- **US1 (P1)**: Ninguna — es la base de la que depende parcialmente US3.
- **US2 (P2)**: Ninguna — verificación pura de herramientas ya existentes.
- **US3 (P3)**: T012 depende de T003/T005 (US1); el resto de tareas de US3 son independientes.

### Within Each User Story

- US1: T003, T004 y T005 tocan el mismo fichero (`deploy.sh`) y van en orden secuencial (el orden real de pasos dentro del script). T006 y T007 tocan ficheros distintos y son paralelos entre sí; T008 va después de T006 porque depende de su resultado.
- US2: T009 antes que T010 (primero se confirma el comportamiento real, luego se corrige la documentación si hace falta).
- US3: T011, T012 y T013 tocan el mismo fichero (`MANUAL_OPERADOR.md`) y van en orden secuencial; T014 va al final como revisión de conjunto.

### Parallel Opportunities

- T006 y T007 (Historia 1, ficheros distintos) pueden ejecutarse en paralelo.
- T015, T016 y T018 (Polish, ficheros/comprobaciones distintas) pueden ejecutarse en paralelo entre sí.

---

## Parallel Example: User Story 1

```bash
# T003, T004, T005 son secuenciales (mismo fichero, deploy.sh):
Task: "Capturar y mostrar el commit previo al git pull en deploy.sh"
Task: "Añadir aviso de recurso compartido antes de tocar nginx.conf en deploy.sh"
Task: "Añadir backup automático de reports.db antes de reiniciar el backend en deploy.sh"

# Una vez completadas, lanzar en paralelo (ficheros distintos):
Task: "Reescribir STAGING_DEPLOYMENT.md"
Task: "Actualizar DEPLOYMENT.md (/problemas, --noproxy, fecha)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (hechos confirmados)
3. Completar Fase 3: Historia 1 (`deploy.sh` + documentos de despliegue al día)
4. **PARAR y VALIDAR**: en este punto ya se puede desplegar y revertir con confianza siguiendo solo la documentación — es la entrega de mayor impacto de esta feature.

### Incremental Delivery

1. Setup + Foundational → hechos confirmados y listos para citar
2. Historia 1 → `deploy.sh` mejorado + documentación de despliegue al día → **entrega principal de esta feature**
3. Historia 2 → chequeo de salud confirmado/documentado correctamente (sin cambios de código)
4. Historia 3 → guía de resolución de problemas ampliada (incluye el rollback que habilitó la Historia 1)
5. Polish → sintaxis, enlaces, regresión final antes de fusionar

### Parallel Team Strategy

Con más de una persona disponible:

1. Completar juntos Setup + Foundational (los hechos son compartidos).
2. Una persona hace T003-T005 (`deploy.sh`) mientras otra empieza T009-T010 (Historia 2, no depende de `deploy.sh`).
3. Una vez lista T003/T005, repartir T006/T007 (Historia 1) y empezar T011-T013 (Historia 3) en paralelo — solo T012 debe esperar a T003/T005.
4. Polish se hace en conjunto al final.

---

## Notes

- [P] tasks = ficheros distintos, sin dependencias pendientes entre sí
- La etiqueta [Story] traza cada tarea a su historia de usuario en `spec.md`
- No hay framework de test automatizado en este repo — las tareas de "verificación" siguen los pasos manuales de `quickstart.md` en su lugar
- Historia 2 no requiere cambios de código: sus tareas son de confirmación y, si hiciera falta, corrección puntual de documentación
- T012 (Historia 3) es la única dependencia cruzada real entre historias — documentarla así evita que alguien la planifique como independiente por error
- Evitar: repetir contenido entre `STAGING_DEPLOYMENT.md` y `DEPLOYMENT.md` en vez de remitir de uno a otro — es exactamente el patrón de duplicación que esta feature corrige
