# Colores y helpers de logging compartidos por deploy.sh, service.sh y
# maintenance.sh. Este fichero se source-ea, no se ejecuta directamente.

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}i  $1${NC}"; }
log_success() { echo -e "${GREEN}OK $1${NC}"; }
log_error()   { echo -e "${RED}!! $1${NC}"; }
log_warn()    { echo -e "${YELLOW}?? $1${NC}"; }
