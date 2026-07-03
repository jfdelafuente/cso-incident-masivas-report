# Automatización de reportes de incidencias

_Started 2026-06-30 09:24 UTC_

---

## User

Quiero automatizar la generacion de reportes de incidencias semanales

## Assistant

Voy a revisar primero el reporte que adjuntaste para entender su estructura.

_[tool: run_script]_

_[tool: run_script]_

6 slides. Let me extract the slide text content.

_[tool: run_script]_

_[tool: run_script]_

Ya entiendo la estructura: es el **Reporte de Incidencias IT + RED** semanal de Customer & Service Operations (Semana 26, 2026), con portada + incidencias IT (OSP/JZZ, MM) + incidencias RED (>5000 clientes) + otras incidencias RED. Cada incidencia tiene campos consistentes: categoría/severidad, ID, duración, fecha, impacto, causa y solución.

Antes de construir, unas preguntas para acertar con la automatización:

_[tool: questions_v2]_

## User

Questions answered:
- approach: Un formulario interactivo donde introduzco cada incidencia y voy viendo el reporte montarse
- input: Tengo un export (CSV/JSON/Excel) que se podría cargar
- output: Deck PPTX editable (como el original), PDF para enviar, Deck HTML interactivo para presentar
- design: Mantenerlo lo más parecido posible al original
- severity: Sí, y un resumen/dashboard de la semana al inicio
- summary: Sí, una slide resumen ejecutiva al inicio
- audience: Este reporte lo recibirá todo el departamento de Tecnología los lunes a primera hora con la información de incidencias de la semana anterior.

## Assistant

Entendido. Voy a estudiar el diseño visual del original para replicarlo de cerca. Déjame extraer las imágenes y la estructura de tablas/colores.

_[tool: run_script]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: view_image]_

Logos de submarcas (Orange, Lyca, guuk, telecable…) que marcan la marca afectada por cada incidencia. Ahora veo la estructura de tabla y colores del original.

_[tool: run_script]_

_[tool: run_script]_

Tengo la estructura clara. Voy a leer los tokens del sistema y traer el logo MASORANGE.

_[tool: read_file]_

_[tool: copy_files]_

_[tool: read_file]_

_[tool: update_todos]_

Ahora construyo el generador. Es un componente grande, lo escribo completo.

_[tool: dc_write]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

_[tool: eval_js]_

_[tool: get_webview_logs]_

Los helpers de nivel superior no están en alcance de la clase. Los muevo dentro de la clase y reescribo el componente.

_[tool: read_file]_

_[tool: grep]_

El runtime espera solo la clase; muevo todo dentro. Reescribo con el mismo template.

_[tool: dc_write]_

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

Ahora funciona. Veo la portada, el dashboard con cifras correctas (8 incidencias, 34h 21min, 54,3K móvil, 69,2K FTTH, severidad SL1/SL2/SL3, 1 al Ministerio) y la lista de incidencias en el editor. Veamos una slide de incidencia y probemos la edición en vivo.

_[tool: multi_screenshot]_

`scrollIntoView` no movió el contenedor interno. Hago scroll del panel de preview directamente.

_[tool: multi_screenshot]_

_[tool: eval_js]_

10 slides (portada + resumen + 8 incidencias), zoom 0.33, contenido correcto. Ahora hice scroll a la slide 3.

_[tool: save_screenshot]_

El tool de captura no refleja el scroll del contenedor interno. Oculto temporalmente portada y resumen para ver una slide de incidencia.

_[tool: save_screenshot]_

Layout de incidencia correcto. Veamos una slide RED con métricas, más grande para comprobar legibilidad.

_[tool: save_screenshot]_

La slide RED se ve perfecta: cabecera, badge de severidad, métricas como chips, causa y chips de marca. Verifico que la generación de PPTX no falle (API de PptxGenJS).

_[tool: eval_js]_

PptxGenJS OK. Pruebo que la edición en vivo propaga (cambio el año y verifico que portada/resumen se actualizan).

_[tool: eval_js]_

_[tool: eval_js]_

Edición en vivo confirmada. Revierto el cambio de prueba (localStorage es compartido).

_[tool: eval_js]_

Todo funciona: edición en vivo, dashboard que recalcula, 10 slides, export PPTX/PDF/JSON e importación. Limpio temporales y verifico.

_[tool: update_todos]_

_[tool: delete_file]_

He construido un **generador de reportes** que automatiza el proceso semanal.

_[tool: ready_for_verification]_

He construido un **generador de reportes de incidencias** que automatiza tu flujo semanal. A la izquierda editas, a la derecha el reporte se monta en vivo.

