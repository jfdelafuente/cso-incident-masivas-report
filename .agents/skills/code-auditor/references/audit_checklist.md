# Lista de Verificación de Auditoría Técnica (Audit Checklist)

Esta lista detalla los puntos de control concretos a revisar en cada tecnología presente en la base de código.

---

## 1. Backend: FastAPI & Python

- [ ] **Esquemas Pydantic (`schemas.py`)**:
  - [ ] ¿Tienen todos los campos de modelos de entrada/salida valores por defecto cuando procede?
  - [ ] ¿Se utiliza `model_config = ConfigDict(populate_by_name=True)` o alias adecuados para campos serializados en camelCase?
  - [ ] ¿Los modelos `Update` (`ReportUpdate`) contemplan todos los campos que el frontend puede actualizar (ej. `range`, `dept`, `status`, `notes`)?
  - [ ] ¿Hay validación de tipos e intervalos numéricos (ej. `week` entre 1 y 53, `year` > 2000)?
- [ ] **Seguridad de Endpoints (`main.py`)**:
  - [ ] ¿Está CORS configurado con orígenes restringidos para producción en lugar de `allow_origins=["*"]` con credenciales activas?
  - [ ] ¿Los endpoints de subida de ficheros (`/api/upload`) validan extensión y límite de tamaño máximo (`max_size`)?
  - [ ] ¿Los parámetros de path (ej. `{release_name}`) están sanitizados contra path traversal (`..`, slashes)?
  - [ ] ¿El endpoint de health check (`/api/health`) verifica componentes esenciales (como la conexión a base de datos)?
- [ ] **Base de Datos & SQLAlchemy (`models.py`)**:
  - [ ] ¿Se utiliza `check_same_thread=False` adecuadamente para SQLite?
  - [ ] ¿Existen índices en columnas clave consultadas (`Report.year`, `Report.week`) para acelerar ordenaciones?
  - [ ] ¿Las fechas almacenadas usan formato estándar UTC consciente de zona o ISO-8601 (`isoformat()`)?
  - [ ] ¿Se manejan errores de violación de unicidad o clave primaria duplicada con códigos HTTP adecuados (409 Conflict)?

---

## 2. Frontend: Vanilla JS & HTML/CSS

- [ ] **Sanitización y XSS (`home.js`, `editor.js`, `app.js`)**:
  - [ ] ¿Se escapan todas las variables interpoladas en cadenas HTML (`innerHTML = ...`) usando una función de escape consistente (`esc()`)?
  - [ ] ¿Los atributos HTML de eventos en línea (`onchange="HomePage.changeStatus('${report.id}', ...)"`) usan identificadores escapados para evitar rupturas de sintaxis con comillas o inyección de scripts?
  - [ ] ¿Las entradas de usuario en campos de texto multilínea (métricas, puntos de acción) son procesadas de forma segura?
- [ ] **Sincronización y Pérdida de Datos**:
  - [ ] ¿El auto-guardado (`autoSave()`) envía el estado completo actualizado o sólo un subconjunto?
  - [ ] ¿Se gestionan adecuadamente los estados de carga y error en peticiones `ApiClient`?
  - [ ] ¿Existe aviso al usuario si una operación de guardado en segundo plano falla por pérdida de red?
- [ ] **Modularidad y DRY**:
  - [ ] ¿Se reutilizan funciones utilitarias en lugar de duplicarlas entre `app.js` y `home.js` (ej. parseo de métricas, renderizado de slides)?
  - [ ] ¿Se manejan dependencias de scripts sin un sistema de módulos (comprobaciones de `typeof App !== 'undefined'`) con límites de reintentos para no crear bucles infinitos?

---

## 3. Scripts Standalone & Herramientas CLI (`scripts/`)

- [ ] **Manejo de Argumentos**:
  - [ ] ¿Valida el script la existencia de parámetros mínimos requeridos antes de acceder a `sys.argv[1]`?
  - [ ] ¿Dispone de ayuda (`--help` / `argparse`) con descripciones claras de opciones y ejemplos de uso?
- [ ] **Validación de Archivos de Entrada**:
  - [ ] ¿Se comprueba que el archivo a procesar existe y tiene la extensión esperada antes de intentar abrirlo con librerías externas (`python-pptx`)?
- [ ] **Red y Llamadas HTTP**:
  - [ ] ¿Se configuran timeouts explícitos (`timeout=30`) en peticiones HTTP para evitar que los scripts queden colgados indefinidamente?
  - [ ] ¿Se capturan excepciones de red genéricas (`urllib.error.URLError`, `TimeoutError`) además de códigos HTTP (`HTTPError`)?
- [ ] **Entorno y Codificación**:
  - [ ] ¿Se configura explícitamente `sys.stdout.reconfigure(encoding="utf-8")` cuando se ejecuta en Windows (para evitar caídas por `cp1252`)?

---

## 4. Infraestructura, Despliegue y Operaciones

- [ ] **Configuración de Nginx (`nginx.conf`)**:
  - [ ] ¿La directiva `alias` en ubicaciones con prefijo de ruta incluye barra final (`/reportes-incidencias/` -> `.../app/`) para prevenir alias traversal?
  - [ ] ¿Están configuradas las cabeceras de seguridad HTTP básicas (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`)?
  - [ ] ¿Se protegen los ficheros de base de datos `.db` o ficheros de configuración sensibles para que no sean servidos estáticamente?
- [ ] **Supervisión de Procesos (`service.sh`)**:
  - [ ] ¿La comprobación de procesos activos valida la línea de comando exacta para evitar colisiones de PID?
  - [ ] ¿Se utiliza `--noproxy '*'` en comprobaciones de salud en entornos con proxies corporativos configurados?
- [ ] **Mantenimiento y Respaldo (`maintenance.sh`)**:
  - [ ] ¿Las copias de seguridad de SQLite utilizan la API Online Backup (`Connection.backup`) para garantizar consistencia sin parar el servicio?
  - [ ] ¿Se verifican las copias con `PRAGMA integrity_check` tras su creación?
  - [ ] ¿La política de retención elimina backups antiguos de forma segura sin riesgo de borrado accidental de la base de datos viva?
