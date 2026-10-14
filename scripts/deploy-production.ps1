<#
.SYNOPSIS
    Despliegue automatizado en 1 clic de CSO Incident Masivas Report a producción.

.DESCRIPTION
    Automatiza el despliegue del proyecto hacia el servidor central AOTLXPRBOA00001 (infocodes@10.132.26.96):
      1. Por defecto: sincroniza la rama 'main' en el servidor remoto y ejecuta deploy.sh.
      2. Con -SyncFiles: empaqueta el árbol local y lo transfiere por SCP para despliegues directos sin pasar por git.
      3. Ejecución de deploy.sh en remoto:
         - Backup preventivo automático de la BD en /infocodes/var/backups/cso-incident-masivas-report/.
         - Inicialización/migración de base de datos a /infocodes/var/data/cso-incident-masivas-report/reports.db.
         - Despliegue modular en Nginx (/infocodes/nginx/conf/conf.d/cso-incident.conf).
         - Reinicio seguro del backend FastAPI con verificación de sondas /api/health, /healthz y /readyz.

.PARAMETER TargetHost
    Host SSH de destino. Por defecto: "infocodes@10.132.26.96".

.PARAMETER RemoteDir
    Ruta remota de la aplicación. Por defecto: "/infocodes/project/cso-incident-masivas-report".

.PARAMETER SyncFiles
    Empaqueta y transfiere los archivos locales (excluyendo venv, git y cachés) antes de ejecutar el deploy.

.PARAMETER VerifyOnly
    Solo verifica el estado del servicio backend y las sondas HTTP remotas.

.PARAMETER RestartOnly
    Reinicia el servicio backend FastAPI sin alterar el código ni la configuración de Nginx.

.PARAMETER Rollback
    Restaura la última copia de seguridad previa de la base de datos desde /infocodes/var/backups/.

.PARAMETER DryRun
    Muestra los comandos que se ejecutarían sin realizar cambios en el servidor remoto.

.EXAMPLE
    .\scripts\deploy-production.ps1
    Despliegue estándar actualizando el repositorio vía git pull y ejecutando deploy.sh en el servidor.

.EXAMPLE
    .\scripts\deploy-production.ps1 -SyncFiles
    Empaqueta el código local actual y lo despliega directamente en el servidor.

.EXAMPLE
    .\scripts\deploy-production.ps1 -VerifyOnly
    Comprueba el estado de salud del backend y la respuesta de Nginx sin realizar cambios.

.EXAMPLE
    .\scripts\deploy-production.ps1 -RestartOnly
    Reinicia el backend FastAPI en el servidor remoto.
#>

