---
name: code-auditor
description: >-
  Audita bases de código en busca de vulnerabilidades de seguridad (OWASP), errores de lógica,
  inconsistencias de datos, riesgos de concurrencia, duplicación de código y fallos en scripts CLI,
  backend (FastAPI/Python), frontend (JavaScript/HTML/CSS) e infraestructura (Nginx/Bash).
---

# Code Auditor Skill

Este Skill capacita al asistente para actuar como un auditor de software senior, aplicando un enfoque metódico de revisión estática de código (SAST), análisis de arquitectura y validación de seguridad y fiabilidad.

---

## 1. Metodología de Auditoría en 6 Pilares

Cada revisión debe examinar sistemáticamente los siguientes 6 pilares:

### Pilar 1: Seguridad y Vulnerabilidades (OWASP Top 10)
- **Inyecciones**: SQL injection (consultas crudas vs ORM parametrizado), command injection en scripts bash o llamadas a subprocesos en Python (`subprocess`, `os.system`).
- **XSS (Cross-Site Scripting)**: Manipulación de DOM en frontend mediante `innerHTML`, `outerHTML` o `document.write` con variables o entradas no saneadas. Verificar existencia y uso de funciones de escape HTML (`esc()`).
- **CORS y Autenticación**: Políticas permisivas como `allow_origins=["*"]`, credenciales expuestas, tokens o claves API en código duro.
- **Carga de Archivos y Path Traversal**: Sanitización de nombres de ficheros recibidos (`file.filename`), verificación de extensiones reales vs MIME types, límites de tamaño para prevenir ataques de denegación de servicio (DoS por consumo de disco o memoria).
- **Validación de Parámetros**: Parámetros de URL o de ruta utilizados directamente en rutas de ficheros o llamadas a sistema.

### Pilar 2: Fiabilidad e Integridad de Datos
- **Validación de Esquemas (Pydantic / Dataclasses)**: Campos requeridos vs campos con valor por defecto. Verificar que cambios en esquemas no rompan compatibilidad hacia atrás o causen 500 en lecturas (`GET`) de registros históricos.
- **Operaciones de Actualización (CRUD)**: Verificar que los endpoints `PUT`/`PATCH` actualicen todos los campos que el frontend envía (prevención de pérdida silenciosa de datos).
- **Base de Datos y Transacciones**: Gestión de sesiones (`SessionLocal`), cierre seguro de conexiones (`yield db`, `finally: db.close()`), manejo de concurrencia en SQLite (bloqueos por escritura simultánea, timeouts).
- **Sincronización de Estado en Frontend**: Coherencia entre memoria (`App.state`), almacenamiento local (`localStorage`) y base de datos remota (`ApiClient`). Detección de condiciones de carrera en auto-guardados.

### Pilar 3: Scripts CLI y Herramientas Standalone
- **Validación de Argumentos**: Control robusto de `sys.argv` o `argparse`. Comprobación de argumentos requeridos, tipos y valores fuera de rango antes de procesar.
- **Validación de Archivos de Entrada**: Comprobación explícita de existencia (`Path.exists()`), permisos de lectura y formato antes de parsear (ej. ficheros `.pptx`, `.json`, `.csv`).
- **Resiliencia de Red**: Timeouts explícitos en llamadas HTTP (`urllib.request`, `requests`, `httpx`), captura de excepciones de conexión (`URLError`, `ConnectionError`) además de códigos HTTP (`HTTPError`).
- **Compatibilidad de Entorno**: Codificación de salida en consola (UTF-8 en terminales Windows `cp1252`), detección de variables de proxy (`HTTP_PROXY`, `NO_PROXY`).

### Pilar 4: Calidad de Código, Mantenibilidad y DRY
- **Duplicación de Lógica Crítica (DRY)**: Detección de bloques de código copiados entre componentes (ej. generadores de exportación PDF/PPTX idénticos en distintas páginas).
- **Acoplamiento Indebido**: Dependencias rígidas entre proyectos hermanos o rutas relativas no garantizadas.
- **Fidelidad Documental**: Discrepancias entre la documentación (`CLAUDE.md`, `README.md`, manuales) y la implementación real en código (nombres de tablas, puertos, comandos).

### Pilar 5: Rendimiento y Gestión de Recursos
- **Fugas de Memoria en Frontend**: Acumulación de listeners de eventos DOM no eliminados, intervalos o timeouts sin limpiar (`clearTimeout`).
- **Procesamiento de Archivos Pesados**: Carga en streaming vs lectura completa en memoria (`read()` vs generadores / chunks).
- **Consultas a Base de Datos**: Ausencia de índices en columnas utilizadas en ordenaciones (`order_by(desc(year), desc(week))`) o filtros frecuentes.

### Pilar 6: Operaciones, Despliegue y Servidor Web
- **Supervisión de Procesos**: Scripts de control (`service.sh`, `maintenance.sh`), gestión segura de PID files, comprobación de `/proc/<pid>/cmdline`.
- **Configuración de Servidor Web (Nginx)**: Directivas `alias` sin barra final (riesgo de alias traversal), cabeceras de seguridad (`X-Frame-Options`, `X-Content-Type-Options`, CSP), timeouts en proxies.
- **Mantenimiento y Respaldo**: Estrategias de backup seguro (SQLite Online Backup vs copia directa en caliente), rotación y retención de logs.

---

## 2. Formato Estándar del Informe de Auditoría

Cada auditoría debe estructurarse obligatoriamente con la siguiente plantilla:

```markdown
# Informe de Auditoría de Código: [Nombre del Proyecto]

## 1. Resumen Ejecutivo y Calificación Global
- **Calificación General**: [A / B / C / D / F]
- **Totales de Hallazgos**: [Críticos: X, Altos: Y, Medios: Z, Bajos: W, Informativos: V]
- **Conclusión General**: Breve valoración del estado del código y preparación para producción.

## 2. Matriz de Hallazgos Priorizados
| ID | Severidad | Componente | Descripción Resumida | Impacto |
| :--- | :--- | :--- | :--- | :--- |

## 3. Detalle de Hallazgos y Remediación
Para cada hallazgo:
### [ID] [Título descriptivo] (Severidad: CRÍTICA/ALTA/MEDIA/BAJA)
- **Fichero afectado**: [ruta_con_link](file:///ruta/al/fichero#L1-L10)
- **Descripción**: Explicación técnica de la vulnerabilidad o fallo.
- **Impacto potencial**: Consecuencias reales si se explota o sucede en producción.
- **Código actual**: Extracto del código problemático.
- **Propuesta de solución (Diff)**: Bloque de código con la corrección exacta recomendada.

## 4. Plan de Acción y Próximos Pasos
- Acciones inmediatas prioritarias.
- Mejoras de medio plazo recomendadas.
```

---

## 3. Recursos de Referencia

- Lista de verificación técnica detallada: [audit_checklist.md](./references/audit_checklist.md)