**Cómo funciona**
- **Panel editor**: metadatos de la semana (año/semana/rango/departamento) + lista de incidencias plegables. Cada incidencia tiene grupo, severidad, categoría/sistema, ID, fecha, duración, impacto, causa, solución, métricas, clientes y marcas afectadas.
- **Vista en vivo**: cada cambio recalcula la portada y el resumen al instante. Viene precargado con las 8 incidencias reales de la W26 como ejemplo.
- **Resumen ejecutivo** al inicio: total incidencias, IT vs RED, tiempo acumulado, clientes móvil/FTTH, barras por severidad (SL1/SL2/SL3) y nº reportadas al Ministerio.
- **Slides de incidencia**: una por incidencia, con badge de severidad por color, flag «Ministerio», métricas como chips y chips de marca.

**Para el flujo semanal**
- **Importar datos (JSON/CSV)**: carga un export y se genera todo. La cabecera CSV admite columnas `group, severity, category, system, title, ticket, date, duration, impact, metrics, cause, solution, cFTTH, cMobile, brands, ministry`.
- **Guardar JSON**: descarga los datos de la semana (para reusar/versionar).
- **PowerPoint (.pptx)**: genera un .pptx editable nativo desde el navegador, sin intervención mía.
- **PDF**: imprime/guarda en PDF, una incidencia por página.
- Todo se autoguarda en el navegador entre sesiones.

**Decisiones de diseño que conviene comentar**
- Apliqué la marca MASORANGE (negro/blanco/naranja, tipografía Helvetica→Inter). Mantuve la estructura del original (ID/Fecha/Duración + Impacto/Causa/Solución por incidencia) pero más limpia, y añadí lo que pediste (severidad + dashboard).
- Las **marcas afectadas** las puse como chips monocromos de texto en vez de los logos de color del original, porque encajan mejor con la paleta corporativa y se automatizan fácil. Si prefieres los logos reales de submarca, puedo incorporarlos.

¿Quieres que ajuste el mapeo de columnas a tu export real (ServiceNow/Excel) para que la importación sea directa, o que afine alguna severidad/umbral?

## User

subir ligeramente

## Assistant

_[tool: dc_html_str_replace]_

Subí el bloque del título de la portada (de 130px a 168px desde la base).

## User

que quieres decir con ServiceNow/Excel ?

## Assistant

Me refería a **de dónde sacas los datos de las incidencias cada semana**, según lo que respondiste en las preguntas iniciales ("Tengo un export CSV/JSON/Excel que se podría cargar").

La idea: en lugar de teclear las 8 incidencias a mano cada lunes, exportas la lista desde tu herramienta de gestión de incidencias y la cargas con el botón **Importar datos**. Mencioné dos ejemplos comunes:

- **ServiceNow**: la plataforma de ticketing/ITSM (de ahí salen IDs como `INC000004059314`). Suele dejar exportar una vista a CSV/Excel.
- **Excel**: si llevas el registro semanal en una hoja de cálculo, la guardas como CSV.

El generador ya lee CSV, pero **espera unas columnas con nombres concretos** (`group, severity, category, system, title, ticket, date, duration, impact, metrics, cause, solution, cFTTH, cMobile, brands, ministry`). Tu export real seguramente tendrá otros nombres de columna (p. ej. `Number`, `Short description`, `Priority`, `Duration`…).

Por eso te ofrecía: si me pasas **una muestra de tu export** (las cabeceras reales o un archivo de ejemplo), adapto el importador para que mapee tus columnas directamente y la carga sea de un clic, sin renombrar nada.

¿De qué herramienta sale tu listado y cómo son sus columnas?

## User

dame el formato de columna que espera el importador

## Assistant

El importador CSV espera la **primera fila con cabeceras** y una incidencia por fila. Estas son las columnas (el orden da igual; las que falten quedan vacías):

- **group** — grupo/sección. Usa exactamente uno de: `IT OSP/JZZ`, `IT MM`, `RED >5.000 clientes`, `Otras RED`.
- **severity** — `SL1`, `SL2` o `SL3`.
- **category** — categoría (ej. `Degradación`, `Pérdida de servicio móvil`).
- **system** — sistema/origen (ej. `TEIDE`, `Corte de fibra · Telefónica`).
- **title** — título de la incidencia (la frase que va grande en la slide).
- **ticket** — el ID (acepta también la cabecera `id`).
- **date** — fecha/hora (ej. `25/06/2026 9:31`).
- **duration** — duración en formato `12h 29min` o `1h 30m` (de aquí se calcula el tiempo acumulado del resumen).
- **impact** — texto narrativo del impacto.
- **metrics** — métricas, una por línea como `etiqueta | valor`. Como en CSV no caben saltos de línea, escribe `\n` literal entre métricas (lo convierto a saltos).
- **cause** — causa.
- **solution** — solución.
- **cFTTH** — clientes FTTH en miles, número (ej. `10.6`). Acepta también la cabecera `ftth`. Alimenta el total del dashboard.
- **cMobile** — clientes móvil en miles (ej. `34.6`). Acepta también `mobile`.
- **brands** — marcas afectadas separadas por coma (ej. `Orange, Jazztel`).
- **ministry** — `1`, `true`, `si`, `sí` o `x` para marcarla como reportada al Ministerio; vacío = no.

