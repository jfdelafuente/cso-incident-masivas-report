# 📦 Despliegue a Staging - Automatización de Reportes Semanales

Guía completa para desplegar la aplicación "Automatización de reportes semanales" al servidor staging en **10.132.68.85:8081**.

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
   - index.html              - SQLAlchemy ORM
   - home.html               - SQLite DB
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
cd /opt  # o la ruta que prefieras
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
pip install -r requirements.txt
```

### 4. Configurar la base de datos

```bash
# FastAPI crea la BD automáticamente, pero puedes inicializarla:
python3 -c "from main import Base, engine; Base.metadata.create_all(bind=engine)"

# Verificar que se creó:
ls -la reports.db
```

### 5. Iniciar el backend (en background)

```bash
# Opción A: Con nohup (simple)
nohup python3 main.py &

# Opción B: Con systemd (recomendado para producción)
# Ver sección "Configurar como servicio systemd" abajo
```

**Verificar que está corriendo:**
```bash
curl http://localhost:8000/health
# Debe responder: {"status":"ok"}
```

### 6. Configurar Nginx

**Actualizar `/etc/nginx/nginx.conf`:**

```nginx
http {
    # ... configuración existente ...

    upstream fastapi_backend {
        server localhost:8000;
    }

    server {
        listen 8081;
        server_name 10.132.68.85;

        # Frontend - Reportes de incidencias
        location /reportes-incidencias {
            alias /opt/cso-incident-masivas-report/app;
            index index.html;
            try_files $uri $uri/ /index.html;

            # Cache busting para archivos estáticos
            location ~* \.(js|css|png|jpg|gif|svg)$ {
                expires 1h;
                add_header Cache-Control "public, immutable";
            }
        }

        # Backend API
        location /api {
            proxy_pass http://fastapi_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Timeouts para uploads
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Redirigir root a reportes-incidencias
        location / {
            return 301 /reportes-incidencias/;
        }
    }
}
```

**Validar y recargar Nginx:**
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
```

### 7. Verificar el despliegue

```bash
# Accede a: http://10.132.68.85:8081/reportes-incidencias
# Debe cargar home.html sin errores

# Verificar API
curl http://10.132.68.85:8081/api/reports
```

---

## 🔧 Configurar como servicio systemd (Producción)

Crear archivo `/etc/systemd/system/reportes-api.service`:

```ini
[Unit]
Description=Reportes Incidencias API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/cso-incident-masivas-report/backend
Environment="PATH=/opt/cso-incident-masivas-report/backend/venv/bin"
ExecStart=/opt/cso-incident-masivas-report/backend/venv/bin/python3 main.py

# Reiniciar automáticamente si falla
Restart=always
RestartSec=10

# Logs
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Activar servicio:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable reportes-api.service
sudo systemctl start reportes-api.service
sudo systemctl status reportes-api.service

# Ver logs en tiempo real:
sudo journalctl -u reportes-api.service -f
```

---

## ✅ Checklist de validación

### Frontend
- [ ] Accede a http://10.132.68.85:8081/reportes-incidencias
- [ ] Carga home.html correctamente
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
- [ ] `ls -la /opt/cso-incident-masivas-report/backend/reports.db` existe
- [ ] Puedes consultar: `sqlite3 reports.db "SELECT COUNT(*) FROM report;"`

---

## 🐛 Troubleshooting

### La API no responde (503/504)

```bash
# Verificar que el backend está corriendo
ps aux | grep main.py

# Verificar logs
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u reportes-api.service -f

# Reiniciar el servicio
sudo systemctl restart reportes-api.service
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
sudo systemctl restart reportes-api.service

# O limpiar locks de SQLite:
rm -f /opt/cso-incident-masivas-report/backend/reports.db-*
```

### Nginx no actualiza cambios del frontend

```bash
# Limpiar caché del navegador (Ctrl+Shift+Delete)
# O acceder con ?nocache=1

# Forzar actualización de Nginx:
sudo systemctl reload nginx
```

---

## 📊 Monitoreo

**Ver logs en tiempo real:**
```bash
# Logs de Nginx
sudo tail -f /var/log/nginx/access.log | grep reportes

# Logs de la API
sudo journalctl -u reportes-api.service -f

# Verificar procesos
watch -n 1 "ps aux | grep -E 'python|nginx' | grep -v grep"
```

**Estadísticas de base de datos:**
```bash
sqlite3 /opt/cso-incident-masivas-report/backend/reports.db <<EOF
SELECT 'Reportes' as tabla, COUNT(*) as cantidad FROM report;
SELECT 'Usuarios' as tabla, COUNT(*) as cantidad FROM report WHERE createdBy IS NOT NULL;
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
    ssl_certificate /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;
    
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
cd /opt/cso-incident-masivas-report
git pull origin main

# Si hay cambios en requirements.txt:
source backend/venv/bin/activate
pip install -r backend/requirements.txt

# Reiniciar API
sudo systemctl restart reportes-api.service
```

---

## 📞 Soporte

**Logs útiles:**
- Nginx: `/var/log/nginx/error.log`
- API: `sudo journalctl -u reportes-api.service`
- Consola navegador: F12 → Console

**Comandos de utilidad:**
```bash
# Verificar puertos en uso
lsof -i :8081 -i :8000

# Matar proceso por puerto
fuser -k 8000/tcp

# Listar procesos Python
ps aux | grep python

# Ver espacio en disco
df -h /opt
```

---

**Última actualización:** 2026-07-03  
**Versión:** 1.0
