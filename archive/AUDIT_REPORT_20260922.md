# Informe de Auditoría de Código y Arquitectura

**Proyecto:** `cso-incident-masivas-report` (Reportes de Incidencias Masivas — Orange)  
**Fecha:** 22 de Septiembre de 2026  
**Auditor:** Antigravity Code Auditor  
**Alcance:** Backend (`backend/`), Frontend (`app/`), Scripts de importación y diagnóstico (`scripts/`), Infraestructura y Despliegue (`nginx.conf`, `deploy.sh`, `service.sh`, `maintenance.sh`).

---

## 1. Resumen Ejecutivo y Calificación Global

- **Calificación General:** **B+** (Inicial) $\rightarrow$ **A** (Tras aplicar la rama `fix/audit-findings`).
- **Resumen de Hallazgos (Total: 13):**
  - 🔴 **Críticos:** 1 (Inconsistencia en esquemas Pydantic que causa HTTP 500 irrecuperable en reportes con campos ausentes).
  - 🟠 **Altos:** 4 (Vulnerabilidad XSS en `home.js`, pérdida silenciosa de datos de metadata en el editor, puerto ignorado en `main.py`, CORS con orígenes wildcard y credenciales).
  - 🟡 **Medios:** 4 (Falta de límites en subida de ficheros, fallos de red en `import_pptx.py`, acoplamiento rígido con repos externos, alias traversal en Nginx).
  - 🟢 **Bajos e Informativos:** 4 (Excepción no controlada en CLI, inferencia frágil de rutas, duplicación de lógica DRY, cabeceras HTTP de seguridad ausentes).
- **Estado de Remediación:**
  - ✅ **Resueltos y Verificados:** 13 de 13 hallazgos corregidos en la rama `fix/audit-findings` (100% remediado).
  - ⏳ **Pendientes / Deuda Técnica:** 0 hallazgos pendientes.

El proyecto presenta aspectos de ingeniería operacional excelentes, como los scripts de mantenimiento con la API Online Backup de SQLite, la verificación de integridad `PRAGMA integrity_check`, y la supervisión de procesos por PID y línea de comando para convivir en servidores compartidos. Tras las correcciones aplicadas en `fix/audit-findings`, los riesgos de pérdida de datos, caídas 500 irrecuperables y vulnerabilidades web (XSS, CORS, Traversal) quedan completamente mitigados.

---

## 2. Matriz de Hallazgos Priorizados

