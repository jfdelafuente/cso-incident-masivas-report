# Data Model: Despliegue y mantenimiento para operador junior

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Esta feature no introduce datos de aplicación nuevos (no toca `reports.db` ni `IncidentBase`). Las "entidades" relevantes aquí son artefactos operativos — documentos, scripts y el estado efímero de un despliegue — no datos de negocio. Se documentan para que `/speckit-tasks` tenga claro qué toca cada tarea.

## Documentos operativos (ya existentes, a corregir/ampliar)

| Documento | Rol | Cambio en esta feature |
|---|---|---|
| `README.md` | Punto de entrada, enlaza al resto | Ajuste menor si cambia el rol de algún documento enlazado |
| `MANUAL_OPERADOR.md` | Operación del día a día (uso poco frecuente) | Añadir `/problemas` a la lista de apps compartidas (secciones 3 y 8); nueva sección "Deshacer un despliegue" |
| `DEPLOYMENT.md` | Referencia manual completa, paso a paso | Añadir `/problemas`; homogeneizar `--noproxy '*'` en todos los `curl`; refrescar fecha |
| `STAGING_DEPLOYMENT.md` | Recetario corto del flujo real (`deploy.sh`) | Reescritura sustancial: eliminar checklist obsoleto, alinear con el estado real de la app, remitir a `DEPLOYMENT.md` para el detalle en vez de duplicarlo |

## Herramientas (ya existentes, la mayoría sin cambios de comportamiento)

| Herramienta | Rol | Cambio en esta feature |
|---|---|---|
| `deploy.sh` | Despliega una actualización completa | 3 ajustes: aviso de recurso compartido (FR-005), backup de BD antes de reiniciar (FR-007), captura e impresión del commit previo (FR-007) |
| `backend/service.sh` | Arranque/parada/estado del backend | Sin cambios — ya cumple FR-004 |
| `backend/maintenance.sh` | Backup/restore/rotate-logs/healthcheck | Sin cambios — ya cumple FR-002/FR-004 |
| `backend/lib.sh` | Helpers de logging compartidos (`log_info`/`log_success`/`log_warn`/`log_error`) | Sin cambios — ya se reutiliza en los 3 scripts anteriores |

## Concepto nuevo (no persistido): estado de despliegue para rollback

No es una entidad de base de datos — es información efímera que `deploy.sh` calcula y muestra en cada ejecución para que un operador junior pueda deshacer un despliegue problemático sin tener que investigar primero.

| Dato | Origen | Uso |
|---|---|---|
| Commit previo al `git pull` (hash corto) | `git rev-parse --short HEAD` antes de actualizar | Se imprime al principio y se recuerda en el resumen final, junto al comando exacto (`git checkout <hash>`) para revertir el código |
| Backup de `reports.db` recién creado | `maintenance.sh backup`, invocado por `deploy.sh` antes de reiniciar el backend | Da un punto de restauración de datos fresco (no el del cron diario, que puede tener hasta 24h) asociado a ese despliegue concreto |

Estos dos datos, combinados, son la base de la nueva sección "Deshacer un despliegue" en `MANUAL_OPERADOR.md`: revertir el código al commit impreso + `maintenance.sh restore` eligiendo el backup recién creado.

## Diagrama de flujo (deploy.sh, con los 3 ajustes de esta feature)

```text
deploy.sh
  │
  ├─▶ [NUEVO] capturar commit actual (git rev-parse --short HEAD) → imprimir
  ├─▶ git pull origin main
  ├─▶ preparar backend (venv + deps)
  ├─▶ inicializar BD si hiciera falta
  ├─▶ [NUEVO] aviso: "nginx.conf es compartido con /static, /dashboards, /data, /problemas"
  ├─▶ backup nginx.conf → aplicar → validar (rollback automático si falla)
  ├─▶ [NUEVO] maintenance.sh backup (backup de reports.db antes de reiniciar)
  ├─▶ service.sh restart
  ├─▶ verificar frontend
  └─▶ resumen final: URLs + estado + [NUEVO] "para revertir: git checkout <hash previo>"
```
