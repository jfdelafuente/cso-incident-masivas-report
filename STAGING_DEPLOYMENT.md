# Despliegue Staging - Reportes de Incidencias

## 📋 Instrucciones de despliegue

El repositorio se despliega en `/infocodes/cso-incident-masivas-report` mediante [`deploy.sh`](deploy.sh), que clona/actualiza el código desde git, instala dependencias, inicializa la BD, aplica `nginx.conf` y (re)inicia el backend. No hace falta empaquetar ni copiar un `.tar.gz`.

### Paso 1: Primer acceso al servidor (solo la primera vez)

```bash
ssh <usuario>@10.132.68.85
# Si el repo aún no existe en el servidor, deploy.sh lo clona automáticamente,
# pero necesita el script en algún sitio para arrancar. La forma más simple
# es clonar el repo directamente:
git clone https://github.com/jfdelafuente/cso-incident-masivas-report.git /infocodes/cso-incident-masivas-report
```

### Paso 2: Ejecutar el despliegue

```bash
cd /infocodes/cso-incident-masivas-report
bash deploy.sh
```

En despliegues posteriores, `deploy.sh` ya hace `git pull` por sí mismo — basta con volver a ejecutar el mismo comando desde el repo existente.

### Paso 3: Verificar Nginx (si el script no pudo actualizarlo automáticamente)

Nginx corre desde una instalación propia en `/infocodes/nginx` (no la del paquete del sistema en `/etc/nginx`), con su configuración en `/infocodes/nginx/conf/nginx.conf`. Todo (Nginx, backend, despliegue) opera bajo el usuario `infocodes` (uid=2001), sin root ni systemd, así que estos comandos **no llevan `sudo`**. `deploy.sh` hace backup de la configuración antes de sobrescribirla y restaura ese backup si la validación falla. Si necesitas repetir el proceso a mano:

1. **Respaldar la configuración actual:**
   ```bash
   cp /infocodes/nginx/conf/nginx.conf /infocodes/nginx/conf/nginx.conf.backup.$(date +%Y%m%d_%H%M%S)
   ```

2. **Copiar la configuración del repo** (ya incluye los bloques `/static`, `/dashboards`, `/data` existentes junto con `/reportes-incidencias`):
   ```bash
   cp /infocodes/cso-incident-masivas-report/nginx.conf /infocodes/nginx/conf/nginx.conf
   ```

   El bloque relevante para esta app es:
   ```nginx
   location /reportes-incidencias {
       alias /infocodes/cso-incident-masivas-report/app;
       index index.html index.htm;
       try_files $uri $uri/ /index.html;
   }
   ```

3. **Validar y recargar** (sin systemd, se llama al binario directamente):
   ```bash
   /infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t
   /infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload
   ```

---

## 🧪 Checklist de validación

**Dashboard** — Accede a: **http://infocodes.si.orange.es:8081/reportes-incidencias** (sirve `index.html`)
- [ ] Carga la página sin errores y sin el aviso de "no se puede conectar al backend"
- [ ] Se lista al menos un informe (o aparece el estado vacío si no hay ninguno todavía)

**Editor con datos de ejemplo** (standalone, sin backend, para validar el diseño) — Accede a: **http://infocodes.si.orange.es:8081/reportes-incidencias/editor.html**

### ✅ Funcionalidad básica
- [ ] Carga la página sin errores
- [ ] Panel editor visible a la izquierda
- [ ] Vista en vivo del reporte a la derecha
- [ ] Se muestran las 8 incidencias precargadas

### ✅ Metadatos
- [ ] Año: 2026
- [ ] Semana: 26
- [ ] Rango: 22 – 26 junio 2026
- [ ] Departamento: Customer & Service Operations
- [ ] Contador: 8 incidencias

### ✅ Resumen Ejecutivo
- [ ] Portada visible con logo MASORANGE
- [ ] Slide "La semana en cifras" con:
  - [ ] Total incidencias: 8
  - [ ] Duración acumulada: 34h 21min
  - [ ] Clientes móvil: 54,3K
  - [ ] Clientes FTTH: 69,2K
  - [ ] Barras por severidad (SL1/SL2/SL3)
  - [ ] Reportadas al Ministerio: 1
  - [ ] Con impacto en plataforma: 0

