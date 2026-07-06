# 📦 Despliegue a Staging - Automatización de Reportes Semanales

Guía completa para desplegar la aplicación "Automatización de reportes semanales" al servidor staging en **10.132.68.85:8081** (`infocodes.si.orange.es`).

> 💡 El script [`deploy.sh`](deploy.sh) automatiza todos los pasos de esta guía (clonar/actualizar, dependencias, BD, Nginx, backend). Para el flujo recomendado basado en `scp` + `deploy.sh`, ver [`STAGING_DEPLOYMENT.md`](STAGING_DEPLOYMENT.md). Esta guía cubre los mismos pasos de forma manual, útil para depurar un fallo puntual del script.

**Ruta de despliegue en el servidor:** `/infocodes/project/cso-incident-masivas-report`

---

## 🎯 Arquitectura

```
┌─────────────────────────────────────────────────┐
│           Nginx (10.132.68.85:8081)              │
├─────────────────────────────────────────────────┤
│  Frontend (HTML/JS/CSS) ← → Backend (FastAPI)   │
│  /reportes-incidencias        :8000             │
└─────────────────────────────────────────────────┘
         ↓                            ↓
   [app/]                    [backend/main.py]
   - index.html (home)       - SQLAlchemy ORM
   - editor.html             - SQLite DB
   - preview.html            - CORS enabled
   - styles.css
```

---

## 📋 Requisitos previos

**En el servidor:**
- Python 3.8+ (para FastAPI backend)
- Nginx (ya instalado)
- SQLite3 (incluido en Python)
- Git (para clonar el repositorio)

**Verificar:**
```bash
python3 --version
nginx -v
sqlite3 --version
```

---

## 🚀 Pasos de despliegue

### 1. Conectarse al servidor

```bash
ssh usuario@10.132.68.85
mkdir -p /infocodes/project
cd /infocodes/project
```

### 2. Clonar el repositorio

```bash
git clone https://github.com/jfdelafuente/cso-incident-masivas-report.git
cd cso-incident-masivas-report
```

### 3. Preparar el backend

```bash
# Entrar en directorio backend
cd backend

# Crear entorno virtual (opcional pero recomendado)
python3 -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate

# Instalar dependencias
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r requirements.txt
```

### 4. Configurar la base de datos

```bash
# FastAPI crea la BD automáticamente, pero puedes inicializarla:
python3 -c "from main import Base, engine; Base.metadata.create_all(bind=engine)"

# Verificar que se creó:
ls -la reports.db
```

### 5. Iniciar el backend (en background)

Todo corre bajo el usuario `infocodes` (uid=2001), sin acceso root ni a systemd, así que el backend se gestiona con [`service.sh`](backend/service.sh) en vez de una unidad systemd. El script mantiene un PID file, comprueba que el puerto no esté ocupado por otro proceso antes de arrancar, y espera activamente al healthcheck en vez de un `sleep` fijo:

```bash
chmod +x service.sh
./service.sh start     # arranca (no hace nada si ya está corriendo)
./service.sh status    # PID + healthcheck
./service.sh restart   # para (si aplica) y vuelve a arrancar
./service.sh stop      # para de forma ordenada (SIGTERM, luego SIGKILL si no responde)
```

Logs en `backend.log`, PID en `backend.pid` (ambos ignorados por git).

**Verificar que está corriendo:**
```bash
curl --noproxy '*' http://localhost:8000/api/health
# Debe responder: {"status":"ok","service":"Reportes de Incidencias API"}
```

> ⚠️ Si la sesión tiene `http_proxy`/`https_proxy` definidas (habitual en este servidor), `curl` enruta incluso `localhost` a través del proxy corporativo, que responde `403 Forbidden` aunque el backend esté sano. Usa siempre `--noproxy '*'` para comprobaciones locales — `service.sh` ya lo hace internamente.

### 6. Configurar Nginx