Reglas importantes: separador **coma**; si un campo lleva comas o `\n`, enciérralo entre **comillas dobles** `"…"`.

Ejemplo (dos filas):

```
group,severity,category,system,title,ticket,date,duration,impact,metrics,cause,solution,cFTTH,cMobile,brands,ministry
RED >5.000 clientes,SL2,Pérdida de servicio FTTH y móvil,Corte de fibra · Telefónica,Pérdida de servicio en la provincia de Málaga,2606X52817,22/06/2026 13:05,0h 31min,,"FTTH | 10,6K\nMóvil | 7,3K (32 nodos)\nLlamadas Brújula | 11",Corte de fibra en red de Telefónica.,Recuperado tras intervención de TESA.,10.6,7.3,"MásMóvil, Orange, Jazztel",
RED >5.000 clientes,SL1,Pérdida de servicio móvil,Doble corte TX · Telefónica,Pérdida de servicio móvil en La Palma,2606Y92535,25/06/2026 12:15,12h 25min,Reportada al Ministerio por impacto y duración.,"Móvil | 6,5K (22 nodos)\nLlamadas Brújula | 443",Caída de 22 nodos por doble corte de TX.,Recuperado tras reparar uno de los cortes.,,6.5,MásMóvil,si
```

El JSON sigue la misma estructura: `{ "meta": {year, week, range, dept}, "incidents": [ {group, severity, …} ] }` — que es justo lo que descarga el botón **Guardar JSON**, así que la forma más fácil de ver el formato exacto es exportar una vez y abrir ese archivo.

¿Quieres que añada un botón **"Descargar plantilla CSV"** en el panel para tenerla siempre a mano?

## User

si

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: save_screenshot]_

_[tool: eval_js]_

_[tool: show_html]_

_[tool: eval_js]_

El botón **↓ Descargar plantilla CSV** ya está en el panel, justo bajo "Importar datos". Descarga un CSV con las cabeceras correctas (codificación UTF-8, listo para Excel) y 3 filas de ejemplo —una RED, una IT y una con flag de Ministerio— para que veas el formato y solo tengas que sustituir los datos.

## User

En la portada de ppt original habia un footer con las marcas. ¿se pueden incorporar al footer de la portada originada?

## Assistant

Sí. El original llevaba el lineup de marcas del grupo en el pie. Lo añado a la portada como una fila de marcas (editable), y lo replico en el PPTX. Veo el bloque actual de la portada.

_[tool: read_file]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Ahora el input editor y el pie del PPTX.

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: show_html]_

_[tool: save_screenshot]_

El estado guardado en localStorage no tiene el campo nuevo. Fusiono con los valores por defecto al cargar.

_[tool: dc_js_str_replace]_

_[tool: show_html]_

_[tool: save_screenshot]_

Listo. La portada ahora lleva el lineup de **marcas del grupo** en el pie (igual que el PPTX original), con un separador fino sobre él, y se replica en el PowerPoint generado. Es **editable** desde el nuevo campo "Marcas del grupo · pie de portada" del panel —cambias o quitas marcas separándolas por `·`.

_[tool: ready_for_verification]_

Hecho. Resumen de los cambios:

- **Pie de portada con las marcas del grupo** (Orange, Yoigo, Jazztel, MásMóvil, Simyo, Pepephone, Lebara, Lyca, Llamaya, Euskaltel, R, Telecable, Guuk, Embou), con separador fino encima —recreando el footer del PPTX original.
- Reposicioné el bloque de cifras para dejar sitio limpio al lineup.
- Se replica igual en el **PowerPoint** generado.
- Es **editable** desde el campo nuevo del panel; quita o añade marcas separándolas por `·`.

Las puse como wordmarks en blanco (monocromo) para respetar la paleta corporativa negro/blanco/naranja. Si prefieres los logos de color reales de cada submarca, déjame los SVGs en `assets/` y los incorporo.

## User

elimina este campo

## Assistant

_[tool: dc_html_str_replace]_

Quito también la etiqueta del PPTX para que coincida.

_[tool: dc_js_str_replace]_

Eliminada la etiqueta "Marcas del grupo" del pie de la portada (en pantalla y en el PPTX). Quedan solo las marcas.

## User

los puedes coger de aquí

## Assistant

¡Perfecto! Voy a recortar cada logo de la imagen y montarlos en el pie. Primero la analizo.

_[tool: image_metadata]_

Los logos son transparentes. Los recorto por detección de regiones y los guardo individualmente.

