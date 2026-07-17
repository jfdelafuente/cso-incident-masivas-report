# Quickstart: verificar la mejora de despliegue/mantenimiento para operador junior

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Este repo no tiene framework de test automatizado. La verificación es manual: sintaxis de los scripts tocados, una relectura de cada documento frente al comportamiento real, y (si hay acceso a un entorno tipo staging) un paso a paso real de despliegue.

## 1. Sintaxis de los scripts modificados

```bash
bash -n deploy.sh
bash -n backend/service.sh
bash -n backend/maintenance.sh
```

## 2. Verificar los 3 ajustes de `deploy.sh` sin desplegar de verdad

Sin ejecutar `deploy.sh` contra el servidor real, léelo y confirma:
- Imprime el commit corto actual (`git rev-parse --short HEAD`) **antes** del `git pull`.
- Imprime un aviso visible (`log_warn` o equivalente) mencionando `/static`, `/dashboards`, `/data` y `/problemas` **antes** de sobrescribir `nginx.conf`.
- Llama a `maintenance.sh backup` **antes** de `service.sh restart`.
- El resumen final incluye el comando exacto para revertir (`git checkout <hash>`).

Si es posible, ejecuta `deploy.sh` en un entorno de prueba (o en staging, si el cambio es de bajo riesgo y ya se ha coordinado) y confirma en la salida real que aparecen los 3 avisos/pasos nuevos, y que `deploy.sh` sigue terminando con éxito igual que antes.

## 3. Revisión de coherencia documentación ↔ realidad (FR-006 / SC-005)

Para cada documento tocado, contrasta contra el código/comportamiento real:

- **`STAGING_DEPLOYMENT.md`**: abre el editor (`editor.html`) o el dashboard real y confirma que el checklist reescrito coincide — número de opciones de Grupo (6, no 4), que Severidad depende del Grupo seleccionado (no 3 opciones fijas), y que el resumen ejecutivo describe los KPIs actuales (Incidencias totales, Reportadas al Ministerio, Impacto en plataforma, Origen Externo) y la sección "Incidencias destacadas", no los KPIs ya retirados.
- **`MANUAL_OPERADOR.md`** y **`DEPLOYMENT.md`**: confirma que la lista de apps que comparten `nginx.conf` incluye `/problemas` (contrastar contra `nginx.conf` real) y que todos los `curl` de ejemplo contra `localhost`/`127.0.0.1` llevan `--noproxy '*'`.
- **`README.md`**: confirma que los enlaces y la frase de propósito de cada documento siguen siendo ciertos tras los cambios anteriores.

## 4. Simular las 3 historias de usuario de la spec

Sin ser un operador junior de verdad, simula cada historia leyendo solo la documentación (no el código):

1. **US1 (desplegar)**: sigue `STAGING_DEPLOYMENT.md`/`DEPLOYMENT.md` paso a paso como si no conocieras el proyecto. ¿Queda claro en algún punto cómo confirmar que el despliegue fue correcto (no solo que el script no dio error)?
2. **US2 (comprobar salud)**: ejecuta (o lee, si no hay acceso) `maintenance.sh healthcheck` y confirma que la salida es interpretable sin contexto adicional.
3. **US3 (resolver un problema conocido)**: elige uno de los escenarios de la sección 8 de `MANUAL_OPERADOR.md` (por ejemplo, "proceso huérfano en el puerto") sin mirar la solución primero, e intenta encontrarla solo por el síntoma descrito.

## 5. Caso límite: aviso de recurso compartido no debe romper un despliegue normal

Ejecuta (o revisa) `deploy.sh` en un caso donde `nginx.conf` **no** ha cambiado desde el último despliegue — confirma que el nuevo aviso se muestra igualmente (es informativo, no condicional a que haya cambios) y que el despliegue sigue completándose sin pedir confirmación interactiva (Decisión 3 de `research.md`: el aviso no debe bloquear).
