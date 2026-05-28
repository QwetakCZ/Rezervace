#!/bin/bash
# =================================================================
# deploy-server.sh — Produkèní deployment skript pro Active24 VPS
# Spouštìt na serveru z adresáøe ~/Rezervace/
#   chmod +x deploy-server.sh
#   ./deploy-server.sh
# =================================================================
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'
echo -e "${CYAN}=== Rezervace — Produkèní nasazení ===${RESET}"
# -------
# KONFIGURACE — upravte podle serveru
WEB_DIR="$HOME/tt-denik/sub/rezervace"
PROJECT_DIR="$HOME/Rezervace"
APP_URL="https://rezervace.tt-denik.cz"
# -------
echo "Projekt:    $PROJECT_DIR"
echo "Web dir:    $WEB_DIR"
# [1] Git pull
echo -e "${CYAN}[1/6] Git pull...${RESET}"
cd "$PROJECT_DIR"
git pull origin main
# [2] Backend deps + .env check
echo -e "${CYAN}[2/6] Backend zavislosti...${RESET}"
cd "$PROJECT_DIR/backend"
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${RED}STOP: Vyplnte .env (DATABASE_URL, ADMIN_AUTH_SECRET) a spustte znovu!${RESET}"
    echo "Prikaz: nano $PROJECT_DIR/backend/.env"
    exit 1
fi
npm install --omit=dev
# [3] Frontend build
echo -e "${CYAN}[3/6] Frontend build...${RESET}"
cd "$PROJECT_DIR/frontend"
npm install
VITE_API_URL="" npm run build
# [4] Kopirovani do weboveho adresare
echo -e "${CYAN}[4/6] Kopirovani do $WEB_DIR ...${RESET}"
mkdir -p "$WEB_DIR"
rsync -av --delete --exclude=".htaccess" "$PROJECT_DIR/frontend/dist/" "$WEB_DIR/"
# [5] .htaccess
echo -e "${CYAN}[5/6] .htaccess...${RESET}"
if [ ! -f "$WEB_DIR/.htaccess" ]; then
    cp "$PROJECT_DIR/deploy/htaccess-rezervace.txt" "$WEB_DIR/.htaccess"
    echo "  .htaccess nainstalovan"
else
    echo "  .htaccess jiz existuje (nemenime)"
fi
# [6] PM2 restart
echo -e "${CYAN}[6/6] PM2 restart...${RESET}"
cd "$PROJECT_DIR/backend"
if pm2 list | grep -q "rezervace-backend"; then
    pm2 restart rezervace-backend --update-env
else
    pm2 start ecosystem.config.cjs
fi
pm2 save
sleep 2
# Overeni
echo ""
echo -e "${CYAN}=== Overeni ===${RESET}"
echo -n "Backend port 4001: "
if curl -sf "http://127.0.0.1:4001/api/health" > /dev/null 2>&1; then echo -e "${GREEN}OK${RESET}"; else echo -e "${RED}CHYBA${RESET}"; fi
echo -n "Backend pres domenu: "
if curl -sf "$APP_URL/api/health" > /dev/null 2>&1; then echo -e "${GREEN}OK${RESET}"; else echo -e "${YELLOW}Zkontrolujte pozdeji${RESET}"; fi
echo ""
echo -e "${GREEN}=== Hotovo! ===${RESET}"
echo "  URL: $APP_URL"
echo "  PM2 log: pm2 logs rezervace-backend"