El servidor `10.132.68.85:8081` es compartido con otras aplicaciones (`/static`, `/dashboards`, `/data`, etc.), así que **no se sustituye por un bloque genérico**: el repo ya incluye la configuración completa y actualizada en [`nginx.conf`](nginx.conf), con el bloque `/reportes-incidencias` apuntando a `/infocodes/project/cso-incident-masivas-report/app` y `/api` haciendo proxy al backend FastAPI en el puerto 8000.

En este servidor, Nginx corre desde una instalación propia bajo `/infocodes/nginx`, con el binario en `/infocodes/nginx/sbin/nginx` y la configuración en `/infocodes/nginx/conf/nginx.conf`. Como todo el árbol `/infocodes` es propiedad del usuario `infocodes` (uid=2001) con el que se opera — sin root ni systemd —, estas operaciones **no llevan `sudo`**.

**Hacer backup de la configuración actual y aplicar la del repo:**
```bash
cp /infocodes/nginx/conf/nginx.conf /infocodes/nginx/conf/nginx.conf.backup.$(date +%Y%m%d_%H%M%S)
cp /infocodes/project/cso-incident-masivas-report/nginx.conf /infocodes/nginx/conf/nginx.conf
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -t
```

Si la validación falla, restaura el backup antes de continuar:
```bash
cp /infocodes/nginx/conf/nginx.conf.backup.<timestamp> /infocodes/nginx/conf/nginx.conf
```

**Recargar Nginx (sin systemd, se envía la señal directamente al binario):**
```bash
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload

# Verificar que el proceso master está vivo:
ps -ef | grep '[n]ginx: master process'
```

> ⚠️ Si otra persona modificó `/infocodes/nginx/conf/nginx.conf` directamente en el servidor sin reflejarlo en el repo, sobrescribir con `nginx.conf` del repo perdería esos cambios. Revisa el diff (`diff /infocodes/nginx/conf/nginx.conf /infocodes/project/cso-incident-masivas-report/nginx.conf`) antes de copiar si no estás seguro.

### 7. Verificar el despliegue

```bash
# Accede a: http://10.132.68.85:8081/reportes-incidencias
# Debe cargar index.html (la página de inicio con el listado de informes) sin errores

# Verificar API
curl http://10.132.68.85:8081/api/reports
```

---

## 🔧 Supervisión del backend sin systemd

El usuario `infocodes` no tiene acceso root, por lo que no es posible instalar una unidad systemd (`/etc/systemd/system/...`) para el backend. [`service.sh`](backend/service.sh) (sección 5) es el único mecanismo de gestión: PID file propio, arranque/parada ordenados y healthcheck con reintentos.

Si en el futuro se necesita reinicio automático ante caídas (equivalente a `Restart=always` de systemd) sin depender de systemd, la opción habitual es un cron que llame a `service.sh status` cada pocos minutos y ejecute `service.sh start` si ha caído — puede añadirse cuando haga falta, pero no forma parte de este despliegue por ahora.

---

## ✅ Checklist de validación

### Frontend
- [ ] Accede a http://10.132.68.85:8081/reportes-incidencias
- [ ] Carga index.html (listado de informes) correctamente
- [ ] Los estilos se ven bien (colores MASORANGE)
- [ ] Las imágenes/logos cargan

### Backend API
- [ ] `curl http://10.132.68.85:8081/api/reports` retorna lista de reportes
- [ ] `curl http://10.132.68.85:8081/api/health` retorna `{"status":"ok"}`
- [ ] Los logs muestran solicitudes HTTP

### Funcionalidad
- [ ] **Home:** Lista reportes y permite crear nuevos
- [ ] **Editor:** Carga un reporte y permite editar incidencias
- [ ] **Preview:** Muestra slides con estilos MASORANGE
- [ ] **Descargas:** PDF y PPT se descargan correctamente
- [ ] **Auto-save:** Los cambios se guardan automáticamente
- [ ] **Status:** Puede cambiar estado draft/reviewed/published

### Base de datos
- [ ] `ls -la /infocodes/project/cso-incident-masivas-report/backend/reports.db` existe
- [ ] Puedes consultar: `sqlite3 reports.db "SELECT COUNT(*) FROM reports;"`

---

