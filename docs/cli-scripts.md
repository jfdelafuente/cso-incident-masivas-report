# 🛠️ Herramientas CLI y Scripts de Ingesta

Guía de herramientas por línea de comandos ubicadas en [`scripts/`](../scripts/) para importación, exportación y calibración de plantillas PowerPoint.

---

## 1. `import_pptx.py` — Ingesta e Inferencia de Incidencias

Extrae las tarjetas de incidencias de un archivo `.pptx` (formato semanal tradicional) y genera un archivo JSON listo para importar o lo envía directamente a la API backend.

### Uso Básico:
```bash
python scripts/import_pptx.py archivo.pptx -o salida.json
```

Si el nombre del archivo contiene el patrón `YYYYWww` (ej. `2026W42_ReporteIncidencias.pptx`), el año y la semana se infieren automáticamente. De lo contrario, se pueden especificar:
```bash
python scripts/import_pptx.py archivo.pptx -o salida.json --year 2026 --week 42
```

### Inyección Directa en Backend:
```bash
python scripts/import_pptx.py archivo.pptx --post-url http://localhost:8000
```
*(Envía un `POST /api/reports` con el informe construido. Si ya existe la semana, devolverá error 409)*.

### Reglas de Inferencia Automática:
* **Severidad**:
  * **IT**: Se asigna `SL1` si el título contiene la palabra *"indisponibilidad"*; de lo contrario se asigna `SL2`.
  * **RED**: Se asigna `EMERGENCIA` si se menciona en el texto; por defecto se asigna `CRITICA`. Nunca se asigna SL1 o SL2 a incidencias de Red.
* **Categoría**:
  * **IT**: Infiere *"Indisponibilidad"*, *"Degradación"* o en blanco.
  * **RED**: Infiere *"Pérdida de servicio móvil"*, *"Pérdida de servicio FTTH"*, *"Pérdida de servicio FTTH y móvil"* o en blanco si no aparece explícitamente en el título.

---

## 2. `export_legacy_pptx.py` — Generación de PowerPoint Corporativo

Genera un archivo `.pptx` a partir de un JSON de reporte semanal aplicando la plantilla corporativa oficial [`scripts/legacy_template.pptx`](../scripts/legacy_template.pptx).

### Uso por Línea de Comandos:
```bash
python scripts/export_legacy_pptx.py reporte.json -o reporte.pptx
```

También es consumido programáticamente por el backend (`backend/main.py`) a través de la función `generate_legacy_pptx_bytes()`.

---

## 3. `dump_pptx_shapes.py` — Inspección de Formas y Coordenadas

Herramienta de diagnóstico que vuelca por consola todas las figuras, cuadros de texto y coordenadas de cada diapositiva de una presentación:

```bash
python scripts/dump_pptx_shapes.py plantilla.pptx > dump.txt
```

Es útil para calibrar nuevas plantillas PowerPoint o comprobar coordenadas de cajas de texto cuando cambia el diseño visual.

