# Checkbox plataforma incidencias

_Started 2026-07-01 08:58 UTC_

---

## User

En el formulario de creaccion de incidenicas debe aparecer el check "Plataforma" para indicar que esa incidencia tuvo impacto en plataforma.

## Assistant

Voy a revisar el archivo actual para entender el formulario de creación de incidencias.

_[tool: read_file]_

Añadiré el check "Plataforma" en el formulario, junto al de Ministerio, y lo reflejaré en el reporte. Empiezo por el formulario y la lógica.

_[tool: dc_html_str_replace]_

Ahora el badge en la cabecera de la diapositiva, junto al de Ministerio:

_[tool: dc_html_str_replace]_

Ahora la lógica: exponer el campo, incluirlo al añadir, en importación/plantilla CSV y en el PPTX.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

El PPTX: mostrar también "Plataforma" en el pie, junto a Ministerio.

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Añadido el check **"Impacto en plataforma"** en el formulario de cada incidencia, junto al de Ministerio. Se refleja como badge en la cabecera de la diapositiva y en el pie del PowerPoint, y está incluido en la importación/plantilla CSV (columna `platform`).

## User

incluye este aspecto en el resumen ejecutivo

## Assistant

Incluyo el dato de plataforma en el resumen. Primero el cálculo y la exposición del valor:

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Ahora el bloque del resumen — divido la tarjeta negra en dos métricas (Ministerio + Plataforma):

_[tool: dc_html_str_replace]_

El PPTX del resumen — añado la segunda métrica dentro de la tarjeta negra:

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Añadido al resumen ejecutivo. La tarjeta negra ahora muestra dos métricas: "Reportadas al Ministerio" y "Con impacto en plataforma", con su recuento de incidencias. Reflejado también en el PowerPoint.

## User

centrar

## Assistant

_[tool: dc_html_str_replace]_

Centrados los tres números de severidad (SL1/SL2/SL3) en el resumen.

## User

Centrar el texto incluido en esta caja

## Assistant

_[tool: dc_html_str_replace]_

Centrado el texto de la caja negra (Ministerio y Plataforma).

## User

Revisa que el pptx generado tiene las ultimas modificaciones

## Assistant

_[tool: grep]_

El PPTX ya incluye todas las modificaciones: badge de plataforma en el pie de cada incidencia, y el recuento "Con impacto en plataforma" en la tarjeta del resumen. Para que coincida con tu último cambio, centro también ese texto en el PPTX:

_[tool: str_replace_edit]_

Verificado. El PPTX ya generaba el badge "Impacto en plataforma" en cada incidencia y el recuento en el resumen; ahora también centra esos textos en la tarjeta para que coincida con la vista. Todo está al día.

_[tool: ready_for_verification]_

Todo correcto. El PPTX incluye las últimas modificaciones: el badge "Impacto en plataforma" en cada incidencia y el recuento "Con impacto en plataforma" en el resumen ejecutivo, con los textos centrados.

