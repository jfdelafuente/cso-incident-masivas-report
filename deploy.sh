#!/bin/bash

# Script de deployment para reportes-incidencias
# Uso: ./deploy.sh

set -e

echo "🚀 Iniciando despliegue de Reportes de Incidencias"
echo "=================================================="

# Configuración
DEPLOY_PATH="/infocodes/cso-incident-masivas-report"
REPO_URL="https://github.com/jfdelafuente/cso-incident-masivas-report.git"
BACKEND_PORT=8000
FRONTEND_PATH="$DEPLOY_PATH/app"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. Clonar o actualizar repositorio
log_info "Paso 1: Clonar/actualizar repositorio"
if [ -d "$DEPLOY_PATH" ]; then
    cd "$DEPLOY_PATH"
    git pull origin main
    log_success "Repositorio actualizado"
else
    git clone "$REPO_URL" "$DEPLOY_PATH"
    cd "$DEPLOY_PATH"
    log_success "Repositorio clonado"
fi

# 2. Preparar backend
log_info "Paso 2: Preparar backend Python"
cd "$DEPLOY_PATH/backend"

# Crear entorno virtual si no existe
if [ ! -d "venv" ]; then
    python3 -m venv venv
    log_success "Entorno virtual creado"
fi

# Activar entorno
source venv/bin/activate

# Instalar dependencias
log_info "Instalando dependencias..."
pip install -q -r requirements.txt
log_success "Dependencias instaladas"

# 3. Crear base de datos
log_info "Paso 3: Inicializar base de datos"
python3 << 'EOF'
from main import Base, engine
Base.metadata.create_all(bind=engine)
print("Base de datos inicializada")
EOF
log_success "Base de datos lista"

# 4. Actualizar Nginx
log_info "Paso 4: Actualizar configuración Nginx"
sudo cp "$DEPLOY_PATH/nginx.conf" /etc/nginx/nginx.conf
sudo nginx -t
sudo systemctl reload nginx
log_success "Nginx configurado y recargado"

# 5. Iniciar/reiniciar backend
log_info "Paso 5: Iniciar backend"

# Detener proceso anterior si existe
pkill -f "python3 main.py" || true
sleep 1

# Iniciar backend en background
cd "$DEPLOY_PATH/backend"
nohup python3 main.py > nohup.out 2>&1 &
sleep 2

# Verificar que está corriendo
if curl -s http://localhost:$BACKEND_PORT/health > /dev/null; then
    log_success "Backend corriendo en puerto $BACKEND_PORT"
else
    log_error "Backend no responde en puerto $BACKEND_PORT"
    cat nohup.out
    exit 1
fi

# 6. Verificar frontend
log_info "Paso 6: Verificar frontend"
if [ -f "$FRONTEND_PATH/index.html" ]; then
    log_success "Frontend en: $FRONTEND_PATH"
else
    log_error "Frontend no encontrado en: $FRONTEND_PATH"
    exit 1
fi

# 7. Resumen
echo ""
echo "=================================================="
echo -e "${GREEN}✨ ¡Despliegue completado exitosamente!${NC}"
echo "=================================================="
echo ""
echo "📍 Ubicaciones:"
echo "   Frontend: $FRONTEND_PATH"
echo "   Backend:  $DEPLOY_PATH/backend"
echo "   Base datos: $DEPLOY_PATH/backend/reports.db"
echo ""
echo "🌐 Acceso:"
echo "   URL: http://10.132.68.85:8081/reportes-incidencias"
echo "   API: http://10.132.68.85:8081/api"
echo ""
echo "📊 Monitoreo:"
echo "   Logs backend: tail -f $DEPLOY_PATH/backend/nohup.out"
echo "   Logs nginx: tail -f /var/log/nginx/infocodes.access.log"
echo ""
echo "✅ Estado:"
ps aux | grep "python3 main.py" | grep -v grep && echo "   Backend: ✅ Corriendo" || echo "   Backend: ❌ No corriendo"
curl -s http://localhost:$BACKEND_PORT/health && echo "   Health check: ✅ OK" || echo "   Health check: ❌ Fallo"
echo ""
