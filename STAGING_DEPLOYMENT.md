# 🚀 Despliegue Rápido — Reportes de Incidencias

Recetario resumido para el despliegue del proyecto en el servidor compartido `AOTLXPRBOA00001` (`10.132.68.85:8081` / `10.132.26.96`).

Para la guía detallada de arquitectura ver [`DEPLOYMENT.md`](DEPLOYMENT.md).  
Para tareas de operación diaria, copias de seguridad y troubleshooting ver [`MANUAL_OPERADOR.md`](MANUAL_OPERADOR.md).

---

## ⚡ Método 1: Despliegue Automatizado 1-Clic desde Windows (Recomendado)

Desde la consola PowerShell de tu equipo local:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1
```

Este script ejecuta de principio a fin:
1. **Empaquetado Standalone**: Compila `dist/cso-incident-backend.tar.gz` (~1.5 MB) omitiendo `.git`, tests y dependencias de desarrollo.
2. **Transferencia**: Sube el tarball vía SCP a `/tmp/` en el servidor `10.132.26.96`.
3. **Backup Preventivo**: Genera copia de seguridad de `reports.db` en `/infocodes/var/backups/`.
4. **Nueva Release Aislada**: Desempaqueta en `releases/<TIMESTAMP>/` y enlaza el virtualenv persistente `shared/venv`.
5. **Nginx Modular**: Sincroniza `conf.d/cso-incident.conf` y recarga Nginx sin alterar otras aplicaciones.
6. **Switch Atómico de Versión**: Conmuta instantáneamente el symlink `current -> releases/<TIMESTAMP>`.
7. **Reinicio Backend**: Reinicia FastAPI y valida las sondas de salud (`/api/health`, `/readyz`).

---

## 🐧 Método 2: Control y Verificación en el Servidor Linux (SSH)

Conectado a la máquina vía SSH (`ssh infocodes@10.132.26.96`):

```bash
cd /infocodes/project/cso-incident-masivas-report

# Ver release activa y estado de salud:
./status.sh

# Revertir a la versión anterior en 1 segundo:
./rollback.sh

# Reiniciar backend manualmente:
./current/backend/service.sh restart
```

---

## 🧪 Checklist de Validación Rápida

### 1. Dashboard Web
- [ ] Accede a: **http://10.132.68.85:8081/dashboards/reportes-incidencias/**
- [ ] La página carga con la lista de informes de incidencias.
- [ ] Los filtros de estado y semanas funcionan sin errores de JavaScript en consola.

### 2. Editor y Exportaciones
- [ ] Abre un informe en el editor (`editor.html?report=YYYY-Wxx`).
- [ ] El guardado automático persiste cambios en el backend.
- [ ] La descarga en PowerPoint (`.pptx`) y PDF se genera correctamente.

### 3. Sondas de API y Backend
- [ ] Sonda de readiness: `curl --noproxy '*' http://localhost:8000/readyz` (debe responder `{"status":"ready",...}`).
- [ ] Endpoint de descarga directa: `curl -I http://localhost:8081/api/reports/2026-W41/legacy-pptx` (debe responder HTTP 200).

---

## 🛟 Rollback Instantáneo de Emergencia

Si se requiere revertir el despliegue a una versión previa:

```powershell
# Desde Windows (1 clic):
powershell -ExecutionPolicy Bypass -File scripts\deploy-production.ps1 -Rollback

# O directamente desde el servidor:
cd /infocodes/project/cso-incident-masivas-report && ./rollback.sh
```

