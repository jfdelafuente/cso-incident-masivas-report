# Despliegue Staging - Reportes de Incidencias

Recetario **corto** del flujo real de despliegue con [`deploy.sh`](deploy.sh) y un checklist de validación de la aplicación tal como es hoy (backend FastAPI + frontend, no un editor standalone). Para el detalle manual paso a paso (útil si `deploy.sh` falla en algún punto y hay que depurarlo a mano) ver [`DEPLOYMENT.md`](DEPLOYMENT.md). Para operación del día a día tras el despliegue (backups, restauración, rotación de logs, resolución de problemas) ver [`MANUAL_OPERADOR.md`](MANUAL_OPERADOR.md).

## 📋 Instrucciones de despliegue

El repositorio se despliega en `/infocodes/project/cso-incident-masivas-report` mediante `deploy.sh`, que clona/actualiza el código desde git, instala dependencias del backend, inicializa la BD, hace backup de `reports.db`, aplica `nginx.conf` y (re)inicia el backend. No hace falta empaquetar ni copiar un `.tar.gz`.

### Paso 1: Primer acceso al servidor (solo la primera vez)

```bash
ssh <usuario>@10.132.68.85
# Si el repo aún no existe en el servidor, deploy.sh lo clona automáticamente,
# pero necesita el script en algún sitio para arrancar. La forma más simple
# es clonar el repo directamente:
mkdir -p /infocodes/project
git clone https://github.com/jfdelafuente/cso-incident-masivas-report.git /infocodes/project/cso-incident-masivas-report
```

### Paso 2: Ejecutar el despliegue

```bash
cd /infocodes/project/cso-incident-masivas-report
bash deploy.sh
```

