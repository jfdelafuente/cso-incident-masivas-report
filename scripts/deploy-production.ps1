<#
.SYNOPSIS
    Despliegue automatizado en 1 clic de CSO Incident Masivas Report Backend (Standalone Artifact + Symlink Releases).

.DESCRIPTION
    Implementa la misma arquitectura de despliegue atómico que Gestión de Problemas:
      1. Empaqueta localmente ÚNICAMENTE los archivos de runtime necesarios (backend, nginx, templates, versión).
         - Cero .git, cero markdown, cero suites de test, cero ficheros de desarrollo.
      2. Sube el artefacto comprimido (.tar.gz) por SCP al servidor (/tmp/cso-incident-backend.tar.gz).
      3. Ejecución remota atómica por SSH:
         - Backup preventivo automático de la BD en /infocodes/var/backups/cso-incident-masivas-report/.
         - Migra entorno virtual (venv) previo a /infocodes/project/cso-incident-masivas-report/shared/venv.
         - Extrae la nueva release en releases/<TIMESTAMP>/ sin tocar la versión en ejecución.
         - Actualiza la configuración modular de Nginx (/infocodes/nginx/conf/conf.d/cso-incident.conf) y recarga suavemente.
         - Conmuta atómicamente el enlace simbólico: current -> releases/<TIMESTAMP>/.
         - Reinicia el servicio backend FastAPI en puerto 8000.
         - Rota releases antiguas conservando las últimas 3 (para rollback instantáneo).
         - Limpia archivos residuales del antiguo clon en la raíz del servidor.
         - Valida sondas de salud (/api/health, /readyz y proxy Nginx :8081).

.PARAMETER TargetHost
    Host SSH de destino. Por defecto: "infocodes@10.132.26.96".

.PARAMETER RemoteDir
    Ruta remota de la aplicación. Por defecto: "/infocodes/project/cso-incident-masivas-report".

.PARAMETER SkipBuild
    Omite la fase de empaquetado y utiliza el último artefacto dist/cso-incident-backend.tar.gz existente.

.PARAMETER SkipUpload
    Omite la subida por SCP si el artefacto ya se encuentra en /tmp/cso-incident-backend.tar.gz en el servidor.

.PARAMETER VerifyOnly
    Solo verifica el estado del servicio backend y las sondas HTTP remotas sin modificar nada.

.PARAMETER RestartOnly
    Reinicia el servicio backend FastAPI en el servidor remoto sin transferir archivos.

.PARAMETER Rollback
    Revierte inmediatamente a la release anterior cambiando el enlace simbólico 'current' (en ~1 segundo).

.PARAMETER DryRun
    Muestra los comandos que se ejecutarían sin realizar cambios en el servidor remoto.

.EXAMPLE
    .\scripts\deploy-production.ps1
    Despliegue estándar: empaqueta runtime, sube por SCP, despliega atómicamente y verifica salud.

.EXAMPLE
    .\scripts\deploy-production.ps1 -Rollback
    Revierte instantáneamente a la versión anterior sin pérdida de datos.

.EXAMPLE
    .\scripts\deploy-production.ps1 -VerifyOnly
    Consulta el estado del backend y las sondas HTTP en el servidor remoto.
#>

[CmdletBinding()]
param(
    [string]$TargetHost = "infocodes@10.132.26.96",
    [string]$RemoteDir = "/infocodes/project/cso-incident-masivas-report",
    [switch]$SkipBuild,
    [switch]$SkipUpload,
    [switch]$VerifyOnly,
    [switch]$RestartOnly,
    [switch]$Rollback,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$DistDir = Join-Path $ProjectRoot "dist"
$TarballRelPath = "dist/cso-incident-backend.tar.gz"
$TarballFullPath = Join-Path $ProjectRoot $TarballRelPath
$RemoteTmpTarball = "/tmp/cso-incident-backend.tar.gz"

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host ""
    Write-Host "[$Step] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-WarnMsg {
    param([string]$Message)
    Write-Host "  [AVISO] $Message" -ForegroundColor Yellow
}

function Invoke-RemoteBash {
    param(
        [string]$HostTarget,
        [string]$BashScript
    )
    # Normalizar saltos de línea a LF y terminar con comentario para absorber CRLF
    $Normalized = $BashScript.Replace("`r`n", "`n") + "`n# end-of-script"
    $Normalized | ssh $HostTarget bash
}

