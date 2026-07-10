#!/bin/bash

# Script de deployment para reportes-incidencias
# Uso: ./deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/backend/lib.sh"

echo "🚀 Iniciando despliegue de Reportes de Incidencias"
echo "=================================================="

# Configuración
DEPLOY_PATH="/infocodes/project/cso-incident-masivas-report"
REPO_URL="https://github.com/jfdelafuente/cso-incident-masivas-report.git"
BACKEND_PORT=8000
FRONTEND_PATH="$DEPLOY_PATH/app"

# 1. Clonar o actualizar repositorio
log_info "Paso 1: Clonar/actualizar repositorio"
if [ -d "$DEPLOY_PATH" ]; then
    cd "$DEPLOY_PATH"
    git pull origin main
    log_success "Repositorio actualizado"
else
    mkdir -p "$(dirname "$DEPLOY_PATH")"
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
pip install --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org -q -r requirements.txt
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
NGINX_BIN="/infocodes/nginx/sbin/nginx"
NGINX_CONF="/infocodes/nginx/conf/nginx.conf"
NGINX_BACKUP="$NGINX_CONF.backup.$(date +%Y%m%d_%H%M%S)"
cp "$NGINX_CONF" "$NGINX_BACKUP"
cp "$DEPLOY_PATH/nginx.conf" "$NGINX_CONF"
if "$NGINX_BIN" -c "$NGINX_CONF" -t; then
    "$NGINX_BIN" -c "$NGINX_CONF" -s reload
    log_success "Nginx configurado y recargado"
else
    log_error "Configuración de Nginx inválida, restaurando backup"
    cp "$NGINX_BACKUP" "$NGINX_CONF"
    exit 1
fi

# 5. Iniciar/reiniciar backend
log_info "Paso 5: Iniciar backend"
cd "$DEPLOY_PATH/backend"
chmod +x service.sh
if BACKEND_PORT="$BACKEND_PORT" ./service.sh restart; then
    log_success "Backend corriendo en puerto $BACKEND_PORT"
else
    log_error "Backend no responde en puerto $BACKEND_PORT"
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
echo "   Logs backend: tail -f $DEPLOY_PATH/backend/backend.log"
echo "   Logs nginx: tail -f /infocodes/var/log/nginx/infocodes.access.log"
echo "   Estado backend: $DEPLOY_PATH/backend/service.sh status"
echo ""
echo "✅ Estado:"
(cd "$DEPLOY_PATH/backend" && ./service.sh status) || true
echo ""