En despliegues posteriores, `deploy.sh` ya hace `git pull` por sí mismo — basta con volver a ejecutar el mismo comando desde el repo existente. La salida del script indica, en orden: el commit previo (por si hay que revertir), el progreso de cada paso, y un resumen final con las URLs, el estado del backend y los comandos exactos para deshacer el despliegue si hiciera falta (código y/o datos) — ver [`MANUAL_OPERADOR.md` → "Deshacer un despliegue"](MANUAL_OPERADOR.md#4-deshacer-un-despliegue).

### Paso 3: Verificar Nginx (si el script no pudo actualizarlo automáticamente)

Nginx corre desde una instalación propia en `/infocodes/nginx` (no la del paquete del sistema en `/etc/nginx`), con su configuración en `/infocodes/nginx/conf/nginx.conf`. Todo (Nginx, backend, despliegue) opera bajo el usuario `infocodes` (uid=2001), sin root ni systemd, así que estos comandos **no llevan `sudo`**.

⚠️ **`nginx.conf` es la configuración completa del servidor, compartida con otras aplicaciones** (`/static`, `/dashboards`, `/data`, y desde hace poco también `/problemas`, el dashboard "Gestión de Problemas"). `deploy.sh` ya avisa de esto y hace backup automático antes de sobrescribir, con rollback si la validación falla — si necesitas repetir el proceso a mano, sigue los pasos detallados en [`DEPLOYMENT.md` → "Configurar Nginx"](DEPLOYMENT.md#6-configurar-nginx).

---

## 🧪 Checklist de validación

**Dashboard** — Accede a: **http://infocodes.si.orange.es:8081/reportes-incidencias** (sirve `index.html`, con el backend ya conectado — no hay modo standalone en producción)
- [ ] Carga la página sin errores y sin el aviso de "no se puede conectar al backend"
- [ ] Se lista al menos un informe, separado en "Semana actual" (destacada arriba) y "Otras semanas" (tabla debajo)
- [ ] El filtro de estado (Borrador/Revisado/Publicado) solo afecta a la tabla de "Otras semanas"

### ✅ Editor (`editor.html?report=<id>`)
- [ ] Carga un informe existente y refleja sus datos (metadatos, incidencias)
- [ ] Combo **Grupo**: ofrece 6 opciones (`IT OSP/JZZ`, `IT MM`, `RED >5.000 clientes`, `Otras RED`, `RED - Relevantes por duración/Climatología/Escalados RRII`, `RED - Impacto B2B`)
- [ ] Combo **Severidad**: las opciones dependen del Grupo seleccionado — `SL1`/`SL2`/`SL3` para grupos IT, `Emergencia`/`Crítica` para grupos RED; cambiar de un área a otra reinicia la severidad a un valor válido
- [ ] Checkboxes **"Reportada al Ministerio"**, **"Impacto en plataforma"**, **"Origen Externo"** y **"Destacar en Incidencias destacadas"**: se reflejan en la vista previa y en el resumen ejecutivo
- [ ] Los cambios se auto-guardan contra el backend (no solo en `localStorage`)

### ✅ Resumen Ejecutivo (vista previa, PPTX y PDF deben coincidir)
- [ ] Slide "La semana en cifras" con 4 KPIs: **Incidencias totales** (con desglose IT/RED), **Reportadas al Ministerio**, **Impacto en plataforma**, **Origen Externo**
- [ ] Gráfico "Por severidad" a ancho completo
- [ ] Slide "Incidencias por día de la semana" (barras IT/RED por día)
- [ ] Slide "Incidencias destacadas": una incidencia IT y una RED, con Causa/Métricas/Solución completas; si alguna incidencia está marcada como "destacada" manualmente, es esa la que aparece en su área, no la de mayor severidad automática

### ✅ Exportación e importación
- [ ] **Guardar JSON**: descarga un archivo con los datos, incidencias ordenadas por Grupo y luego Fecha/Hora
- [ ] **PDF**: abre vista de impresión (Ctrl+P) o descarga desde el dashboard, con el mismo contenido que la vista previa
- [ ] **PowerPoint (.pptx)**: descarga un archivo editable, con el mismo contenido que la vista previa
- [ ] **Descargar plantilla CSV** e **Importar datos (JSON/CSV)**: funcionan y respetan los campos actuales (incluidos Origen Externo y el campo de incidencia destacada)

---

## 🐛 Troubleshooting

Para problemas del **backend** (caídas, healthcheck, backups, proceso huérfano, `nginx.conf` sobrescrito), ver la guía completa en [`MANUAL_OPERADOR.md` → sección 9](MANUAL_OPERADOR.md#9-resolución-de-problemas). Aquí solo los problemas específicos de este checklist de staging:

### La página no carga o da 404
- Verifica que el directorio `/infocodes/project/cso-incident-masivas-report/app/` existe y contiene `index.html`
- Revisa los logs de Nginx: `tail -f /infocodes/nginx/logs/error.log`
- Confirma que la configuración de Nginx tiene `try_files $uri $uri/ /index.html;` en el bloque `/reportes-incidencias`

### Nginx no recarga correctamente
```bash
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t         # Valida sintaxis
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload  # Recarga
ps -ef | grep '[n]ginx: master process'                                    # Verifica estado
```

### Las exportaciones PPTX/PDF no descargan
- Verifica que `PptxGenJS`/`html2pdf` están cargados: abre DevTools (F12) → Console
- Comprueba que no hay errores de JavaScript ni de red (CDN sin acceso a internet)

---

## 📞 Soporte

Si encuentras problemas, verifica:
1. Los logs de Nginx: `/infocodes/var/log/nginx/infocodes.access.log` y `/infocodes/nginx/logs/error.log`
2. Los logs del backend: `tail -f /infocodes/project/cso-incident-masivas-report/backend/backend.log`
3. La consola del navegador (F12 → Console)
4. Que el servidor tiene acceso a internet (CDN de PptxGenJS/html2pdf, Google Fonts)

Para cualquier otra operación (backups, restauración, chequeo de salud, rotación de logs), ver [`MANUAL_OPERADOR.md`](MANUAL_OPERADOR.md).