### ✅ Incidencias
- [ ] Cada incidencia tiene su propia slide
- [ ] Badges de severidad visibles (colores)
- [ ] Badges de "Ministerio" y "Plataforma" donde corresponda
- [ ] Logos de marcas afectadas en cada slide

### ✅ Edición en tiempo real
- [ ] Editar campo "Año" → se actualiza portada/resumen
- [ ] Editar "Severidad" en una incidencia → se recalcula gráfica de severidad
- [ ] Editar "Duración" → se recalcula duración acumulada
- [ ] Editar "Clientes FTTH/Móvil" → se recalcula total

### ✅ Exportación
- [ ] **Guardar JSON**: Descarga archivo con datos
- [ ] **PDF**: Abre vista de impresión (Ctrl+P en navegador)
- [ ] **PowerPoint (.pptx)**: Descarga archivo editable

### ✅ Importación
- [ ] **Descargar plantilla CSV**: Descarga CSV con columnas correctas
- [ ] **Importar datos (JSON/CSV)**: Carga archivo CSV/JSON exitosamente
- [ ] Los datos importados reemplazan los actuales correctamente

### ✅ Campos de formulario
- [ ] Combo de **Categoría**: ofrece 4 opciones (Indisponibilidad, Degradación, Pérdida de servicio FTTH, Pérdida de servicio móvil)
- [ ] Checkbox **"Reportada al Ministerio"**: se refleja en slide y resumen
- [ ] Checkbox **"Impacto en plataforma"**: se refleja en slide y resumen
- [ ] Combo **Grupo**: ofrece 4 opciones (IT OSP/JZZ, IT MM, RED >5.000 clientes, Otras RED)
- [ ] Combo **Severidad**: ofrece 3 opciones (SL1, SL2, SL3)

### ✅ Interacciones
- [ ] Botón **"+ Añadir"**: permite crear nueva incidencia
- [ ] Botón **"×"**: elimina incidencia de la lista
- [ ] Click en incidencia: abre/cierra detalles en panel editor
- [ ] Los cambios se guardan automáticamente en el navegador (localStorage)

### ✅ UI/UX
- [ ] Colores y tipografía coinciden con la marca MASORANGE
- [ ] Logos de marcas (Orange, Yoigo, Jazztel, etc.) en pie de portada
- [ ] Responsive en el navegador

---

## 🐛 Troubleshooting

### La página no carga o da 404
- Verifica que el directorio `/infocodes/cso-incident-masivas-report/app/` existe y contiene `index.html`
- Revisa los logs de Nginx: `tail -f /infocodes/nginx/logs/error.log`
- Confirma que la configuración de Nginx tiene `try_files $uri $uri/ /index.html;`

### Nginx no recarga correctamente
```bash
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t         # Valida sintaxis
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload  # Recarga
ps -ef | grep '[n]ginx: master process'                                    # Verifica estado
```

### Los datos se pierden al recargar la página
- Es comportamiento normal si no has configurado persistencia en backend
- Actualmente usa localStorage del navegador
- Para persistencia permanente, se necesería un backend (API)

### Las exportaciones PPTX/PDF no descargan
- Verifica que PptxGenJS está cargado: abre DevTools (F12) → Console
- Comprueba que no hay errores de JavaScript

---

## 📞 Soporte

Si encuentras problemas, verifica:
1. Los logs de Nginx: `/infocodes/var/log/nginx/infocodes.access.log`
2. La consola del navegador (F12 → Console)
3. Que el servidor tiene acceso a internet (CDN de PptxGenJS, Google Fonts)

---

## 🚀 Próximos pasos (después de validar)

1. **Integración con datos reales**: Conectar con tu fuente de incidencias (ServiceNow, Excel, API)
2. **Backend de persistencia**: Guardar datos en base de datos en lugar de localStorage
3. **Autenticación**: Restricción de acceso según roles/usuarios
4. **Scheduler**: Automatizar generación semanal de reportes
