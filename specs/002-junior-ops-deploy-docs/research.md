# Research: Despliegue y mantenimiento para operador junior

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

No quedaron marcadores `[NEEDS CLARIFICATION]` en el Technical Context (las dos decisiones de alcance de la spec ya se resolvieron con valores por defecto documentados en Assumptions). Este documento recoge la **auditoría real** de las herramientas y la documentación existentes — leídas línea a línea antes de planificar — más las decisiones de diseño resultantes.

## Auditoría: estado real de cada herramienta/documento

### `backend/service.sh` — ya cumple casi todo lo que pide la spec
- Usa PID file (no `pkill -f`), verifica que el PID vivo sea realmente "nuestro" proceso vía `/proc/<pid>/cmdline` (evita matar un proceso ajeno que haya reciclado el mismo PID), rechaza arrancar si el puerto ya está ocupado, espera activamente al healthcheck con reintentos (no un `sleep` fijo), y usa `--noproxy '*'` internamente en todas sus llamadas a `curl`.
- Mensajes ya usan el formato `log_info/log_success/log_warn/log_error` de `lib.sh` — legibles sin interpretar trazas técnicas (cumple FR-004).
- **Conclusión**: no necesita cambios de comportamiento para esta feature.

### `backend/maintenance.sh` — igual de maduro
- `backup`: Online Backup API de SQLite (seguro con el backend escribiendo), verificado con `integrity_check`, retención automática de 7.
- `restore`: lista backups, confirma explícitamente, para el backend, guarda un snapshot de seguridad del `reports.db` actual antes de sobrescribir, verifica integridad del restaurado, reinicia.
- `rotate-logs`: copy-truncate seguro sin reiniciar el backend.
- `healthcheck`: backend + nginx + disco + integridad BD + tamaño de log + antigüedad de backup, en un único comando con resumen final — es exactamente el "procedimiento único" que pide FR-002.
- **Conclusión**: no necesita cambios de comportamiento. Cubre FR-002/FR-004 tal cual está.

### `deploy.sh` — funcional, pero con 3 huecos concretos frente a la spec
1. **FR-005 (aviso de recurso compartido)**: el paso 4 hace backup de `nginx.conf` y hace rollback automático si `nginx -t` falla, pero **no imprime ningún aviso** de que ese fichero es compartido con otras apps antes de sobrescribirlo — simplemente lo hace. Un operador junior podría no darse cuenta de que está tocando la configuración de aplicaciones ajenas hasta que algo se rompe.
2. **FR-007 (poder deshacer)**: no hay backup de `reports.db` antes de reiniciar el backend, ni se captura el commit anterior al `git pull` — si un despliegue sale mal, el operador tiene que reconstruir manualmente "a qué commit volver" y no hay garantía de un backup reciente de la BD.
3. **Ninguno de los mensajes de consola de `deploy.sh` menciona `/problemas`** (el dashboard "Gestión de Problemas" añadido a `nginx.conf` después de que se escribieran los documentos actuales) — coherente con que la documentación tampoco lo menciona todavía.

### `MANUAL_OPERADOR.md` — el más sólido de los 3 documentos, con 2 huecos menores
- Ya tiene: tabla de datos fijos, aviso de proxy corporativo, tabla de `service.sh`, explicación de `deploy.sh` con aviso de que `nginx.conf` es compartido (aunque la lista de apps que menciona — `/static`, `/dashboards`, `/data` — **no incluye `/problemas`**, añadido después), backups, restauración, rotación de logs, healthcheck, y una sección 8 de troubleshooting que **ya cubre exactamente** los 3 escenarios obligatorios de FR-003 (proceso huérfano, nginx sobrescrito) más 2 adicionales (venv roto, 500 por campo sin default) — el único que falta es el falso negativo del healthcheck por el *proxy* en sí mismo como síntoma aislado (está mencionado como aviso en la sección 1, pero no como entrada de troubleshooting con síntoma→causa→solución).
- **Huecos**: (a) `/problemas` ausente de las secciones 3 y 8; (b) no existe una sección "cómo deshacer un despliegue" (FR-007) — solo se cubre deshacer una restauración de BD, no revertir el código.

