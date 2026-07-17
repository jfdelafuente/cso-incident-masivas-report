# Feature Specification: Despliegue y mantenimiento para operador junior

**Feature Branch**: `002-junior-ops-deploy-docs`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "En base a lo que tenemos ya creado vamos a crear o mejorar las herramientas necesarias que ayuden al despliegue y mantenimiento de la aplicación en el entorno de producción de forma fácil y clara para un operador junior. Creando y mejorando la documentación."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Desplegar una actualización sin sobresaltos (Priority: P1)

Un operador junior, siguiendo la documentación existente, despliega una actualización de la aplicación en producción y puede confirmar sin ambigüedad que ha funcionado, de forma repetible y sin necesitar ayuda de nadie más.

**Why this priority**: Es la acción más frecuente y de mayor consecuencia que realiza un operador, y el punto de partida de la mayoría de los incidentes ya vividos en este proyecto (configuración de nginx mal aplicada, rutas inconsistentes, falsos negativos del healthcheck).

**Independent Test**: Un operador junior sin experiencia previa en este proyecto sigue únicamente la documentación escrita y las herramientas ya existentes para desplegar un cambio trivial, y confirma que se ha desplegado correctamente sin pedir ayuda a otra persona.

**Acceptance Scenarios**:

1. **Given** una actualización de código lista para desplegar, **When** el operador sigue los pasos documentados, **Then** la aplicación queda desplegada y el operador puede verificarlo sin necesitar conocimientos previos del servidor.
2. **Given** que el operador ha completado un despliegue, **When** revisa la documentación, **Then** encuentra explícitamente cómo confirmar que el despliegue ha sido correcto (y no solo que el script terminó sin errores).

---

### User Story 2 - Confirmar que todo funciona correctamente en cualquier momento (Priority: P2)

Un operador junior, en cualquier momento (antes o después de un despliegue, o simplemente para comprobar), ejecuta un único procedimiento documentado de comprobación de salud y obtiene un veredicto sin ambigüedad: todo correcto, o un problema concreto con indicación de qué hacer.

**Why this priority**: La comprobación de salud es la red de seguridad alrededor de cualquier despliegue y lo primero que debe hacerse cuando algo no va bien; depende de que la Historia 1 exista (la aplicación desplegada) pero no depende de que se esté haciendo un despliegue nuevo.

**Independent Test**: Sin realizar ningún despliegue, un operador junior ejecuta el procedimiento de comprobación de salud y, usando solo la documentación, interpreta correctamente el resultado tanto en un estado sano como en un estado con un fallo ya documentado.

**Acceptance Scenarios**:

1. **Given** la aplicación funcionando correctamente, **When** el operador ejecuta la comprobación de salud documentada, **Then** obtiene una confirmación clara de que todo está bien, sin necesitar interpretar trazas técnicas.
2. **Given** uno de los fallos ya conocidos en este proyecto (por ejemplo, un falso negativo causado por el proxy corporativo), **When** el operador ejecuta la comprobación de salud, **Then** la documentación le permite reconocer que es ese caso concreto y no una caída real.

---

### User Story 3 - Diagnosticar y resolver un problema conocido sin escalar (Priority: P3)

Cuando un operador junior se encuentra con uno de los problemas ya vividos en este proyecto (proceso huérfano ocupando el puerto de la aplicación, falso negativo del healthcheck por el proxy corporativo, configuración compartida de nginx sobrescrita por error, backend caído que necesita recuperarse, o necesidad de restaurar una copia de seguridad), puede encontrar ese escenario exacto en la documentación y resolverlo por sí mismo.

**Why this priority**: Es la pieza más diferencial de "apto para un operador junior" — tarde o temprano todo el mundo se topa con un problema real, y esto determina si puede resolverlo solo o tiene que escalarlo; se apoya en las Historias 1 y 2 (hace falta saber desplegar y comprobar la salud antes de poder diagnosticar con sentido un fallo en cualquiera de las dos).

**Independent Test**: Dada la descripción de uno de los escenarios de problema ya conocidos (sin decirle la causa), un operador junior localiza la entrada correspondiente en la guía de resolución de problemas y la sigue hasta resolverlo, confirmando el resultado con la comprobación de salud de la Historia 2.

**Acceptance Scenarios**:

1. **Given** un proceso huérfano ocupando el puerto de la aplicación, **When** el operador consulta la guía de resolución de problemas, **Then** encuentra el procedimiento exacto para identificarlo y liberarlo sin arriesgarse a matar el proceso equivocado.
2. **Given** que la configuración compartida de nginx se ha sobrescrito por error, **When** el operador consulta la documentación, **Then** encuentra cómo recuperar la configuración anterior sin afectar a otras aplicaciones que comparten el mismo servidor.

---

### Edge Cases