## 🐛 Troubleshooting

### La API no responde (503/504)

```bash
# Verificar que el backend está corriendo
cd /infocodes/project/cso-incident-masivas-report/backend && ./service.sh status

# Verificar logs
tail -f /infocodes/nginx/logs/error.log
tail -f /infocodes/project/cso-incident-masivas-report/backend/backend.log

# Reiniciar
./service.sh restart
```

### CORS errors en navegador

```bash
# Verificar que la API permite CORS
curl -i -X OPTIONS http://10.132.68.85:8081/api/reports \
  -H "Origin: http://10.132.68.85:8081" \
  -H "Access-Control-Request-Method: GET"
```

### Base de datos bloqueada

```bash
# Reiniciar el servicio para liberar la BD
cd /infocodes/project/cso-incident-masivas-report/backend && ./service.sh restart

# O limpiar locks de SQLite:
rm -f /infocodes/project/cso-incident-masivas-report/backend/reports.db-*
```

### Nginx no actualiza cambios del frontend

```bash
# Limpiar caché del navegador (Ctrl+Shift+Delete)
# O acceder con ?nocache=1

# Forzar actualización de Nginx:
/infocodes/nginx/sbin/nginx -c /infocodes/nginx/conf/nginx.conf -s reload
```

---

## 📊 Monitoreo

**Ver logs en tiempo real:**
```bash
# Logs de Nginx
tail -f /infocodes/var/log/nginx/infocodes.access.log | grep reportes

# Logs de la API
tail -f /infocodes/project/cso-incident-masivas-report/backend/backend.log

# Verificar procesos
watch -n 1 "cd /infocodes/project/cso-incident-masivas-report/backend && ./service.sh status"
```

**Estadísticas de base de datos:**
```bash
sqlite3 /infocodes/project/cso-incident-masivas-report/backend/reports.db <<EOF
SELECT 'Reportes' as tabla, COUNT(*) as cantidad FROM reports;
SELECT 'Usuarios' as tabla, COUNT(*) as cantidad FROM reports WHERE createdBy IS NOT NULL;
.tables
.schema
EOF
```

---

## 🔐 Seguridad (Opcional pero recomendado)

### Habilitar HTTPS

```nginx
server {
    listen 8081 ssl;
    ssl_certificate /infocodes/nginx/certs/cert.pem;
    ssl_certificate_key /infocodes/nginx/certs/key.pem;
    
    # ... resto de configuración
}
```

### Limitar acceso a IP específicas

```nginx
location /api {
    allow 10.0.0.0/8;      # Red interna
    deny all;
    
    proxy_pass http://fastapi_backend;
}
```

### Configurar rate limiting

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

location /api {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://fastapi_backend;
}
```

---

## 📝 Actualizaciones futuras

Para actualizar el código:

```bash
cd /infocodes/project/cso-incident-masivas-report
git pull origin main

# Si hay cambios en requirements.txt:
source backend/venv/bin/activate
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -r backend/requirements.txt

# Reiniciar API
cd backend && ./service.sh restart
```

> Basta con volver a ejecutar `bash deploy.sh` desde el repo — hace `git pull`, reinstala dependencias, actualiza Nginx y reinicia el backend vía `service.sh` automáticamente.

---

## 📞 Soporte

**Logs útiles:**
- Nginx (error): `/infocodes/nginx/logs/error.log`
- Nginx (acceso): `/infocodes/var/log/nginx/infocodes.access.log`
- API: `backend/backend.log`
- Consola navegador: F12 → Console

**Comandos de utilidad:**
```bash
# Verificar puertos en uso
lsof -i :8081 -i :8000

# Detener el backend de forma ordenada (preferido sobre matar por puerto)
cd /infocodes/project/cso-incident-masivas-report/backend && ./service.sh stop

# Matar proceso por puerto (último recurso, si service.sh no puede pararlo)
fuser -k 8000/tcp

# Listar procesos Python
ps aux | grep python

# Ver espacio en disco
df -h /infocodes
```

---

**Última actualización:** 2026-07-03  
**Versión:** 1.0
