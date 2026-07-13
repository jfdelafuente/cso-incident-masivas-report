# Scripts de importación desde el PPT manual antiguo

Herramientas standalone (sin interfaz web) para convertir el PPT manual de
incidencias RED (el formato anterior a esta app) en datos que esta app puede
consumir. No forman parte del backend ni del frontend — son scripts de
un solo uso, pensados para ejecutarse a mano cuando llega un reporte semanal
en el formato antiguo.

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

## Si el PPT tiene una plantilla distinta

Si `import_pptx.py` produce títulos vacíos, tickets con texto de más, o
fechas/duraciones en blanco, el layout de esa plantilla no coincide con las
coordenadas asumidas en el script. Pasos para adaptarlo:

1. Ejecuta `dump_pptx_shapes.py` sobre el fichero problemático y localiza las coordenadas (x, y) reales de título, ID/Fecha/Duración e Impacto/Causa/Solución para una incidencia de ejemplo.
2. Ajusta las constantes de posición en `import_pptx.py` (`parse_incident_group`: los `nearest(...)` con sus `x` objetivo y `tolerance`).
3. Vuelve a ejecutar el script y revisa el JSON de salida antes de confiar en él.