### `DEPLOYMENT.md` — sólido pero con inconsistencia menor y fecha desfasada
- Cubre requisitos previos, los mismos 7 pasos de despliegue manual, aviso de proxy, aviso de nginx compartido (misma lista desactualizada que el manual: sin `/problemas`), checklist de validación, troubleshooting, monitoreo, seguridad opcional.
- **Inconsistencia real encontrada**: los `curl` de la sección "Verificar el despliegue" y del checklist (contra `10.132.68.85:8081`, es decir, a través de Nginx, no directos a `localhost:8000`) **no llevan `--noproxy '*'`**, a diferencia de los ejemplos de la sección 5 (que sí lo llevan, para las llamadas directas a `localhost:8000`). No está probado si el proxy corporativo intercepta también la IP pública del propio servidor cuando se ejecuta *desde* ese servidor — si lo hace, esos comandos fallarían con el mismo falso negativo ya documentado en otro sitio, pero con un aviso que no lo cubre.
- Fecha de "última actualización: 2026-07-03", anterior a varias features ya mergeadas (resumen ejecutivo con Incidencias destacadas, severidad por grupo, Origen Externo, `/problemas` en nginx).

### `STAGING_DEPLOYMENT.md` — el hallazgo principal: sustancialmente desactualizado
Este documento describe una versión **anterior a que existiera el backend FastAPI**:
- Su checklist de validación asume el editor en modo standalone (localStorage, sin backend) como "el despliegue a validar", con una sección "Próximos pasos" que lista *"Backend de persistencia: guardar datos en base de datos en lugar de localStorage"* — ese backend ya existe y lleva meses desplegado.
- El combo "Grupo" se documenta con **4 opciones** (`IT OSP/JZZ`, `IT MM`, `RED >5.000 clientes`, `Otras RED`); la app real tiene **6** desde hace varias features (se añadieron `RED - Relevantes por duración/Climatología/Escalados RRII` y `RED - Impacto B2B`).
- El combo "Severidad" se documenta con **3 opciones fijas** (`SL1`/`SL2`/`SL3`); desde la feature de severidad-por-grupo, las opciones dependen del Grupo seleccionado (IT: SL1/SL2/SL3: RED: Emergencia/Crítica).
- El checklist del "Resumen Ejecutivo" menciona KPIs ya retirados (Duración acumulada, Clientes móvil, Clientes FTTH como tiles) y no menciona ni los KPIs actuales (Reportadas al Ministerio / Impacto en plataforma / Origen Externo) ni la sección "Incidencias destacadas" ni el gráfico "Incidencias por día de la semana".
- No menciona `service.sh`/`maintenance.sh` en absoluto, ni el flujo real de `deploy.sh` con el detalle que sí tiene `DEPLOYMENT.md`.
- **Es, con diferencia, el documento con más discrepancias — y precisamente el que `README.md` señala como "el flujo real"**, lo que lo hace especialmente engañoso para un operador junior que confíe en él.

### `README.md` — correcto, solo necesita reflejar cualquier reorganización
Enlaza correctamente a los 5 documentos relevantes con una frase de propósito cada uno; no necesita cambios salvo que la reescritura de `STAGING_DEPLOYMENT.md` cambie su rol/nombre.

## Decisiones de diseño

### Decisión 1: alcance del trabajo — mayoritariamente documentación, tres ajustes quirúrgicos en herramientas
- **Decision**: no se construye ninguna herramienta nueva (ni script de rollback, ni gestión del dashboard "Gestión de Problemas", conforme a FR-007/FR-008 y las Assumptions de la spec). El trabajo en código se limita a tres ajustes pequeños y acotados en `deploy.sh` (aviso de recurso compartido, backup de BD antes de reiniciar, captura del commit previo). El resto es corrección/reescritura de documentación.
- **Rationale**: la auditoría confirma que `service.sh`/`maintenance.sh` ya satisfacen la mayoría de los requisitos funcionales; el valor real está en cerrar las 3 brechas concretas de `deploy.sh` y en poner la documentación al día con la aplicación real (que es, además, un requisito explícito — FR-006/SC-005).
- **Alternatives considered**: construir un script de rollback automatizado — rechazado, ya lo descarta la propia spec (FR-007) a favor del procedimiento manual ya existente, que solo necesita quedar bien documentado y ligeramente más fácil de ejecutar (con el commit previo ya impreso en pantalla).

### Decisión 2: `STAGING_DEPLOYMENT.md` se reescribe con la misma relación con `DEPLOYMENT.md` que ya describe `README.md`
- **Decision**: `STAGING_DEPLOYMENT.md` pasa a ser un recetario corto y actualizado del flujo real (`deploy.sh` + checklist de validación con las features actuales), remitiendo a `DEPLOYMENT.md` para el detalle manual paso a paso en vez de duplicarlo (los pasos de backup/aplicación de `nginx.conf` están casi calcados en ambos documentos hoy).
- **Rationale**: es exactamente el reparto de responsabilidades que `README.md` ya promete ("flujo real" vs. "referencia completa") pero que `STAGING_DEPLOYMENT.md` dejó de cumplir al no actualizarse; corregirlo también reduce el riesgo de que un futuro cambio se refleje en un documento y no en el otro (el mismo problema de duplicación que `CLAUDE.md` ya advierte para `app.js`/`home.js`).
- **Alternatives considered**: fusionar los tres documentos en uno solo — rechazado, cada uno tiene una audiencia/momento de uso distinto ya validado (referencia manual completa, recetario rápido de staging, operación del día a día) y fusionarlos iría en contra de la brevedad que pide la propia spec para un operador junior.

