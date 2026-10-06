# Scripts de conversión e interoperabilidad PPT antiguo (Legacy)

Herramientas standalone (sin interfaz web) para interoperar con el formato
antiguo de PowerPoint de incidencias RED (plantilla legacy con tarjetas
agrupadas e ID/Fecha/Duración/Impacto/Causa/Solución). Permiten tanto
importar un PPT antiguo a JSON/API como exportar desde un JSON de la app
al formato PPT clásico.

No hay entorno virtual dedicado para ellos: usan el Python del sistema con
`python-pptx` instalado globalmente (ver «Instalación» abajo).

## Instalación (una sola vez)

```bash
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org python-pptx
```

Si `pip` se queda colgado intentando conectar a una IP interna y acaba en
timeout (proxy corporativo de Windows detectado a nivel de sistema, que
`pip` respeta pero `curl` no), instala con `NO_PROXY="*"` en el entorno:

```bash
NO_PROXY="*" pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org python-pptx
```

## `dump_pptx_shapes.py` — inspeccionar la estructura de un PPT

Diagnóstico puro: vuelca por consola cada shape del PPT (texto + posición
en pulgadas), recursivamente dentro de los grupos. Se usó para
reverse-engineer el layout del PPT antiguo (los shapes no tienen nombres
útiles — todo son "TextBox N"/"Grupo N" autogenerados por PowerPoint), y
sirve para diagnosticar un PPT con una plantilla distinta si
`import_pptx.py` no lo reconoce bien.

```bash
python scripts/dump_pptx_shapes.py archivo.pptx
```

No escribe nada a fichero — solo imprime. Para inspeccionar una diapositiva
concreta, redirige la salida y busca `SLIDE N`:

```bash
python scripts/dump_pptx_shapes.py archivo.pptx > dump.txt
grep -n "SLIDE 5" -A 40 dump.txt
```

## `import_pptx.py` — extraer incidencias a JSON

Lee el PPT y reconstruye una incidencia por cada grupo que contenga un
ticket (letras+dígitos, ≥6 caracteres, sin espacios), clasificando cada
campo por su posición en la plantilla (título, ID/Fecha/Duración,
Impacto/Causa/Solución) — ver los comentarios en el propio script para el
detalle de coordenadas.

### Uso básico

```bash
python scripts/import_pptx.py archivo.pptx -o salida.json
```

Si el nombre de fichero sigue el patrón `AAAAWNN` (p.ej.
`2026W28_ReporteIncidencias_RED.pptx`), `--year`/`--week` se infieren solos.
Si no, hay que pasarlos a mano:

```bash
python scripts/import_pptx.py archivo.pptx -o salida.json --year 2026 --week 28
```

Opciones adicionales:

```bash
python scripts/import_pptx.py archivo.pptx -o salida.json \
  --year 2026 --week 28 \
  --range "06-12 julio 2026" \
  --dept "Customer & Service Operations"
```

- `--range`: si se omite, se calcula solo a partir de las fechas mínima/máxima encontradas en las incidencias.
- `--dept`: por defecto `"Customer & Service Operations"`.

### Cargar directamente en un backend (sin pasar por el JSON)

```bash
python scripts/import_pptx.py archivo.pptx --post-url http://localhost:8000
```

Hace un `POST /api/reports` contra ese backend con el informe ya construido.
**Falla con 409** si ya existe un informe para ese year/week — hay que
borrarlo o cambiar `--year`/`--week` antes de reintentar. Se puede combinar
`-o` y `--post-url` a la vez (escribe el JSON y además lo postea).

### Qué revisar siempre a mano después de extraer

El script imprime un resumen de avisos tras cada ejecución — no lo ignores,
son señales de que el dato de origen es ambiguo o estaba incompleto en el
PPT, no un fallo del script:

- **Placeholders sin rellenar en el PPT original** (`xxxx`, `XXXXX` en duración/solución): el propio reporte manual se entregó incompleto esa semana: no se puede inferir el dato real, hay que rellenarlo a mano en el editor tras importar.
- **Grupos no reconocidos** (p.ej. `"RED B2B"`): esta app solo distingue IT/RED vía una regexp sobre el nombre del grupo (`areaOf()` en `app/app.js`); un grupo nuevo se guarda literal en el campo `group` pero puede no visualizarse igual que "RED >5.000 clientes"/"Otras RED" hasta que se decida cómo clasificarlo.
- **Campos que este PPT nunca registró**: `severity` (queda `SL2` por defecto), `brands`, `ministry`/`platform`/`externalOrigin` (quedan `false`), `actionPoints`, `category`/`system` (todo el texto va a `title`). Revísalos incidencia por incidencia antes de dar el informe por bueno.
- **Duraciones multi-día** (p.ej. `"2días 5h 35m"`, `"5d 11h"`): el parser de duración de la app (`parseDurMin()` en `app/app.js`) solo entiende horas/minutos sueltos, no días — es una limitación ya existente de la app, no de este script. Si una incidencia duró varios días, corrige el valor a mano tras importar o el cálculo de duración total del informe saldrá mal.

### Cómo cargar el JSON resultante en la app

El JSON que produce `-o` tiene el mismo formato que `POST /api/reports`
(payload `ReportCreate`). Para meterlo en el dashboard sin usar
`--post-url`: abre `index.html`, usa el botón **"Importar JSON"** y
selecciona el fichero generado.

## `export_legacy_pptx.py` — generar PPT en formato antiguo desde JSON