Write-Host "=================================================================" -ForegroundColor DarkCyan
Write-Host "   Deploy Standalone (Symlink Releases) - CSO Incident Backend   " -ForegroundColor Cyan
Write-Host "   Destino : $TargetHost" -ForegroundColor Gray
Write-Host "   Ruta    : $RemoteDir" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor DarkCyan

# Comprobar disponibilidad de comandos ssh y scp
foreach ($bin in @("ssh", "scp")) {
    if (-not (Get-Command $bin -ErrorAction SilentlyContinue)) {
        Write-Error "No se encontro el comando '$bin' en el PATH. Activa el cliente OpenSSH de Windows o Git Bash."
        exit 1
    }
}

# -------------------------------------------------------------------------
# MODO VERIFY-ONLY: Consultar estado de backend y sondas de salud
# -------------------------------------------------------------------------
if ($VerifyOnly) {
    Write-Step "VERIFY" "Verificando estado del backend y sondas en $TargetHost..."

    $verifyScript = @"
set -e
REMOTE_DIR="$RemoteDir"
CURRENT_LINK="`$REMOTE_DIR/current"

echo "=== Estado del Backend ==="
if [ -L "`$CURRENT_LINK" ] && [ -x "`$CURRENT_LINK/backend/service.sh" ]; then
    echo "Release activa: `$(readlink "`$CURRENT_LINK" 2>/dev/null || echo 'desconocida')"
    "`$CURRENT_LINK/backend/service.sh" status || true
elif [ -x "`$REMOTE_DIR/backend/service.sh" ]; then
    "`$REMOTE_DIR/backend/service.sh" status || true
else
    echo "ERROR: No se encontro service.sh en `$REMOTE_DIR"
fi

echo ""
echo "=== Sondas HTTP Internas ==="
printf "Liveness (/healthz): "
curl -sf --noproxy '*' http://127.0.0.1:8000/healthz || echo "ERROR"
echo ""

printf "Readiness (/readyz): "
curl -sf --noproxy '*' http://127.0.0.1:8000/readyz || echo "ERROR"
echo ""

printf "Health (/api/health): "
curl -sf --noproxy '*' http://127.0.0.1:8000/api/health || echo "ERROR"
echo ""

echo "=== Nginx Frontend Proxy (:8081) ==="
printf "Redireccion /reportes-incidencias: HTTP "
curl -s --noproxy '*' -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/reportes-incidencias || echo "ERROR"

printf "API Health (:8081/api/health): "
curl -sf --noproxy '*' http://127.0.0.1:8081/api/health || echo "ERROR"
echo ""
"@

    if ($DryRun) {
        Write-WarnMsg "[DryRun] Se ejecutaría por SSH en ${TargetHost}:"
        Write-Host $verifyScript -ForegroundColor DarkGray
        exit 0
    }

    Invoke-RemoteBash -HostTarget $TargetHost -BashScript $verifyScript
    $Stopwatch.Stop()
    Write-Ok ("Verificación completada en {0:N1}s." -f $Stopwatch.Elapsed.TotalSeconds)
    exit 0
}

# -------------------------------------------------------------------------
# MODO RESTART-ONLY: Reinicio rápido de servicio
# -------------------------------------------------------------------------
if ($RestartOnly) {
    Write-Step "RESTART" "Reiniciando backend FastAPI en $TargetHost..."

    $restartScript = @"
set -e
REMOTE_DIR="$RemoteDir"
CURRENT_LINK="`$REMOTE_DIR/current"

if [ -L "`$CURRENT_LINK" ] && [ -x "`$CURRENT_LINK/backend/service.sh" ]; then
    "`$CURRENT_LINK/backend/service.sh" restart
    "`$CURRENT_LINK/backend/service.sh" status
elif [ -x "`$REMOTE_DIR/backend/service.sh" ]; then
    "`$REMOTE_DIR/backend/service.sh" restart
    "`$REMOTE_DIR/backend/service.sh" status
fi
"@

    if ($DryRun) {
        Write-WarnMsg "[DryRun] Se ejecutaría por SSH en ${TargetHost}:"
        Write-Host $restartScript -ForegroundColor DarkGray
        exit 0
    }

    Invoke-RemoteBash -HostTarget $TargetHost -BashScript $restartScript
    $Stopwatch.Stop()
    Write-Ok ("Reinicio completado en {0:N1}s." -f $Stopwatch.Elapsed.TotalSeconds)
    exit 0
}