- ¿Qué ocurre cuando un despliegue ya realizado resulta problemático y hay que deshacerlo? (ver FR-007)
- ¿Qué ocurre si un operador, centrado solo en la documentación de esta aplicación, no sabe que la instancia de nginx es compartida con otras aplicaciones (como el dashboard de Gestión de Problemas recién añadido) y podría romper esa otra aplicación sin darse cuenta al "arreglar" la suya?
- ¿Qué ocurre si se ejecuta un comando de mantenimiento mientras el backend está escribiendo en la base de datos?
- ¿Qué ocurre si la documentación y las herramientas reales se desincronizan con el tiempo (un script se actualiza pero el manual no, o al revés)? ¿Cómo lo notaría un operador?
- ¿Qué ocurre si el operador trabaja desde una máquina o red distinta a la habitual, donde el proxy corporativo no está configurado igual? ¿Siguen aplicando los mismos pasos documentados?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La documentación operativa DEBE explicar, en un orden claro y verificable, los pasos para desplegar una actualización de la aplicación en producción, sin asumir conocimiento previo del entorno del servidor.
- **FR-002**: La documentación DEBE incluir un procedimiento único y claro para comprobar el estado de salud de la aplicación desplegada (backend, frontend, base de datos), con la interpretación de cada resultado posible.
- **FR-003**: La documentación DEBE incluir una guía de resolución de problemas que cubra, como mínimo, los incidentes ya conocidos de este proyecto: proceso huérfano ocupando el puerto de la aplicación, falsos negativos del healthcheck causados por el proxy corporativo, y una configuración de nginx compartida sobrescrita por error.
- **FR-004**: Las herramientas de despliegue y mantenimiento DEBEN dejar claro en su propia salida (mensajes en consola) qué ha ocurrido y qué hacer a continuación, sin requerir que el operador interprete trazas técnicas.
- **FR-005**: El sistema DEBE advertir explícitamente, antes de cualquier operación que pueda afectar a otras aplicaciones que comparten el mismo servidor o la misma configuración de nginx, de ese riesgo compartido, para que un operador junior no rompa un servicio ajeno sin saberlo.
- **FR-006**: La documentación DEBE mantenerse coherente con las herramientas reales (scripts, rutas, nombres de tabla, endpoints); cualquier discrepancia detectada entre lo documentado y lo real debe corregirse como parte de esta mejora.
- **FR-007**: El sistema DEBE ofrecer una forma de recuperar la aplicación a un estado funcional anterior tras un despliegue problemático mediante un procedimiento de rollback manual documentado (git + restauración de backup con las herramientas ya existentes), sin necesidad de un script de rollback automatizado nuevo.
- **FR-008**: El alcance de esta mejora se limita a la aplicación de este repositorio (backend FastAPI + frontend estático); el dashboard "Gestión de Problemas" (Next.js/pm2) recién añadido a la configuración compartida de nginx se trata únicamente como una dependencia externa a tener en cuenta (ver FR-005), no como una aplicación a desplegar o mantener desde esta mejora.

### Key Entities

- **Herramienta de despliegue**: script(s) que llevan el código y la configuración actualizados a producción (ya existente: `deploy.sh`).
- **Herramienta de mantenimiento**: comandos de arranque/parada, backup, restauración, rotación de logs y comprobación de salud (ya existentes: `backend/service.sh`, `backend/maintenance.sh`).
- **Documentación operativa**: manuales dirigidos al operador (ya existentes: `MANUAL_OPERADOR.md`, `DEPLOYMENT.md`, `STAGING_DEPLOYMENT.md`) que esta mejora debe actualizar, clarificar y mantener sincronizados con las herramientas reales.
- **Operador junior**: el usuario objetivo de esta mejora — alguien con acceso al servidor de producción y conocimientos básicos de línea de comandos, pero sin contexto previo de las particularidades de este entorno (sin root, sin systemd, proxy corporativo, nginx compartido con otras aplicaciones) ni de los incidentes ya vividos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador junior sin experiencia previa en este proyecto completa un despliegue de una actualización siguiendo solo la documentación, sin necesitar ayuda de otra persona, en menos de 15 minutos.
- **SC-002**: Un operador junior determina si la aplicación está sana o tiene un problema (y cuál) en menos de 2 minutos usando el procedimiento de comprobación de salud documentado.
- **SC-003**: El 100% de los escenarios de fallo ya vividos en este proyecto (proceso huérfano, falso negativo por proxy, configuración de nginx sobrescrita, nombre de tabla incorrecto en la documentación) tienen una entrada correspondiente y resoluble en la guía de resolución de problemas.
- **SC-004**: Cero incidentes de una aplicación ajena rota por una operación de mantenimiento de esta aplicación, gracias a los avisos explícitos sobre recursos compartidos.
- **SC-005**: Una revisión de la documentación frente a las herramientas reales, tras esta mejora, no encuentra discrepancias sin corregir (rutas, nombres de tabla, comandos, endpoints).

## Assumptions

- El "entorno de producción" es el servidor ya descrito en `DEPLOYMENT.md`/`STAGING_DEPLOYMENT.md` (usuario `infocodes`, sin root, sin systemd, proxy corporativo, nginx propio bajo `/infocodes/nginx` compartido con otras aplicaciones) — no se asume ningún entorno nuevo.
- Se parte de las herramientas y documentos ya existentes (`deploy.sh`, `backend/service.sh`, `backend/maintenance.sh`, `MANUAL_OPERADOR.md`, `DEPLOYMENT.md`, `STAGING_DEPLOYMENT.md`) como base a mejorar, no a sustituir por un enfoque completamente nuevo.
- "Operador junior" significa alguien con acceso al servidor y conocimientos básicos de línea de comandos, pero sin contexto previo de las particularidades de este proyecto ni de sus incidentes pasados.
- Deshacer un despliegue problemático se resuelve con el procedimiento manual ya existente (git + `maintenance.sh restore`), documentado con claridad, en vez de construir una herramienta de rollback automatizada nueva (ver FR-007).
- El dashboard "Gestión de Problemas" queda fuera del alcance de esta mejora salvo como advertencia de recurso compartido (ver FR-008); su propio despliegue y mantenimiento no se documentan aquí.