### Decisión 3: aviso de recurso compartido — informativo, no bloqueante
- **Decision**: el aviso de FR-005 en `deploy.sh` es un mensaje de consola bien visible (`log_warn`) antes de sobrescribir `nginx.conf`, listando las apps afectadas (incluyendo `/problemas`), no una confirmación interactiva.
- **Rationale**: `deploy.sh` es hoy no interactivo y pensado para poder re-ejecutarse sin fricción (`set -e`, idempotente); convertirlo en interactivo rompería ese uso y complicaría automatizarlo en el futuro. La red de seguridad real ya existe (rollback automático si `nginx -t` falla); el aviso solo cierra la brecha de que el operador *sepa* que está tocando algo compartido, no de impedírselo.
- **Alternatives considered**: prompt de confirmación `[s/N]` como en `maintenance.sh restore` — rechazado por romper la idempotencia/no-interactividad ya establecida de `deploy.sh`, y porque restaurar una BD (destructivo e irreversible sin backup previo) no es comparable en riesgo a recargar una config ya respaldada con rollback automático.

### Decisión 4: backup de BD antes de desplegar — automático dentro de `deploy.sh`, reutilizando `maintenance.sh`
- **Decision**: `deploy.sh` invoca `maintenance.sh backup` antes de reiniciar el backend (paso 5), en vez de dejarlo como un paso manual que el operador podría olvidar.
- **Rationale**: la spec pide que se pueda "recuperar la aplicación a un estado funcional anterior" (FR-007); sin un backup fresco justo antes del despliegue, el backup más reciente podría ser de hasta 24h antes (el cron diario), perdiendo cualquier dato guardado ese mismo día. Automatizarlo dentro de `deploy.sh` cuesta una línea y hace que el rollback de datos sea fiable por defecto, no solo si el operador se acuerda.
- **Alternatives considered**: dejarlo solo documentado como paso manual recomendado — rechazado porque un operador junior, justo el perfil objetivo de esta feature, es más probable que se salte un paso manual "recomendado" bajo presión que uno que ya ocurre solo.

### Decisión 5: capturar el commit previo al `git pull` para facilitar el rollback de código
- **Decision**: `deploy.sh` imprime el hash corto del commit actual (antes del `pull`) al principio del despliegue, y lo recuerda en el resumen final junto con el comando exacto para revertir (`git checkout <hash>`).
- **Rationale**: es la pieza que le faltaba al procedimiento manual de rollback (FR-007) para ser realmente fácil de seguir por un operador junior bajo presión — sin necesitar bucear en `git log` para averiguar a qué commit volver.
- **Alternatives considered**: ninguna — es una mejora aditiva de bajo riesgo sin alternativa de diseño real que valorar.

## Resumen de compatibilidad con la spec

| Requisito | Cómo se resuelve |
|---|---|
| FR-001 (pasos de despliegue claros) | Ya cubierto por `DEPLOYMENT.md`/`STAGING_DEPLOYMENT.md`; este último se reescribe para dejar de estar desactualizado |
| FR-002 (comprobación de salud única) | Ya cubierto por `maintenance.sh healthcheck` — sin cambios de comportamiento |
| FR-003 (troubleshooting de los 3 incidentes conocidos) | Ya cubierto en `MANUAL_OPERADOR.md` sección 8 (más 2 entradas adicionales ya existentes) |
| FR-004 (salida clara de las herramientas) | Ya cumplido por `service.sh`/`maintenance.sh`; `deploy.sh` mejora sus mensajes en los 3 puntos de la Decisión 1 |
| FR-005 (aviso de recurso compartido) | Nuevo aviso en `deploy.sh` (Decisión 3) + actualizar la lista de apps compartidas en los 2 documentos que la mencionan |
| FR-006 (documentación coherente con la realidad) | Núcleo de esta feature — reescritura de `STAGING_DEPLOYMENT.md`, correcciones puntuales en `DEPLOYMENT.md`/`MANUAL_OPERADOR.md` |
| FR-007 (recuperar a un estado anterior) | Backup automático de BD (Decisión 4) + commit previo impreso (Decisión 5) + nueva sección "Deshacer un despliegue" en `MANUAL_OPERADOR.md` |
| FR-008 (fuera de alcance: dashboard Gestión de Problemas) | Solo se le nombra como recurso compartido a tener en cuenta, en línea con FR-005 |
