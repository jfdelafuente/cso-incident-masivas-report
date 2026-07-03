# Despliegue Staging - Reportes de Incidencias

## 📋 Instrucciones de despliegue

### Paso 1: Preparar los archivos en tu local

Los archivos ya están listos:
- `reportes-incidencias-app.tar.gz` — aplicación comprimida
- `nginx.conf` — configuración Nginx actualizada
- `deploy.sh` — script automatizado de despliegue

### Paso 2: Copiar archivos al servidor

```bash
# Desde tu máquina local, copia los archivos al servidor
scp reportes-incidencias-app.tar.gz <usuario>@10.132.68.85:/tmp/
scp deploy.sh <usuario>@10.132.68.85:/tmp/
scp nginx.conf <usuario>@10.132.68.85:/tmp/
```

### Paso 3: Conectar por SSH y ejecutar despliegue

```bash
ssh <usuario>@10.132.68.85

# Una vez dentro del servidor, ejecuta:
cd /tmp
bash deploy.sh reportes-incidencias-app.tar.gz
```

### Paso 4: Verificar Nginx (si no se actualiza automáticamente)

Si el script no puede actualizar `nginx.conf` automáticamente:

1. **Respaldar la configuración actual:**
   ```bash
   sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup.$(date +%Y%m%d_%H%M%S)
   ```

2. **Actualizar manualmente:** Añade este bloque dentro del servidor `server { ... }` (después de `/dashboards`):
   ```nginx
   location /reportes-incidencias {
       alias /infocodes/reportes-incidencias-app;
       index index.html index.htm;
       try_files $uri $uri/ /index.html;
   }
   ```

3. **Validar y recargar:**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## 🧪 Checklist de validación

Accede a: **http://infocodes.si.orange.es:8081/reportes-incidencias**

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
- Verifica que el directorio `/infocodes/reportes-incidencias-app/` existe y contiene `index.html`
- Revisa los logs de Nginx: `sudo tail -f /var/log/nginx/error.log`
- Confirma que la configuración de Nginx tiene `try_files $uri $uri/ /index.html;`

### Nginx no recarga correctamente
```bash
sudo nginx -t          # Valida sintaxis
sudo systemctl reload nginx  # Recarga
sudo systemctl status nginx  # Verifica estado
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