Toma un JSON de reporte generado por la aplicación (exportado desde el editor
o devuelto por `/api/reports/{id}`) y construye una presentación de PowerPoint
con la estructura, portada y tarjetas idénticas a las del formato antiguo
(como el ejemplo `2026W39_ReporteIncidencias.pptx`).

### Uso básico

```bash
# Genera automáticamente {year}W{week}_ReporteIncidencias.pptx en el mismo directorio:
python scripts/export_legacy_pptx.py 2026W39_ReporteIncidencias.json

# O especificando la ruta de salida:
python scripts/export_legacy_pptx.py reporte.json -o salida.pptx
```

### Opciones disponibles

```bash
python scripts/export_legacy_pptx.py reporte.json \
  -o salida.pptx \
  --template scripts/legacy_template.pptx \
  --cards-per-slide 2 \
  --quiet
```

- `-o`, `--output`: Ruta del fichero `.pptx` generado. Si se omite, se deduce del año y semana del JSON.
- `-t`, `--template`: Ruta a una plantilla PPTX personalizada. Por defecto busca automáticamente `scripts/legacy_template.pptx` o `2026W39_ReporteIncidencias.pptx`.
- `-l`, `--logo`: Ruta al archivo del logo corporativo (SVG o PNG). Por defecto utiliza automáticamente `app/assets/orange-logo.png`.
- `--cards-per-slide`: Número máximo de tarjetas por diapositiva (por defecto `2`). Si un grupo tiene exactamente 3 incidencias, el script las organiza automáticamente en una sola diapositiva con el diseño de 3 slots idéntico al PPT de referencia.
- `-q`, `--quiet`: Suprime mensajes informativos por pantalla.

### Comportamiento y mapeo de campos

- **Logo corporativo**: Integra automáticamente el logo oficial de Orange en la portada (Slide 0) y en el patrón de diapositivas (Slide Master, visible en la esquina superior derecha de todas las diapositivas de contenido).
- **Portada**: Actualiza los placeholders oficiales de título (`REPORTE INCIDENCIAS IT + RED`), subtítulo (`2026 - Week 39` o `2026 - Week 40`) y departamento (`Customer & Service Operations`).
- **Agrupación en diapositivas**: Agrupa las incidencias por su campo `group` y les asigna el encabezado correspondiente:
  - `RED (Incidencias IT)` / `IT OSP/JZZ` $\rightarrow$ `Incidencias IT`
  - `IT MM` $\rightarrow$ `Incidencias IT MM`
  - `RED >5.000 clientes` $\rightarrow$ `Incidencias RED  (> 5000 CLIENTES)`
  - `RED B2B` $\rightarrow$ `Incidencias RED  (Impacto en B2B)`
  - `Otras RED` $\rightarrow$ `Incidencias RED  (Relevantes por duración/Climatología/Escalados RRII)`
  - `RED (Otras)` $\rightarrow$ `Otras Incidencias RED`
- **Tarjetas y tickets**: Formatea cada tarjeta con su título naranja (`#FF7800`), tickets múltiples en saltos de línea para compatibilidad total con `import_pptx.py`, fecha, duración y columnas de Impacto, Causa y Solución con separadores horizontales.
- **Action Points**: Si la incidencia define puntos de acción (`actionPoints`), se incorporan automáticamente bajo el texto de la columna **Solución** con el encabezado destacado `Action Points:` en verde corporativo y viñetas para cada ticket/acción (`• PROB-XXXXX | Tipo | Descripción`). Ambos scripts (`export_legacy_pptx.py` e `import_pptx.py`) los procesan de forma bidireccional y sin pérdidas en el round-trip.

### Exportación desde la API y el Dashboard

La funcionalidad de `export_legacy_pptx.py` está integrada directamente en el backend FastAPI y en la interfaz de usuario:
- **Dashboard principal (`index.html`)**: Tanto en las tarjetas de la semana actual como en la tabla de semanas anteriores, el desplegable *Exportar* incluye la opción **«🏛️ Descargar PowerPoint (Legacy)»** / **«🏛️ PPT (Legacy)»**.
- **Editor (`editor.html`)**: Botón dedicado **«PPT (Legacy)»** en la barra de herramientas del panel lateral.
- **Endpoints FastAPI (`backend/main.py`)**:
  - `GET /api/reports/{report_id}/legacy-pptx`: Genera en streaming el PPTX legacy del informe guardado en base de datos.
  - `POST /api/reports/export/legacy-pptx`: Recibe un payload JSON arbitrario y devuelve directamente el binario PPTX descargable.
- **Módulo Python reutilizable**:
  - `generate_legacy_pptx(report_data_or_path, ...)`: Retorna la instancia `Presentation`.
  - `generate_legacy_pptx_bytes(report_data_or_path, ...)`: Retorna `bytes` en memoria listos para streaming HTTP o almacenamiento.

## Si el PPT tiene una plantilla distinta

Si `import_pptx.py` produce títulos vacíos, tickets con texto de más, o
fechas/duraciones en blanco, el layout de esa plantilla no coincide con las
coordenadas asumidas en el script. Pasos para adaptarlo:

1. Ejecuta `dump_pptx_shapes.py` sobre el fichero problemático y localiza las coordenadas (x, y) reales de título, ID/Fecha/Duración e Impacto/Causa/Solución para una incidencia de ejemplo.
2. Ajusta las constantes de posición en `import_pptx.py` (`parse_incident_group`: los `nearest(...)` con sus `x` objetivo y `tolerance`).
3. Vuelve a ejecutar el script y revisa el JSON de salida antes de confiar en él.
