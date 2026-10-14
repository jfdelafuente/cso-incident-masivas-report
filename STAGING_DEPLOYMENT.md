# 🚀 Despliegue Rápido — Reportes de Incidencias

Recetario resumido para el despliegue del proyecto en el servidor compartido `AOTLXPRBOA00001` (`10.132.68.85:8081` / `10.132.26.96`).

Para la guía detallada de arquitectura ver [`DEPLOYMENT.md`](DEPLOYMENT.md).  
Para tareas de operación diaria, copias de seguridad y troubleshooting ver [`MANUAL_OPERADOR.md`](MANUAL_OPERADOR.md).

---

## ⚡ Método 1: Despliegue en 1 Clic desde Windows (Recomendado)

Desde la consola PowerShell de tu equipo local:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1
```

Este script:
1. Comprueba el estado de Git local y remoto.
2. Sincroniza los ficheros necesarios al servidor (`app/`, `backend/`, `nginx/`).
3. Asegura la estructura persistente en `/infocodes/var/`.
4. Realiza backup automático de la base de datos `reports.db`.
5. Despliega la configuración modular de Nginx en `conf.d/cso-incident.conf` (sin tocar otras aplicaciones como `/problemas` o `/dashboards`).
6. Reinicia el backend FastAPI (`service.sh restart`).
7. Valida las sondas de observabilidad `/healthz` y `/readyz`.

---

## 🐧 Método 2: Despliegue Directo en Servidor Linux (SSH)

Conectado a la máquina vía SSH:

```bash
cd /infocodes/project/cso-incident-masivas-report
bash deploy.sh
```

El script `deploy.sh` es totalmente idempotente y seguro:
- Hace `git pull` de la rama `main`.
- Actualiza dependencias de Python dentro del virtualenv.
- Aplica el bloque modular `nginx/conf.d/cso-incident.conf` y valida con `nginx -t` antes de recargar.
- Reinicia el backend FastAPI y comprueba el healthcheck.

---

## 🧪 Checklist de Validación Rápida

### 1. Dashboard Web
- [ ] Accede a: **http://infocodes.si.orange.es:8081/reportes-incidencias**
- [ ] La página carga `index.html` con la lista de informes de incidencias.
- [ ] Los filtros de estado y semanas funcionan sin errores de JavaScript en consola.

### 2. Editor y Exportaciones
- [ ] Abre un informe en el editor (`editor.html?report=YYYY-Wxx`).
- [ ] El guardado automático persiste cambios en el backend.
- [ ] La descarga en PowerPoint (`.pptx`) y PDF se genera correctamente.

### 3. Sondas de API y Backend
- [ ] Sonda de readiness: `curl --noproxy '*' http://localhost:8000/readyz` (debe responder `{"status":"ready",...}`).
- [ ] Endpoint de descarga directa: `curl -I http://localhost:8081/api/reports/2026-W41/legacy-pptx` (debe responder HTTP 200).

---

## 🛟 Rollback de Emergencia

Si se requiere revertir el despliegue a una versión previa:

```powershell
# Desde Windows:
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1 -Rollback

# O desde Linux:
cd /infocodes/project/cso-incident-masivas-report/backend && ./maintenance.sh restore
```