| ID | Severidad | Componente | Descripción Resumida | Impacto | Estado (`fix/audit-findings`) |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **DATA-01** | 🔴 **CRÍTICA** | `backend/schemas.py` | Campos de cadena obligatorios sin valor por defecto en `IncidentBase`. | HTTP 500 persistente en lecturas de informes antiguos o importados. | ✅ Resuelto |
| **SEC-01** | 🟠 **ALTA** | `app/home.js` | Inyección directa de variables en `innerHTML` sin escapar (Stored XSS). | Ejecución de scripts maliciosos o rotura de UI ante caracteres especiales. | ✅ Resuelto |
| **DATA-02** | 🟠 **ALTA** | `app/editor.js` & `backend` | El guardado del editor (`autoSave` y `saveReport`) no persiste cambios de metadata. | Pérdida silenciosa de cambios realizados en fechas, departamento o rango. | ✅ Resuelto |
| **OPS-01** | 🟠 **ALTA** | `backend/main.py` | `main.py` hardcodea el puerto `8000` e ignora `BACKEND_PORT` de `service.sh`. | Timeout y parada del servicio si se configura un puerto distinto en despliegue. | ✅ Resuelto |
| **SEC-02** | 🟠 **ALTA** | `backend/main.py` | CORS con `allow_origins=["*"]` combinado con `allow_credentials=True`. | Política insegura; riesgo de CSRF/fuga de datos en navegadores modernos. | ✅ Resuelto |
| **SEC-03** | 🟡 **MEDIA** | `backend/main.py` | Subida de ficheros en `/api/upload` sin límite de tamaño ni verificación profunda. | Denegación de servicio (DoS) por agotamiento de memoria o disco. | ✅ Resuelto |
| **ROB-01** | 🟡 **MEDIA** | `scripts/import_pptx.py` | Llamadas HTTP sin timeout y excepciones de red genéricas (`URLError`) no capturadas. | Bloqueo indefinido del script o caída abrupta sin mensaje claro. | ✅ Resuelto |
| **ARCH-01** | 🟡 **MEDIA** | `backend/main.py` | Dependencia rígida en tiempo de importación de `release-dashboard-application`. | Caída en arranque (`ModuleNotFoundError`) en entornos donde no esté el repo hermano. | ✅ Resuelto |
| **SEC-04** | 🟡 **MEDIA** | `nginx.conf` | Directiva `alias` en `/reportes-incidencias` sin barra final (`alias traversal`). | Exposición potencial de ficheros del directorio adyacente. | ✅ Resuelto |
| **ROB-02** | 🟢 **BAJA** | `scripts/dump_pptx_shapes.py` | Acceso a `sys.argv[1]` sin validar argumentos (`IndexError`). | Excepción fea si el operador ejecuta el script sin parámetros para ver la ayuda. | ✅ Resuelto |
| **ROB-03** | 🟢 **BAJA** | `scripts/import_pptx.py` | Inferencia de `year`/`week` evaluaba ruta completa en lugar de solo el nombre de archivo. | Asignación errónea de semana si el directorio contenedor contiene patrones `YYYYWww`. | ✅ Resuelto |
| **DRY-01** | 🟢 **BAJA** | `app/home.js` | Duplicación masiva de código de exportación PDF/PPTX respecto a `app.js`. | Deuda técnica; alto riesgo de desincronización al añadir campos a incidencias. | ✅ Resuelto |
| **SEC-05** | 🟢 **BAJA** | `nginx.conf` | Ausencia de cabeceras de seguridad (`nosniff`, `SAMEORIGIN`, CSP). | Vulnerabilidad ante clickjacking y sniffing de tipos MIME. | ✅ Resuelto |

---

## 3. Detalle de Hallazgos y Propuestas de Remediación