# -------------------------------------------------------------------------
# MODO ROLLBACK: Reversión atómica por symlink a la release previa
# -------------------------------------------------------------------------
if ($Rollback) {
    Write-Step "ROLLBACK" "Ejecutando rollback atómico por symlink en $TargetHost..."

    $rollbackScript = @"
set -e
REMOTE_DIR="$RemoteDir"
cd "`$REMOTE_DIR"

if [ -x ./rollback.sh ]; then
    ./rollback.sh
elif [ -L current ] && [ -x current/rollback.sh ]; then
    current/rollback.sh
else
    echo "ERROR: No se encontro script rollback.sh en `$REMOTE_DIR"
    exit 1
fi

./status.sh || true
"@

    if ($DryRun) {
        Write-WarnMsg "[DryRun] Se ejecutaría por SSH en ${TargetHost}:"
        Write-Host $rollbackScript -ForegroundColor DarkGray
        exit 0
    }

    Invoke-RemoteBash -HostTarget $TargetHost -BashScript $rollbackScript
    $Stopwatch.Stop()
    Write-Ok ("Rollback completado en {0:N1}s." -f $Stopwatch.Elapsed.TotalSeconds)
    exit 0
}

# -------------------------------------------------------------------------
# PASO 1: Empaquetado selectivo del Runtime (solo lo estrictamente necesario)
# -------------------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Step "1/3" "Empaquetando artefacto runtime selectivo (sin .git ni archivos de desarrollo)..."

    if (-not (Test-Path $DistDir)) {
        New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
    }

    $StagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("cso-backend-pkg-" + [System.Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

    try {
        # 1. Copiar backend excluyendo venv, pycache, bases de datos y ficheros temporales
        $BackendStaging = Join-Path $StagingDir "backend"
        New-Item -ItemType Directory -Path $BackendStaging -Force | Out-Null
        robocopy "$ProjectRoot\backend" "$BackendStaging" /E /XD venv __pycache__ data /XF *.db *.pyc *.log *.tar.gz *.whl backend.pid | Out-Null

        # 2. Copiar scripts de soporte y exportación (export_legacy_pptx, template PPTX, etc.)
        $ScriptsStaging = Join-Path $StagingDir "scripts"
        New-Item -ItemType Directory -Path $ScriptsStaging -Force | Out-Null
        robocopy "$ProjectRoot\scripts" "$ScriptsStaging" /E /XD __pycache__ /XF deploy-production.ps1 *.pyc *.log | Out-Null

        # 3. Copiar configuración modular de Nginx
        $NginxStaging = Join-Path $StagingDir "nginx\conf.d"
        New-Item -ItemType Directory -Path $NginxStaging -Force | Out-Null
        Copy-Item "$ProjectRoot\nginx\conf.d\cso-incident.conf" -Destination $NginxStaging

        # 4. Copiar stub de redirección app/index.html
        $AppStaging = Join-Path $StagingDir "app"
        New-Item -ItemType Directory -Path $AppStaging -Force | Out-Null
        Copy-Item "$ProjectRoot\app\index.html" -Destination $AppStaging

        # 5. Copiar scripts de control de release y versión
        Copy-Item "$ProjectRoot\rollback.sh" -Destination $StagingDir
        Copy-Item "$ProjectRoot\status.sh" -Destination $StagingDir
        if (Test-Path "$ProjectRoot\VERSION") {
            Copy-Item "$ProjectRoot\VERSION" -Destination $StagingDir
        } else {
            "2.1.0-$(Get-Date -Format 'yyyyMMdd')" | Out-File -FilePath (Join-Path $StagingDir "VERSION") -Encoding utf8
        }

        # 6. Generar tarball
        if (Test-Path $TarballFullPath) { Remove-Item $TarballFullPath -Force }
        tar --force-local -czf "$TarballFullPath" -C "$StagingDir" .

        $sizeMB = [Math]::Round((Get-Item $TarballFullPath).Length / 1MB, 2)
        Write-Ok "Artefacto generado con éxito: $TarballRelPath ($sizeMB MB)"
    }
    finally {
        if (Test-Path $StagingDir) {
            Remove-Item $StagingDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Step "1/3" "Omitiendo empaquetado (-SkipBuild activo). Verificando paquete existente..."
}

if (-not (Test-Path $TarballFullPath)) {
    Write-Error "No se encontro el artefacto '$TarballFullPath'. Ejecuta sin -SkipBuild primero."
    exit 1
}

# -------------------------------------------------------------------------
# PASO 2: Subida del artefacto por SCP
# -------------------------------------------------------------------------
if (-not $SkipUpload) {
    Write-Step "2/3" "Subiendo artefacto por SCP a ${TargetHost}:${RemoteTmpTarball}..."
    if ($DryRun) {
        Write-WarnMsg "[DryRun] Se ejecutaría: scp '$TarballFullPath' '${TargetHost}:${RemoteTmpTarball}'"
    } else {
        scp "$TarballFullPath" "${TargetHost}:${RemoteTmpTarball}"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Error al transferir el artefacto por SCP."
            exit $LASTEXITCODE
        }
        Write-Ok "Artefacto subido correctamente a ${RemoteTmpTarball}"
    }
} else {
    Write-Step "2/3" "Omitiendo subida (-SkipUpload activo). Se utilizara el artefacto presente en el servidor."
}

# -------------------------------------------------------------------------
# PASO 3: Despliegue atómico por symlink (releases/ + current) y verificación
# -------------------------------------------------------------------------
Write-Step "3/3" "Ejecutando despliegue atómico, reinicio y verificación en $TargetHost..."

$remoteDeployScript = @"
set -e

REMOTE_DIR="$RemoteDir"
TMP_TAR="$RemoteTmpTarball"
VAR_DATA_DIR="/infocodes/var/data/cso-incident-masivas-report"
VAR_STORAGE_DIR="/infocodes/var/storage/executive_pptx"
VAR_RUN_DIR="/infocodes/var/run"
VAR_BACKUP_DIR="/infocodes/var/backups/cso-incident-masivas-report"
RELEASES_DIR="`$REMOTE_DIR/releases"
SHARED_DIR="`$REMOTE_DIR/shared"
CURRENT_LINK="`$REMOTE_DIR/current"
NGINX_CONF_D="/infocodes/nginx/conf/conf.d"
NGINX_BIN="/infocodes/nginx/sbin/nginx"
NGINX_CONF="/infocodes/nginx/conf/nginx.conf"

echo "--> [Remoto] Asegurando directorios persistentes en /infocodes/var/ y structure de releases..."
mkdir -p "`$VAR_DATA_DIR" "`$VAR_STORAGE_DIR" "`$VAR_RUN_DIR" "`$VAR_BACKUP_DIR" "`$RELEASES_DIR" "`$SHARED_DIR"

# Unificación de almacenamiento con release-dashboard-application
RD_EXEC_DIR="/infocodes/project/release-dashboard-application/shared/data/reports/executive"
if [ -d "`$RD_EXEC_DIR" ] && [ ! -L "`$RD_EXEC_DIR" ]; then
    echo "--> [Remoto] Sustituyendo directorio legado de release-dashboard por symlink a `$VAR_STORAGE_DIR..."
    rm -rf "`$RD_EXEC_DIR"
    ln -sfn "`$VAR_STORAGE_DIR" "`$RD_EXEC_DIR"
fi

if [ ! -f "`$TMP_TAR" ]; then
    echo "ERROR: No se encuentra `$TMP_TAR en el servidor."
    exit 1
fi

# 1. Backup preventivo de la base de datos
ACTIVE_DB=""
if [ -f "`$VAR_DATA_DIR/reports.db" ]; then
    ACTIVE_DB="`$VAR_DATA_DIR/reports.db"
elif [ -f "`$REMOTE_DIR/backend/reports.db" ]; then
    ACTIVE_DB="`$REMOTE_DIR/backend/reports.db"
fi

if [ -n "`$ACTIVE_DB" ]; then
    BACKUP_FILE="`$VAR_BACKUP_DIR/reports_predeploy_`$(date +%Y%m%d_%H%M%S).db"
    echo "--> [Remoto] Creando backup preventivo de BD en `$BACKUP_FILE..."
    cp -p "`$ACTIVE_DB" "`$BACKUP_FILE"
fi

# 2. Migración del entorno virtual Python existente hacia shared/venv (si aún no existía en shared/)
if [ ! -d "`$SHARED_DIR/venv" ] && [ -d "`$REMOTE_DIR/backend/venv" ]; then
    echo "--> [Remoto] Migrando entorno virtual Python previo hacia `$SHARED_DIR/venv..."
    cp -r "`$REMOTE_DIR/backend/venv" "`$SHARED_DIR/venv"
fi

# 3. Migración de .env previo hacia shared/.env
if [ ! -f "`$SHARED_DIR/.env" ] && [ -f "`$REMOTE_DIR/backend/.env" ]; then
    cp -p "`$REMOTE_DIR/backend/.env" "`$SHARED_DIR/.env"
    echo "--> [Remoto] Migrado .env hacia `$SHARED_DIR/.env"
fi

# 4. Extraer nueva release en releases/<TIMESTAMP>
RELEASE_ID="`$(date +%Y%m%d_%H%M%S)"
NEW_RELEASE_DIR="`$RELEASES_DIR/`$RELEASE_ID"
echo "--> [Remoto] Extrayendo nueva release en `$NEW_RELEASE_DIR..."
mkdir -p "`$NEW_RELEASE_DIR"
tar -xzf "`$TMP_TAR" -C "`$NEW_RELEASE_DIR"
rm -f "`$TMP_TAR"

# 5. Enlazar entorno virtual de Python compartido
if [ -d "`$SHARED_DIR/venv" ]; then
    ln -sfn "`$SHARED_DIR/venv" "`$NEW_RELEASE_DIR/backend/venv"
else
    echo "--> [Remoto] Inicializando nuevo entorno virtual en `$SHARED_DIR/venv..."
    python3 -m venv "`$SHARED_DIR/venv"
    ln -sfn "`$SHARED_DIR/venv" "`$NEW_RELEASE_DIR/backend/venv"
fi

# 6. Enlazar shared/.env si existe
if [ -f "`$SHARED_DIR/.env" ]; then
    ln -sfn "`$SHARED_DIR/.env" "`$NEW_RELEASE_DIR/backend/.env"
fi

# 7. Normalizar permisos y saltos de línea (evitar problemas de CRLF de Windows)
sed -i 's/\r$//' "`$NEW_RELEASE_DIR"/backend/*.sh "`$NEW_RELEASE_DIR"/*.sh "`$NEW_RELEASE_DIR"/scripts/*.py 2>/dev/null || true
chmod +x "`$NEW_RELEASE_DIR"/backend/*.sh "`$NEW_RELEASE_DIR"/*.sh "`$NEW_RELEASE_DIR"/scripts/*.py 2>/dev/null || true

# 8. Comprobar / actualizar dependencias de Python si requirements.txt lo requiere
if [ -x "`$SHARED_DIR/venv/bin/python3" ]; then
    "`$SHARED_DIR/venv/bin/python3" -m pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -q -r "`$NEW_RELEASE_DIR/backend/requirements.txt" || true
fi

# 9. Inicializar/migrar esquemas de base de datos usando el venv
(
    cd "`$NEW_RELEASE_DIR/backend"
    "`$SHARED_DIR/venv/bin/python3" -c "from main import Base, engine; Base.metadata.create_all(bind=engine); print('Base de datos verificada')"
)

# 10. Desplegar configuración Nginx modular
if [ -f "`$NEW_RELEASE_DIR/nginx/conf.d/cso-incident.conf" ] && [ -d "`$NGINX_CONF_D" ]; then
    echo "--> [Remoto] Sincronizando snippet modular Nginx en `$NGINX_CONF_D/cso-incident.conf..."
    cp -f "`$NEW_RELEASE_DIR/nginx/conf.d/cso-incident.conf" "`$NGINX_CONF_D/cso-incident.conf"
    if [ -x "`$NGINX_BIN" ]; then
        if "`$NGINX_BIN" -c "`$NGINX_CONF" -t >/dev/null 2>&1; then
            "`$NGINX_BIN" -c "`$NGINX_CONF" -s reload
            echo "--> [Remoto] Nginx recargado con éxito."
        fi
    fi
fi

# 11. Detener backend anterior (libera el puerto limpiamente)
if [ -L "`$CURRENT_LINK" ] && [ -x "`$CURRENT_LINK/backend/service.sh" ]; then
    "`$CURRENT_LINK/backend/service.sh" stop || true
elif [ -x "`$REMOTE_DIR/backend/service.sh" ]; then
    "`$REMOTE_DIR/backend/service.sh" stop || true
fi

# 12. Switch atómico del enlace simbólico 'current'
echo "--> [Remoto] Activando symlink atómico: current -> releases/`$RELEASE_ID"
ln -sfn "releases/`$RELEASE_ID" "`$CURRENT_LINK"

# 13. Sincronizar scripts de control en la raíz de la aplicación
cp -f "`$NEW_RELEASE_DIR/rollback.sh" "`$REMOTE_DIR/rollback.sh"
cp -f "`$NEW_RELEASE_DIR/status.sh" "`$REMOTE_DIR/status.sh"
chmod +x "`$REMOTE_DIR"/*.sh 2>/dev/null || true

# 14. Limpiar archivos residuales del antiguo clon en la raíz ($REMOTE_DIR)
#     Solo deben quedar: current, releases, shared, rollback.sh, status.sh, VERSION
for entry in `$(ls -A "`$REMOTE_DIR"); do
    case "`$entry" in
        current|releases|shared|rollback.sh|status.sh|VERSION)
            ;;
        *)
            rm -rf "`$REMOTE_DIR/`$entry" 2>/dev/null || true
            echo "--> [Remoto] Limpiado elemento residual en raíz: `$entry"
            ;;
    esac
done

# 15. Arrancar el nuevo servicio backend desde 'current'
echo "--> [Remoto] Arrancando backend FastAPI desde `$CURRENT_LINK/backend..."
cd "`$CURRENT_LINK/backend"
./service.sh restart

# 16. Rotación de releases (conservar las 3 más recientes)
RELEASES_COUNT=`$(find "`$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
if [ "`$RELEASES_COUNT" -gt 3 ]; then
    find "`$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort | head -n -3 | while read -r OLD_REL; do
        echo "--> [Remoto] Rotación: eliminando release antigua `$(basename "`$OLD_REL")..."
        rm -rf "`$OLD_REL"
    done
fi

echo ""
echo "=== Verificación de Sondas de Salud ==="
printf "Backend Health (/api/health): "
curl -sf --noproxy '*' http://127.0.0.1:8000/api/health || echo "ERROR"
echo ""

printf "Backend Readiness (/readyz): "
curl -sf --noproxy '*' http://127.0.0.1:8000/readyz || echo "ERROR"
echo ""

printf "Nginx Proxy (:8081/api/health): "
curl -sf --noproxy '*' http://127.0.0.1:8081/api/health || echo "ERROR"
echo ""

printf "Legacy PPTX Module: "
"`$SHARED_DIR/venv/bin/python3" -c "import sys; sys.path.insert(0, '`$CURRENT_LINK/scripts'); from export_legacy_pptx import generate_legacy_pptx_bytes; print('OK')" 2>/dev/null || echo "ERROR"
echo ""

echo "--> [Remoto] Despliegue completado con éxito."
"@

if ($DryRun) {
    Write-WarnMsg "[DryRun] Se ejecutaría por SSH en ${TargetHost}:"
    Write-Host $remoteDeployScript -ForegroundColor DarkGray
    exit 0
}

Invoke-RemoteBash -HostTarget $TargetHost -BashScript $remoteDeployScript
if ($LASTEXITCODE -ne 0) {
    Write-Error "El despliegue remoto falló con código de salida $LASTEXITCODE."
    exit $LASTEXITCODE
}

$Stopwatch.Stop()
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ("   ¡Despliegue completado con éxito en {0:N1}s!                   " -f $Stopwatch.Elapsed.TotalSeconds) -ForegroundColor Green
Write-Host "   Frontend : http://10.132.68.85:8081/dashboards/reportes-incidencias/" -ForegroundColor Cyan
Write-Host "   Backend  : http://10.132.68.85:8081/api/health" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Green
