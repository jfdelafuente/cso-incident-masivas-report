# Quickstart: Verificación manual — Agrupar incidencias por categorización en una slide

No hay framework de test automatizado en este repo. Esta es la verificación manual de referencia (mismo patrón usado en features anteriores).

## Preparación

1. Arrancar el backend (`cd backend && python main.py`) y el frontend (`cd app && python -m http.server 8080`).
2. Crear o editar un informe en el editor (`editor.html?report=<id>`) con las siguientes incidencias de prueba:
   - **A**: Grupo="IT MM", Severidad="SL2", Categoría="Caída de red", fecha más temprana.
   - **B**: Grupo="IT MM", Severidad="SL2", Categoría="Caída de red" (idéntica a A), fecha posterior a A.
   - **C, D, E, F**: Grupo="RED >5.000 clientes", Severidad="Crítica", Categoría="Fibra cortada" — 4 incidencias idénticas en clasificación, para probar el reparto por overflow (>3).
   - **G**: Grupo="IT OSP/JZZ", Severidad="SL1", Categoría="" (vacía).
   - **H**: igual que G (Grupo="IT OSP/JZZ", Severidad="SL1", Categoría="" vacía) — para probar que dos categorías vacías NUNCA se agrupan entre sí.
   - **I**: una incidencia cualquiera sin ninguna coincidencia de clasificación con las demás.
   - **J, K**: Grupo="IT MM", Severidad="SL1", Categoría="Caída de red" (mismo Grupo+Categoría que A/B, pero con Severidad SL1 en vez de SL2) — para probar que la Severidad no agrupable impide el agrupamiento aunque el resto coincida.

## Casos a verificar

### 1. Agrupamiento básico (grupo de 2) — US1, FR-001, FR-002, FR-005
- En la vista previa del editor, confirmar que A y B aparecen **juntas en una sola slide**, no en dos separadas.
- Confirmar que esa slide muestra el detalle completo de cada una: ID, fecha, duración, métricas, impacto, causa, solución y puntos de acción — igual que hoy tendría una incidencia en su propia slide.
- Confirmar que Grupo/Severidad/Categoría aparecen **una sola vez** en la cabecera de la slide (no repetidos por incidencia).

### 2. Reparto por overflow (grupo de 3 + resto) — FR-003
- Confirmar que C, D, E, F (4 incidencias con la misma clasificación) se reparten en **2 slides**: una con 3 y otra con 1.
- En la slide de 3, confirmar que cada panel mantiene Causa y Solución completas, pero **sin** puntos de acción individuales.
- Confirmar que no falta ni se duplica ninguna de las 4 incidencias (SC-002).

### 3. Categoría vacía nunca agrupa — FR-004, edge case de la spec
- Confirmar que G y H (misma Grupo+Severidad, Categoría vacía ambas) **NO** aparecen juntas — cada una en su propia slide.

### 4. Incidencia sin coincidencias — Edge case de la spec
- Confirmar que I aparece sola en su propia slide, con el layout de hoy sin cambios.

### 5. Coherencia entre vista previa, PDF y PPTX — US2, FR-006, SC-004
- Exportar el mismo informe a PDF (desde el editor, Ctrl+P, y también desde el botón "Descargar PDF" del dashboard) y a PPTX (desde el editor y desde el dashboard).
- Confirmar que la agrupación de incidencias en slides es **idéntica** en los 4 casos (vista previa, PDF-editor, PDF-dashboard, PPTX) — mismas incidencias juntas, mismo reparto de overflow.

### 6. "Incidencias destacadas" sin cambios — FR-007
- Confirmar que la slide del resumen ejecutivo "Incidencias destacadas" sigue mostrando solo 1 incidencia por área (IT/RED), sin verse afectada por el nuevo agrupamiento de las slides de detalle.

### 7. Orden general del informe — FR-008
- Confirmar que el orden de las slides en el informe completo sigue el criterio Grupo→Fecha ya existente, y que cada slide agrupada aparece en la posición que le correspondería a su incidencia con la fecha más temprana.

### 8. Regresión de informes existentes sin coincidencias
- Abrir un informe ya existente (de antes de esta feature) donde ninguna incidencia comparta clasificación — confirmar que el informe se ve exactamente igual que antes (una slide por incidencia, sin cambios visuales).

### 9. Severidad no agrupable nunca agrupa — FR-009
- Confirmar que J y K (mismo Grupo+Categoría que A/B, pero Severidad="SL1") **NO** se agrupan entre sí — cada una en su propia slide, pese a compartir Grupo y Categoría.
- Repetir con una Severidad "Emergencia" en un grupo RED (equivalente a SL1/SL3 en IT) y confirmar el mismo resultado: nunca se agrupa.