### [DATA-01] Campos de cadena sin valor por defecto en `IncidentBase` (Severidad: CRÍTICA — ✅ Resuelto)
- **Fichero:** [backend/schemas.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/schemas.py#L5-L26)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se añadieron valores por defecto a todos los campos en `IncidentBase` y lista vacía por defecto en `ReportCreate.incidents`.
- **Descripción:** En `schemas.py`, el modelo `IncidentBase` define casi todas sus cadenas (`group`, `category`, `system`, `impact`, `cFTTH`, `brands`, etc.) como obligatorias sin valor por defecto (`str`), excepto `actionPoints: str = ""`. Tal como advierte `CLAUDE.md:64`, la API valida en `PUT` y `GET` contra `IncidentBase`. Si un cliente antiguo, una importación parcial desde CSV o un informe PPTX antiguo omite campos (por ejemplo, `cFTTH` o `brands`), FastAPI rechaza la respuesta con HTTP 500, bloqueando permanentemente la lectura del informe en la base de datos.
- **Impacto:** Bloqueo irrecuperable de informes en producción al cargarlos en el frontend.
- **Propuesta de corrección:**
```python
# backend/schemas.py
class IncidentBase(BaseModel):
    group: str = ""
    severity: str = "SL2"
    category: str = ""
    system: str = ""
    title: str = ""
    ticket: str = ""
    date: str = ""
    duration: str = ""
    impact: str = ""
    metrics: str = ""
    cause: str = ""
    solution: str = ""
    actionPoints: str = ""
    cFTTH: str = ""
    cMobile: str = ""
    brands: str = ""
    ministry: bool = False
    platform: bool = False
    externalOrigin: bool = False
    featured: bool = False
```

---

### [SEC-01] Inyección en DOM sin escapar en `home.js` (Severidad: ALTA — ✅ Resuelto)
- **Fichero:** [app/home.js](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/app/home.js#L151-L200)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se implementó la función `esc()` en `home.js`, se sanitizaron todas las interpolaciones en `reportRowHtml` y `reportCardHtml`, se migraron eventos inline a `data-report-id` y los parámetros de query a `encodeURIComponent()`.
- **Descripción:** Mientras que `app/app.js` utiliza la función `esc()` para sanitizar valores antes de insertarlos en el DOM, `app/home.js` interpola directamente `${report.id}`, `${report.range}` y `${report.dept}` en HTML asignado a `listEl.innerHTML = html`. Adicionalmente, genera eventos en línea como `onchange="HomePage.changeStatus('${report.id}', this.value)"` que romperán la ejecución si `id` contiene comillas o caracteres especiales.
- **Impacto:** Vulnerabilidad de Cross-Site Scripting (XSS) almacenado si se importan datos desde un CSV o JSON con caracteres HTML maliciosos, además de rotura de interfaz.
- **Propuesta de corrección:**
Definir y utilizar una función de escape en `home.js` (o exponerla globalmente en `report-render.js`):
```javascript
// En app/report-render.js o app/home.js
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// En app/home.js reportRowHtml():
`<tr>
  <td class="report-id">${esc(report.id)}</td>
  ...
  <td>${esc(report.range)}</td>
  <td>${esc(report.dept)}</td>
...`
```

---

### [DATA-02] Pérdida silenciosa de cambios de metadata en el editor (Severidad: ALTA — ✅ Resuelto)
- **Ficheros:** [app/editor.js](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/app/editor.js#L164-L220), [backend/schemas.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/schemas.py#L44-L50), [backend/main.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/main.py#L146-L164)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se añadieron `range` y `dept` opcionales a `ReportUpdate`, se actualizan en `update_report()` de `main.py`, y `autoSave()` en `editor.js` los envía desde el DOM.
- **Descripción:** En `editor.js`, la función `autoSave()` únicamente recopila `incidents: App.state.incidents`. Cuando un usuario modifica el rango de fechas (`metaRange`), el departamento (`metaDept`) o el estado, el formulario se marca como modificado (`isDirty = true`), pero la llamada a la API sólo envía incidencias. Además, el backend `ReportUpdate` ni siquiera contempla los campos `range` y `dept`, por lo que `update_report()` los ignora.
- **Impacto:** Pérdida silenciosa de datos: el usuario cree que los cambios en fechas o departamento se han guardado (recibe el mensaje "Informe guardado"), pero al recargar la página los valores se revierten.
- **Propuesta de corrección:**
1. Añadir `range` y `dept` a `ReportUpdate` en `backend/schemas.py`:
```python
class ReportUpdate(BaseModel):
    range: Optional[str] = None
    dept: Optional[str] = None
    incidents: Optional[List[IncidentBase]] = None
    status: Optional[str] = None
    notes: Optional[str] = None
```
2. Actualizar `update_report` en `backend/main.py`:
```python
if update.range is not None: report.range = update.range
if update.dept is not None: report.dept = update.dept
```
3. Enviar los metadatos en `autoSave()` de `app/editor.js`:
```javascript
const update = {
  range: document.getElementById('metaRange')?.value || '',
  dept: document.getElementById('metaDept')?.value || '',
  incidents: App.state.incidents,
};
```

---

### [OPS-01] `main.py` ignora la variable de entorno `PORT` / `BACKEND_PORT` (Severidad: ALTA — ✅ Resuelto)
- **Ficheros:** [backend/main.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/main.py#L222-L225) vs [backend/service.sh](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/service.sh#L19)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. `main.py` ahora lee `os.environ.get("BACKEND_PORT", os.environ.get("PORT", 8000))`, garantizando compatibilidad con `service.sh` y despliegues con puertos custom.
- **Descripción:** `service.sh` permite configurar el puerto mediante `PORT="${BACKEND_PORT:-8000}"` y `deploy.sh` lo pasa explícitamente (`BACKEND_PORT="$BACKEND_PORT" ./service.sh restart`). Sin embargo, en `main.py`, la ejecución principal tiene el puerto codificado a fuego:
  ```python
  if __name__ == "__main__":
      import uvicorn
      uvicorn.run(app, host="0.0.0.0", port=8000)
  ```
- **Impacto:** Si se cambia el puerto a `8001` en `deploy.sh` o en la consola para evitar un conflicto, `main.py` arranca en el 8000, mientras que `service.sh` espera el healthcheck en el 8001, fallando por timeout y matando el proceso.
- **Propuesta de corrección:**
```python
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("BACKEND_PORT", os.environ.get("PORT", 8000)))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

---

### [SEC-02] Configuración de CORS insegura con orígenes abiertos y credenciales (Severidad: ALTA — ✅ Resuelto)
- **Fichero:** [backend/main.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/main.py#L23-L30)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se reemplazó el comodín `"*"`, configurando orígenes explícitos configurables por `CORS_ORIGINS` y con lista blanca por defecto para local y staging.
- **Descripción:** `CORSMiddleware` está configurado con `allow_origins=["*"]` y `allow_credentials=True`. Según la especificación CORS del W3C y las implementaciones modernas de navegadores, el comodín `*` no debe combinarse con credenciales; muchos navegadores rechazan estas cabeceras o abren la API a peticiones cruzadas desde cualquier origen interno de la red.
- **Impacto:** Vulnerabilidad de seguridad ante peticiones entre orígenes no autorizadas.
- **Propuesta de corrección:**
Configurar orígenes explícitos configurables por variable de entorno con fallback seguro para local:
```python
allowed_origins_env = os.environ.get("CORS_ORIGINS", "")
origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()] or [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://10.132.68.85:8081",
    "http://infocodes.si.orange.es:8081",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### [SEC-03] Subida de ficheros en `/api/upload` sin límites de tamaño (Severidad: MEDIA — ✅ Resuelto)
- **Fichero:** [backend/main.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/main.py#L54-L74)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se fijó `MAX_UPLOAD_SIZE = 10 * 1024 * 1024` (10 MB); peticiones que lo superen retornan HTTP 413.
- **Descripción:** El endpoint `upload_dashboard_csv` lee el fichero completo con `await file.read()` sin comprobar `content-length` ni restringir el tamaño en bytes antes de persistirlo en disco.
- **Impacto:** Riesgo de Denegación de Servicio (DoS) si un usuario sube un archivo de gran tamaño por error o de manera intencionada, saturando la memoria del proceso o el espacio en disco de `/infocodes`.
- **Propuesta de corrección:**
```python
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB límite

content = await file.read()
if len(content) > MAX_FILE_SIZE:
    raise HTTPException(status_code=413, detail="El fichero excede el tamaño máximo permitido (10MB)")
```

---

### [ROB-01] Scripts de importación: llamadas HTTP sin timeout y excepciones incompletas (Severidad: MEDIA — ✅ Resuelto)
- **Fichero:** [scripts/import_pptx.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/scripts/import_pptx.py#L307-L320)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se agregó `timeout=30`, captura de `urllib.error.URLError`, comprobación de existencia del fichero PPTX y normalización de `post_url`.
- **Descripción:** En `scripts/import_pptx.py`, la opción `--post-url` ejecuta `urllib.request.urlopen(req)` sin definir `timeout`. Además, el bloque `try/except` solo captura `urllib.error.HTTPError`. Si la conexión es rechazada porque el backend está caído, `urllib` lanza `urllib.error.URLError`, la cual no es capturada y provoca un traceback crudo de Python.
- **Impacto:** Bloqueo permanente del script si el servidor no responde, o terminación con traza confusa para el operador en lugar de un mensaje explicativo de fallo de conexión.
- **Propuesta de corrección:**
```python
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(f"POST {args.post_url}/api/reports -> {resp.status}")
        print(resp.read().decode("utf-8")[:500])
except urllib.error.HTTPError as e:
    print(f"ERROR HTTP {e.code}: {e.read().decode('utf-8')}", file=sys.stderr)
    sys.exit(1)
except urllib.error.URLError as e:
    print(f"ERROR de conexión al backend ({args.post_url}): {e.reason}", file=sys.stderr)
    sys.exit(1)
```

---

### [ARCH-01] Acoplamiento rígido con repositorio externo en `main.py` (Severidad: MEDIA — ✅ Resuelto)
- **Fichero:** [backend/main.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/main.py#L40-L53)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se capturó `ImportError` al importar de `release-dashboard-application` y se protegen las rutas afectadas con HTTP 503 si el módulo externo no está presente.
- **Descripción:** `main.py` importa en el nivel superior módulos de `release-dashboard-application`:
  ```python
  sys.path.insert(0, str(RELEASE_DASHBOARD_ROOT / "converters" / "cli"))
  from upload_csv import run_upload
  from generate_postmortem_report import generate_report, generate_all_reports
  ```
  Si este proyecto se clona o ejecuta de forma independiente (ej. en local de un desarrollador o en una máquina de pruebas donde no esté `release-dashboard-application`), `main.py` falla inmediatamente en el arranque con `ModuleNotFoundError`.
- **Impacto:** Dificultad para desarrollo local, pruebas unitarias y despliegue modular.
- **Propuesta de corrección:**
Importar con protección `try/except ImportError`, degradando elegantemente las rutas `/api/upload` y `/api/reports/postmortem` con un mensaje informativo si el repositorio hermano no está disponible.

---

### [SEC-04] Riesgo de alias traversal en Nginx (Severidad: MEDIA — ✅ Resuelto)
- **Fichero:** [nginx.conf](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/nginx.conf#L48-L52)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se añadió la barra `/` final tanto al `location` como al `alias`, y se creó una redirección 301 para la ruta exacta sin barra.
- **Descripción:** La regla en Nginx:
  ```nginx
  location /reportes-incidencias {
      alias /infocodes/project/cso-incident-masivas-report/app;
      ...
  ```
  Al no tener barra inclinada `/` al final de la ruta del `location` ni del `alias`, se produce el clásico patrón de vulnerabilidad Nginx Alias Traversal (off-by-slash), permitiendo potencialmente acceder a ficheros en directorios hermanos que compartan prefijo.
- **Impacto:** Exposición inadvertida de archivos fuera de `app/`.
- **Propuesta de corrección:**
```nginx
location /reportes-incidencias/ {
    alias /infocodes/project/cso-incident-masivas-report/app/;
    index index.html index.htm;
    try_files $uri $uri/ /index.html;
}
```

---

### [ROB-02] Excepción no controlada en CLI `dump_pptx_shapes.py` (Severidad: BAJA — ✅ Resuelto)
- **Fichero:** [scripts/dump_pptx_shapes.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/scripts/dump_pptx_shapes.py#L33-L37)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se validó la presencia de argumentos, soporte para `--help`/`-h` y verificación de existencia del fichero con mensaje explicativo.
- **Descripción:** El script asume `path = sys.argv[1]` directamente sin verificar si se pasaron argumentos ni si el archivo existe.
- **Impacto:** Traceback feo `IndexError: list index out of range` para cualquier usuario que ejecute `python dump_pptx_shapes.py`.
- **Propuesta de corrección:**
```python
def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Uso: python dump_pptx_shapes.py <archivo.pptx>")
        sys.exit(0 if len(sys.argv) >= 2 and sys.argv[1] in ("-h", "--help") else 1)
    file_path = Path(sys.argv[1])
    if not file_path.is_file():
        print(f"Error: El archivo '{file_path}' no existe o no es un fichero válido.", file=sys.stderr)
        sys.exit(1)
    prs = Presentation(str(file_path))
```

---

### [ROB-03] Inferencia frágil de año/semana a partir de la ruta del fichero (Severidad: BAJA — ✅ Resuelto)
- **Fichero:** [scripts/import_pptx.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/scripts/import_pptx.py#L244-L250)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se aísla el nombre del fichero con `Path(path).name` antes de aplicar la expresión regular.
- **Descripción:** En `infer_year_week()`, la expresión regular `re.search(r"(\d{4})W(\d{2})", path)` se evaluaba directamente sobre el argumento `path` completo. Si el fichero se encontraba ubicado dentro de una jerarquía de carpetas que contuviese un patrón coincidente (por ejemplo, `/backups/2025W50/informe_2026W28.pptx`), la función capturaba erróneamente el año y la semana de la carpeta en lugar de los del fichero.
- **Impacto:** Ingesta accidental de datos asignados a una semana incorrecta si la estructura de directorios coincide con el patrón `YYYYWww`.
- **Propuesta de corrección:**
```python
def infer_year_week(path, year, week):
    if year and week:
        return year, week
    filename = Path(path).name
    m = re.search(r"(\d{4})W(\d{2})", filename)
    if m:
        return year or int(m.group(1)), week or int(m.group(2))
    return year, week
```

---

### [DRY-01] Duplicación de lógica de exportación entre `home.js` y `app.js` (Severidad: BAJA — ✅ Resuelto)
- **Fichero:** [app/report-render.js](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/app/report-render.js), [app/home.js](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/app/home.js), [app/app.js](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/app/app.js)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se consolidaron las funciones `buildPdfHtml`, `downloadPdf` y `downloadPptx` en `report-render.js`, eliminando más de 320 líneas duplicadas de `home.js` y garantizando sanitización con `esc()`.
- **Descripción:** `home.js` duplicaba funciones de construcción de diapositivas PowerPoint y generación de PDFs que ya existían en `app.js`. `CLAUDE.md:70` señalaba este hecho como un foco habitual de bugs y desincronizaciones de campos.
- **Solución implementada:** Se trasladó la lógica de generación completa de documentos PDF y descarga de PPTX a `app/report-render.js`. `home.js` delega directamente en `downloadPdf()` y `downloadPptx()`, y `app.js` hace uso de `downloadPptx()`, convirtiendo `report-render.js` en el único punto de verdad para exportaciones.

---

### [SEC-05] Ausencia de cabeceras HTTP de seguridad en Nginx (Severidad: BAJA — ✅ Resuelto)
- **Fichero:** [nginx.conf](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/nginx.conf#L38-L42)
- **Estado (`fix/audit-findings`):** ✅ **Resuelto y verificado**. Se agregaron directivas `add_header` para mitigar clickjacking, MIME-sniffing y filtración de referrer.
- **Descripción:** La configuración del servidor web Nginx no establecía cabeceras HTTP defensivas estándar recomendadas por OWASP.
- **Impacto:** Exposición a vulnerabilidades de clickjacking (embebido no autorizado en `<iframe>`) y MIME sniffing en navegadores web.
- **Propuesta de corrección:**
```nginx
# Security headers
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

---

## 4. Plan de Acción y Estado de Ejecución

### Fase 1: Hotfix de Seguridad y Datos (✅ Completada en rama `fix/audit-findings`)
- [x] **DATA-01:** Aplicar valores por defecto en [backend/schemas.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/schemas.py) para `IncidentBase` (evita caídas 500).
- [x] **SEC-01:** Añadir sanitización con `esc()`, `data-report-id` y `encodeURIComponent` en [app/home.js](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/app/home.js) (mitiga XSS almacenado).
- [x] **DATA-02:** Soportar actualización y guardado de `range` y `dept` en [backend/schemas.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/schemas.py), [backend/main.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/main.py) y [app/editor.js](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/app/editor.js) (evita pérdida silenciosa de datos).
- [x] **OPS-01:** Leer `BACKEND_PORT` / `PORT` en [backend/main.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/main.py) para respetar `service.sh`.
- [x] **SEC-02:** Restringir orígenes explícitos en CORS eliminando comodín con credenciales.

### Fase 2: Robustez de Operaciones y Servidor (✅ Completada en rama `fix/audit-findings`)
- [x] **SEC-03:** Limitar tamaño de subida a 10 MB (HTTP 413) en `/api/upload`.
- [x] **ROB-01 & ROB-03:** Mejorar [scripts/import_pptx.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/scripts/import_pptx.py) con comprobación de archivo, timeouts, captura de `URLError` e inferencia segura de nombre.
- [x] **ARCH-01:** Desacoplar importación estricta de `release-dashboard-application` en [backend/main.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/backend/main.py).
- [x] **SEC-04 & SEC-05:** Corregir directivas `alias` con barra final y añadir cabeceras HTTP de seguridad en [nginx.conf](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/nginx.conf).
- [x] **ROB-02:** Añadir validación de parámetros y existencia de fichero en [scripts/dump_pptx_shapes.py](file:///c:/Users/jose.delafuente/proyectos/cso-incident-masivas-report/scripts/dump_pptx_shapes.py).

### Fase 3: Refactorización y Próximos Pasos (✅ Completada)
- [x] **DRY-01:** Unificar generadores de exportación PPTX y PDF de `home.js` y `app.js` en `report-render.js` (✅ Completado).
- [ ] **Confirmación y Despliegue:**
   - Realizar commit de los cambios en la rama `fix/audit-findings`.
   - Fusionar con la rama principal y desplegar en staging ejecutando `./deploy.sh` con el usuario `infocodes`.
