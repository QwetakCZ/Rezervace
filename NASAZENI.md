# Průvodce nasazením — rezervace.tt-denik.cz
## Přehled architektury
`
Browser
  │
  ▼
Apache (port 80/443)  ← subdoména rezervace.tt-denik.cz
  │         │
  │  /api/* │   ProxyPass ──► Node.js backend (port 4001, PM2)
  │  /*     │   React SPA ──► ~/tt-denik/sub/rezervace/index.html
  ▼
`
**Proč port 4001?**  
Váš tt-denik hlavní projekt pravděpodobně běží na portu 4000. Proto tento projekt používá port 4001.
---
## KROK 1 – Přihlaste se na server přes SSH
```bash
ssh vas-uzivatel@server.active24.cz
```
---
## KROK 2 – Klonujte projekt (pokud ještě není)
```bash
cd ~
git clone https://github.com/VAS-REPO/Rezervace.git
# nebo pokud adresár uz existuje:
cd ~/Rezervace
git pull origin main
```
---
## KROK 3 – Vytvořte databázi pro rezervace
Přihlaste se do MySQL a vytvořte novou, samostatnou databázi:
```sql
mysql -u root -p
-- V MySQL konzoli:
CREATE DATABASE rezervace_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'rezervace_user'@'localhost' IDENTIFIED BY 'SILNE_HESLO_ZDE';
GRANT ALL PRIVILEGES ON rezervace_db.* TO 'rezervace_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
Poté importujte schéma tabulek:
```bash
mysql -u rezervace_user -p rezervace_db < ~/Rezervace/dump_db.sql
```
---
## KROK 4 – Nakonfigurujte backend (.env)
```bash
cd ~/Rezervace/backend
cp .env.example .env
nano .env
```
Vyplňte tyto hodnoty:
```env
PORT=4001
DATABASE_URL=mysql://rezervace_user:SILNE_HESLO_ZDE@localhost:3306/rezervace_db
ADMIN_AUTH_SECRET=VYGENERUJTE_NAHODNY_RETEZEC
CORS_ORIGIN=https://rezervace.tt-denik.cz
NODE_ENV=production
```
Pro vygenerování ADMIN_AUTH_SECRET:
```bash
openssl rand -hex 32
```
Uložte a zavřete nano: **Ctrl+X, Y, Enter**
---
## KROK 5 – Vytvořte admin účet
```bash
cd ~/Rezervace/backend
npm install
# Vytvořit první admin účet:
node scripts/upsert-admin.mjs
```
---
## KROK 6 – Spusťte backend přes PM2
```bash
cd ~/Rezervace/backend
pm2 start ecosystem.config.cjs
pm2 save      # uloží pro autostart po rebootu
# Ověření:
curl http://127.0.0.1:4001/api/health
# Očekávaný výstup: {"ok":true,"service":"rezervace-backend"}
```
---
## KROK 7 – Sestavte frontend
```bash
cd ~/Rezervace/frontend
npm install
# VITE_API_URL="" = frontend volá /api/* (relativní URL)
# Apache proxy to přesměruje na Node.js
VITE_API_URL="" npm run build
```
---
## KROK 8 – Zkopírujte frontend do webového adresáře
```bash
# Ujistěte se, že adresář subdomény existuje
mkdir -p ~/tt-denik/sub/rezervace
# Zkopírovat build
rsync -av --delete \
    --exclude=".htaccess" \
    ~/Rezervace/frontend/dist/ \
    ~/tt-denik/sub/rezervace/
```
---
## KROK 9 – Nastavte .htaccess (Apache proxy)
```bash
cp ~/Rezervace/deploy/htaccess-rezervace.txt ~/tt-denik/sub/rezervace/.htaccess
```
Tento .htaccess zajišťuje:  
- /api/* → proxy na Node.js (port 4001)  
- vše ostatní → React SPA (index.html)
---
## KROK 10 – Ověřte, že vše funguje
```bash
# 1. Backend přímo
curl http://127.0.0.1:4001/api/health
# 2. Backend přes doménu (musí fungovat proxy)
curl https://rezervace.tt-denik.cz/api/health
# 3. Frontend
# Otevřete browser: https://rezervace.tt-denik.cz
```
---
## Pro příští aktualizace
Stačí spustit deployment skript:
```bash
cd ~/Rezervace
chmod +x deploy-server.sh
./deploy-server.sh
```
---
## Časté problémy
### Backend neodpovídá na portu 4001
```bash
pm2 status
pm2 logs rezervace-backend
```
### Apache proxy nefunguje (403/404 na /api)
Zkontrolujte, jestli je mod_proxy povoleno:
```bash
apache2ctl -M | grep proxy
```
Pokud není, kontaktujte Active24 podporu nebo povolte ručně.
### Databáze se nepřipojí
```bash
mysql -u rezervace_user -p rezervace_db -e "SELECT 1"
```
### PM2 se nespustí po rebootu
```bash
pm2 startup   # vygeneruje příkaz pro systemd
# Spusťte příkaz, který PM2 vypíše
pm2 save
```
