# Implementation Plan: Despliegue y mantenimiento para operador junior

**Branch**: `002-junior-ops-deploy-docs` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-junior-ops-deploy-docs/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Auditoría + mejora dirigida de las herramientas de despliegue/mantenimiento ya existentes (`deploy.sh`, `backend/service.sh`, `backend/maintenance.sh`) y de la documentación operativa (`MANUAL_OPERADOR.md`, `DEPLOYMENT.md`, `STAGING_DEPLOYMENT.md`, `README.md`), para que un operador junior pueda desplegar, comprobar la salud y resolver problemas conocidos sin ayuda. La investigación (Phase 0) ya ha comparado la documentación contra el comportamiento real de las herramientas y ha encontrado discrepancias concretas — el hallazgo principal es que `STAGING_DEPLOYMENT.md` está sustancialmente desactualizado (checklist de un formulario con opciones de Grupo/Severidad que ya no existen, KPIs del resumen ejecutivo ya eliminados, y una sección de "próximos pasos" que describe features que ya están implementadas desde hace tiempo). El resto del trabajo es una mezcla de correcciones de documentación y tres mejoras pequeñas y quirúrgicas en las herramientas (aviso explícito de recurso compartido antes de tocar `nginx.conf`, backup automático de la BD antes de cada despliegue, y captura del commit previo para poder revertir).

## Technical Context

**Language/Version**: Bash (scripts de despliegue/mantenimiento, ya en `set -u`/`set -e`) + Markdown (documentación). Sin lenguaje nuevo.

**Primary Dependencies**: Ninguna dependencia nueva — se reutilizan herramientas ya presentes en el servidor (`curl`, `sqlite3`, `nginx` binario propio, `git`, `ps`/`lsof`/`df`, `cron` del propio usuario).

**Storage**: N/A para esta feature — no se toca el esquema de `reports.db`; como mucho se automatiza *cuándo* se invoca el backup ya existente (`maintenance.sh backup`), no su implementación.

**Testing**: No hay framework de test en el repo (confirmado en `CLAUDE.md`). Verificación: `bash -n` sobre los scripts tocados (igual que en cambios anteriores de `service.sh`/`maintenance.sh`/`deploy.sh`), y una relectura línea a línea de cada documento frente al comportamiento real de las herramientas (la misma técnica ya usada para detectar el bug histórico `report`/`reports`).

**Target Platform**: El servidor de staging/producción ya descrito (`infocodes`, uid=2001, sin root/sudo/systemd, en `10.132.68.85:8081` / `infocodes.si.orange.es`, con Nginx propio bajo `/infocodes/nginx` compartido con otras apps) — sin entorno nuevo. Los documentos también deben funcionar para un operador que se conecta desde una máquina/red distinta (edge case de la spec).

**Project Type**: Herramientas de operaciones (scripts Bash) + documentación — no es una feature de producto con UI.

**Performance Goals**: No aplica rendimiento en el sentido tradicional; el objetivo relevante es de tiempo humano, ya capturado en SC-001/SC-002 de la spec (desplegar en <15 min, diagnosticar salud en <2 min siguiendo la documentación).

**Constraints**: Sin root/sudo/systemd; proxy corporativo que exige `--noproxy '*'` en cualquier `curl` local; `nginx.conf` es la configuración *completa* del servidor compartido (incluye ahora también el dashboard "Gestión de Problemas" en `/problemas`, añadido después de la última revisión de estos documentos); no introducir un script de rollback automatizado nuevo (ver FR-007 y Assumptions de la spec).

**Scale/Scope**: Un único servidor, 3 scripts existentes a revisar/ajustar (`deploy.sh`, `service.sh`, `maintenance.sh`) y 4 documentos a corregir/mejorar (`MANUAL_OPERADOR.md`, `DEPLOYMENT.md`, `STAGING_DEPLOYMENT.md`, `README.md`); ninguno de gran tamaño.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

El fichero `.specify/memory/constitution.md` de este proyecto sigue sin completarse (plantilla con placeholders, sin principios ratificados) — no hay gates formales que evaluar para esta feature.

**Resultado**: PASS (no hay gates aplicables). Como en la feature anterior (`001-executive-summary-dashboard`), si en el futuro se ratifica una constitución, esta feature debería revalidarse contra ella.

**Re-check post Phase 1 (diseño)**: El diseño resultante (`research.md`, `data-model.md`) no añade dependencias, servicios ni persistencia nueva — son ajustes acotados a scripts ya existentes más correcciones/reescritura de documentación. **Resultado**: PASS, sin cambios respecto al check inicial.

## Project Structure

### Documentation (this feature)

```text
specs/002-junior-ops-deploy-docs/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
deploy.sh                   # AJUSTE: aviso explícito "nginx.conf es compartido" antes
                             #   de sobrescribir (FR-005); backup de reports.db antes de
                             #   reiniciar el backend (vía maintenance.sh backup);
                             #   capturar e imprimir el commit previo al git pull (FR-007)
backend/service.sh           # Sin cambios de comportamiento — ya cumple FR-004
                             #   (mensajes claros, sin trazas técnicas) y ya gestiona el
                             #   caso de puerto ocupado con cuidado
backend/maintenance.sh        # Sin cambios de comportamiento — ya cubre backup/restore/
                             #   rotate-logs/healthcheck con salida clara (FR-002, FR-004)
backend/lib.sh                # Sin cambios — helpers de logging ya compartidos

MANUAL_OPERADOR.md          # ACTUALIZAR: añadir "Gestión de Problemas" (/problemas) a
                             #   la lista de apps que comparten nginx.conf (secciones 3
                             #   y 8); nueva sección "Deshacer un despliegue" (FR-007)
DEPLOYMENT.md                # ACTUALIZAR: añadir /problemas a la lista de apps
                             #   compartidas; homogeneizar todos los curl de ejemplo con
                             #   --noproxy '*'; refrescar fecha de última actualización
STAGING_DEPLOYMENT.md        # REESCRIBIR gran parte: eliminar el checklist obsoleto
                             #   (4 opciones de Grupo / 3 de Severidad, KPIs del resumen
                             #   ejecutivo ya retirados, "próximos pasos" ya completados
                             #   hace tiempo) y sustituirlo por un checklist que refleje
                             #   el estado real de la app (backend FastAPI, 6 grupos,
                             #   severidad dependiente del grupo, KPIs actuales,
                             #   Incidencias destacadas); reducir la duplicación con
                             #   DEPLOYMENT.md remitiendo a él para el detalle manual
README.md                    # Ajuste menor si la reorganización de contenido entre
                             #   documentos lo requiere (enlaces, una frase de resumen)
```

**Structure Decision**: No se crean directorios ni módulos nuevos — todo el trabajo son ediciones acotadas sobre los scripts y documentos ya existentes en la raíz del repo y en `backend/`, siguiendo la disposición ya establecida (scripts junto al código que gestionan, documentación operativa en la raíz). No aplica ninguna de las estructuras de opciones genéricas de la plantilla (no es una librería/CLI/servicio nuevo).

## Complexity Tracking

*No aplica — el Constitution Check no encontró gates ni violaciones que justificar (ver sección anterior).*