[CmdletBinding()]
param(
    [string]$TargetHost = "infocodes@10.132.26.96",
    [string]$RemoteDir = "/infocodes/project/cso-incident-masivas-report",
    [switch]$SyncFiles,
    [switch]$VerifyOnly,
    [switch]$RestartOnly,
    [switch]$Rollback,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$RemoteTmpTarball = "/tmp/cso-incident-deploy.tar.gz"

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
Write-Host "   Deploy 1-Clic - CSO Incident Masivas Report                   " -ForegroundColor Cyan
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
cd "`$REMOTE_DIR/backend"

echo "=== Estado del Backend (service.sh) ==="
./service.sh status || true

echo ""
echo "=== Sondas HTTP Internas ==="
printf "Liveness (/healthz): "
curl -sf --noproxy '*' http://127.0.0.1:8000/healthz || echo "ERROR"
echo ""

printf "Readiness (/readyz): "
curl -sf --noproxy '*' http://127.0.0.1:8000/readyz || echo "ERROR"
echo ""

printf "Health Legacy (/api/health): "
curl -sf --noproxy '*' http://127.0.0.1:8000/api/health || echo "ERROR"
echo ""

echo "=== Nginx Frontend Proxy (:8081/reportes-incidencias/) ==="
printf "HTTP Code: "
curl -s --noproxy '*' -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8081/reportes-incidencias/ || echo "ERROR"
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
cd "`$REMOTE_DIR/backend"
./service.sh restart
./service.sh status
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
# MODO ROLLBACK: Restauración de backup previo de base de datos
# -------------------------------------------------------------------------
if ($Rollback) {
    Write-Step "ROLLBACK" "Buscando último backup en /infocodes/var/backups/cso-incident-masivas-report/..."

    $rollbackScript = @"
set -e
BACKUP_DIR="/infocodes/var/backups/cso-incident-masivas-report"
TARGET_DB="/infocodes/var/data/cso-incident-masivas-report/reports.db"
REMOTE_DIR="$RemoteDir"

if [ ! -d "`$BACKUP_DIR" ]; then
    echo "ERROR: Directorio de backups `$BACKUP_DIR no existe."
    exit 1
fi

LATEST_BACKUP=`$(ls -t "`$BACKUP_DIR"/reports_*.db 2>/dev/null | head -n 1)
if [ -z "`$LATEST_BACKUP" ]; then
    echo "ERROR: No se encontraron backups en `$BACKUP_DIR"
    exit 1
fi

echo "--> Restaurando desde `$LATEST_BACKUP hacia `$TARGET_DB..."
cd "`$REMOTE_DIR/backend"
./service.sh stop || true
cp "`$LATEST_BACKUP" "`$TARGET_DB"
./service.sh start
./service.sh status
echo "--> Base de datos restaurada correctamente."
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
# MODO SYNC-FILES: Empaquetar y subir archivos locales
# -------------------------------------------------------------------------
if ($SyncFiles) {
    Write-Step "1/3" "Empaquetando árbol local del proyecto..."
    $LocalTar = Join-Path ([System.IO.Path]::GetTempPath()) "cso-incident-local.tar.gz"
    if (Test-Path $LocalTar) { Remove-Item $LocalTar -Force }

    $ExcludeArgs = @(
        "--exclude=.git",
        "--exclude=backend/venv",
        "--exclude=backend/__pycache__",
        "--exclude=backend/report_generator/__pycache__",
        "--exclude=scripts/__pycache__",
        "--exclude=*.tar.gz",
        "--exclude=*.tgz",
        "--exclude=*.whl"
    )

    $TarCmd = "tar -czf `"$LocalTar`" $($ExcludeArgs -join ' ') -C `"$ProjectRoot`" ."
    if ($DryRun) {
        Write-WarnMsg "[DryRun] Se crearía archivo: $LocalTar con comando:"
        Write-Host "  $TarCmd" -ForegroundColor DarkGray
    } else {
        cmd.exe /c $TarCmd
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Error al empaquetar archivos locales."
            exit 1
        }
        $SizeMB = (Get-Item $LocalTar).Length / 1MB
        Write-Ok ("Paquete local creado: {0:N2} MB" -f $SizeMB)

        Write-Step "2/3" "Subiendo paquete por SCP a ${TargetHost}:${RemoteTmpTarball}..."
        scp -q "$LocalTar" "${TargetHost}:${RemoteTmpTarball}"
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Fallo en la transferencia por SCP hacia $TargetHost."
            exit 1
        }
        Write-Ok "Subida completada."
        Remove-Item $LocalTar -Force -ErrorAction SilentlyContinue
    }
}

# -------------------------------------------------------------------------
# EJECUCIÓN DEL DESPLIEGUE REMOTO (deploy.sh)
# -------------------------------------------------------------------------
Write-Step $(if ($SyncFiles) { "3/3" } else { "1/2" }) "Ejecutando deploy.sh en $TargetHost..."

$deployScript = @"
set -e
REMOTE_DIR="$RemoteDir"
TMP_TAR="$RemoteTmpTarball"

mkdir -p "`$REMOTE_DIR"
cd "`$REMOTE_DIR"

if [ "$($SyncFiles.IsPresent)" = "True" ] && [ -f "`$TMP_TAR" ]; then
    echo "--> [Remoto] Desempaquetando archivos transferidos en `$REMOTE_DIR..."
    tar -xzf "`$TMP_TAR" -C "`$REMOTE_DIR"
    rm -f "`$TMP_TAR"
    DEPLOY_FLAGS="--no-pull"
else
    DEPLOY_FLAGS=""
fi

# Normalizar saltos de línea y permisos de ejecución
sed -i 's/\r$//' deploy.sh 2>/dev/null || true
chmod +x deploy.sh
find backend -maxdepth 2 -name "*.sh" -exec sed -i 's/\r$//' {} + 2>/dev/null || true
find backend -maxdepth 2 -name "*.sh" -exec chmod +x {} + 2>/dev/null || true

# Ejecutar el script central de despliegue
./deploy.sh `$DEPLOY_FLAGS
"@

if ($DryRun) {
    Write-WarnMsg "[DryRun] Se ejecutaría deploy por SSH en ${TargetHost}:"
    Write-Host $deployScript -ForegroundColor DarkGray
    exit 0
}

Invoke-RemoteBash -HostTarget $TargetHost -BashScript $deployScript
if ($LASTEXITCODE -ne 0) {
    Write-Error "El despliegue remoto falló con código de salida $LASTEXITCODE."
    exit $LASTEXITCODE
}

$Stopwatch.Stop()
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ("   Despliegue completado con exito en {0:N1}s!                     " -f $Stopwatch.Elapsed.TotalSeconds) -ForegroundColor Green
Write-Host "   Frontend : http://10.132.68.85:8081/reportes-incidencias/" -ForegroundColor Cyan
Write-Host "   Backend  : http://10.132.68.85:8081/api/" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Green

