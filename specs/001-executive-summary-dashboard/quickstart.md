# Quickstart: verificar el Dashboard del Resumen Ejecutivo

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Este repo no tiene framework de test automatizado (ver `CLAUDE.md`), así que la verificación de esta feature es manual/funcional, siguiendo el mismo patrón ya usado en el historial de esta rama: comprobación de sintaxis + simulación de las funciones puras vía Node + revisión visual de las 3 superficies.

## 1. Preparar un informe de prueba representativo

Necesitas un informe con, como mínimo:
- Al menos 2 incidencias IT con severidades distintas (para comprobar que se elige la de mayor severidad).
- Al menos 2 incidencias RED con severidades distintas.
- Alguna incidencia con `ministry`/`platform`/`externalOrigin` activos, incluida alguna con más de una marca a la vez (FR-012).
- Un caso de empate de severidad dentro de la misma área, con duraciones distintas (para comprobar el desempate del FR-007).

Puedes editarlo directamente en `editor.html` (modo standalone con `seed()`, sin backend) o crear/cargar un informe real vía el dashboard.

## 2. Verificación de sintaxis (obligatoria antes de cualquier commit)

```bash
node --check app/report-render.js
node --check app/app.js
node --check app/home.js
```

## 3. Verificación funcional de `highlightIncident()` (aislada, sin navegador)

```bash
node -e "
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('app/report-render.js', 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { highlightIncident } = sandbox.window.ReportRender;

const incidents = [
  { group: 'IT MM', severity: 'SL2', duration: '1h 0m', title: 'IT menor' },
  { group: 'IT OSP/JZZ', severity: 'SL1', duration: '2h 0m', title: 'IT mayor severidad' },
  { group: 'RED >5.000 clientes', severity: 'CRITICA', duration: '1h 0m', title: 'RED corta' },
  { group: 'RED >5.000 clientes', severity: 'CRITICA', duration: '5h 0m', title: 'RED larga (debe ganar por desempate)' },
];
console.log('IT destacada:', highlightIncident(incidents, 'IT'));
console.log('RED destacada:', highlightIncident(incidents, 'RED'));
console.log('Área sin incidencias ->', highlightIncident([], 'IT'));
"
```

**Resultado esperado**:
- IT destacada → título `'IT mayor severidad'` (SL1 gana a SL2).
- RED destacada → título `'RED larga (debe ganar por desempate)'` (misma severidad CRITICA, gana la de mayor duración).
- Área sin incidencias → `null` (o el valor equivalente que documente el diseño final), nunca un error.

## 4. Verificación del PPTX (sin abrir PowerPoint)

Mock ligero de `pptxgenjs` para ejercitar `buildPptxDeck()` end-to-end y detectar errores de referencia/layout:

```bash
node -e "
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('app/report-render.js', 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const RR = sandbox.window.ReportRender;
function mockSlide() { return { background: null, addText: () => {}, addShape: () => {}, addImage: () => {} }; }
const P = { addSlide: mockSlide, ShapeType: { rect: 'rect', roundRect: 'roundRect', line: 'line' } };
RR.buildPptxDeck(P, { dept: 'X', year: '2026', week: '29', range: 'r' }, [/* incidencias de prueba */]);
console.log('buildPptxDeck OK, sin excepciones');
"
```

Repite con una lista de incidencias vacía y con incidencias solo en un área, para cubrir los edge cases de la spec (FR-010).

## 5. Revisión visual manual (las tres superficies)

1. **Visor web / editor**: abre `editor.html` (o `preview.html`) con el informe de prueba y confirma que el resumen ejecutivo muestra la incidencia IT y RED destacadas, con título y severidad legibles, y sin desbordar su contenedor.
2. **PPTX**: exporta el PPTX (`exportPPTX()` en el editor, o "Descargar PPTX" en el dashboard) y ábrelo en PowerPoint — confirma que la sección/diapositiva de incidencias destacadas no se solapa con el resto del contenido y que los datos coinciden con el visor web.
3. **PDF**: exporta a PDF desde el dashboard y confirma que muestra exactamente los mismos datos que el PPTX y el visor (FR-009 / SC-002).

## 6. Casos límite a probar explícitamente

- Informe con cero incidencias → todos los contadores en cero, sección de destacadas con mensaje vacío, sin errores en consola en ninguna de las tres superficies (SC-004).
- Informe con incidencias solo en un área → el área vacía muestra su mensaje claro ("Sin incidencias RED esta semana" o equivalente), el área con datos se muestra con normalidad.
- Título de incidencia muy largo → la reseña no desborda el layout fijo del PPTX ni el contenedor del visor/PDF.