_[tool: run_script]_

14 logos detectados (orange, yoigo, jazztel, masmovil, pepephone, simyo, llamaya, lebara, euskaltel, r, telecable, guuk, embou, populoos). Los recorto y guardo.

_[tool: run_script]_

Verifico los recortes en una hoja de contacto sobre fondo blanco.

_[tool: run_script]_

_[tool: view_image]_

Recortes correctos. Ahora monto el pie con logos sobre banda blanca. Limpio la hoja de contacto y leo el bloque PPTX de portada.

_[tool: delete_file]_

_[tool: grep]_

Monto el pie con los logos reales sobre banda blanca y reposiciono la portada.

_[tool: dc_html_str_replace]_

Ahora el PPTX: incrusto los logos en una banda blanca al pie de la portada.

_[tool: str_replace_edit]_

Limpio el campo editor obsoleto y ajusto el título del PPTX.

_[tool: str_replace_edit]_

_[tool: show_html]_

_[tool: save_screenshot]_

_[tool: save_screenshot]_

La portada ahora lleva los **logos reales** de las 14 marcas en una banda blanca al pie, igual que el original. Limpio temporales y verifico.

_[tool: delete_file]_

_[tool: ready_for_verification]_

Recorté las 14 marcas de tu imagen y las incorporé como **logos reales** en una banda blanca al pie de la portada (orange, yoigo, jazztel, másmóvil, pepephone, simyo, llamaya, lebara, euskaltel, R, telecable, guuk, embou, populoos), y se incrustan igual en el **PowerPoint** generado.

Quedan guardadas en `assets/brands/`, así que si quieres añadir/quitar alguna o reordenarlas, se hace directamente en el pie de la portada. Quité el campo de texto de marcas del panel porque ahora son los logos.

## User

ajusta todos los logo en una sola línea

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: show_html]_

_[tool: save_screenshot]_

All 14 brand logos now sit on a single line in the cover footer, and the PowerPoint export matches. Looks clean and balanced.

_[tool: delete_file]_

Listo — los 14 logos ahora van en una sola línea en el pie de la portada, y el PowerPoint generado lo refleja igual.

## User

si camibio un valor en una slide(SEVERIDAD) que modifica un campo de la slide de "Resumen Ejecutivo"(POR SEVERIDAD) ¿ cuando se actualiza ?

## Assistant

La actualización es **instantánea**, en el mismo momento.

La severidad no se edita sobre la propia slide, sino con el desplegable **Severidad** de la ficha de esa incidencia en el panel izquierdo. En cuanto eliges otro valor (SL1/SL2/SL3):

- cambia el **badge de color** de la slide de esa incidencia, y
- se recalculan al instante las barras de **"Por severidad"** del Resumen Ejecutivo (y el resto de cifras dependientes).

Todo el reporte está conectado a un mismo estado: cualquier cambio dispara un re-render inmediato de las slides afectadas. No hay que guardar ni refrescar; además queda autoguardado en el navegador.

Matiz: el texto libre que editas haciendo clic directamente sobre una slide (modo edición visual) es otra cosa y no alimenta los cálculos. Los campos que afectan al resumen (severidad, duración, clientes, Ministerio) se editan siempre desde el formulario y por eso se reflejan en tiempo real.

## User

"CATEGORIA" debe ser un combo con 2 valores: INDISPONIBILIDAD y DEGRADACIÓN

## Assistant

_[tool: snip]_

_[tool: snip]_

Convierto "Categoría" en un combo. Como las incidencias RED tienen otras categorías (Pérdida de servicio, Saturación…), lo dejo como combo editable con las dos opciones sugeridas, así no se borran esas.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

Hecho. **Categoría** ahora es un combo: al hacer clic ves las dos opciones —**Indisponibilidad** y **Degradación**— y las eliges con un toque.

Lo dejé como combo editable (no desplegable cerrado) a propósito: las incidencias de RED usan otras categorías ("Pérdida de servicio FTTH y móvil", "Saturación en enlaces IP"…), y un desplegable de solo 2 valores habría borrado esas. Así eliges rápido las dos de IT y sigues pudiendo escribir las de RED.

Si confirmas que para **toda** incidencia solo deben existir esas dos categorías, lo cambio a un desplegable estricto.

## User

Incluye tb: Pérdida de servicio FTTH y Pérdida de servicio móvil y sigue dejandolo como editable

## Assistant

Añado las dos opciones más al combo de Categoría.

_[tool: dc_html_str_replace]_

Listo. El combo de **Categoría** ofrece ahora cuatro opciones —Indisponibilidad, Degradación, Pérdida de servicio FTTH y Pérdida de servicio móvil— y sigue siendo editable para escribir cualquier otra (p. ej. "Saturación en enlaces IP").

