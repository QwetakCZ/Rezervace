# === Postup nasazení na Active24 ===

Tady je pořadí, jak nasadit aplikaci:

## Fáze 1: Příprava na svém počítači (doma)

### Frontend build
```bash
cd C:\xampp\htdocs\Rezervace\frontend
npm run build
```

Vytvoří se `frontend/dist/` s HTML/JS/CSS.

### Backend .env
```bash
# Kopíruj template:
cp backend\.env.production.tt-denik backend\.env
```

Uprav `backend\.env` s reálnými credentials:
- `DATABASE_URL` — tvoje MySQL host/user/heslo
- `ADMIN_AUTH_SECRET` — silné heslo (32+ znaků)
- `CORS_ORIGIN` — `https://rezervace.tt-denik.cz`

### Lokální test
```bash
cd backend
npm install
npm start
```

Ověř, že API funguje na `http://localhost:4000`.

---

## Fáze 2: Příprava MySQL na Active24

### Via cPanel (nejjednodušší)

1. Jdi do cPanel → "MySQL Databases"
2. Vytvoř databázi: `stolni_tenis_rezervace`
3. Vytvoř uživatele: `rezervace_user` s heslem
4. Dej mu práva na `stolni_tenis_rezervace.*` (SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX)

### IV phpMyAdmin (import schématu)

1. Otevřeš phpMyAdmin v cPanelu
2. Jdeš do `stolni_tenis_rezervace`
3. Klikneš na "Import"
4. Uploaduješ `dump_db.sql` z repozitáře
5. Klikneš "Go"

Tím se vytvoří všechny tabulky.

---

## Fáze 3: Frontend na FTP

### FTP přístup

1. Otevřeš FTP klienta (Filezilla, WinSCP apod.)
2. Připojíš se:
   - Host: `ftp.tt-denik.cz` (nebo co máš od Active24)
   - Uživatel: tvoje FTP credentials z Active24
   - Heslo: tvoje FTP heslo

### Upload frontendu

1. Jdeš do `public_html/sub/`
2. Vytvoříš složku `rezervace` (pokud neexistuje)
3. Uploaduješ **všechny soubory** z `C:\xampp\htdocs\Rezervace\frontend\dist\`:
   - `index.html`
   - `index.js`
   - `index.css`
   - ostatní soubory (vite.svg apod.)
4. Uploaduješ `.htaccess` (viz soubor `APACHE-HTACCESS.txt`)

### Test

Otestuješ v prohlížeči:
```
https://rezervace.tt-denik.cz
```

Mělo by se načíst.

---

## Fáze 4: Backend

Máš dvě cesty:

### Cesta A: Active24 s SSH (pokud máš)

```bash
# SSH do serveru
ssh user@tt-denik.cz

# Klonuješ repo / uploaduješ zdrojy
git clone https://github.com/your-user/rezervace.git
cd rezervace/backend

# Kopíruješ .env
cp .env.production.tt-denik .env

# Edituješ .env s reálnými credentials
nano .env

# Instaluješ
npm install

# Spouštíš daemon/service
npm start
# Nebo přes PM2:
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

### Cesta B: Pronajmutý Node.js hosting

Pokud Active24 Node.js nemá, pronajmi si:
- **Railway.app** (doporučuju — jednoduchý, free tier)
- **Render** 
- **Heroku** (zbytek s poplatky)
- **Fly.io**

Pak:
1. Deployuješ backend tam
2. V `frontend/.env.production` nastavíš:
   ```
   VITE_API_URL=https://tvuj-nodejs-backend.railway.app
   ```
3. Uploaduješ nový frontend build

---

## Připojení frontend ↔ backend

### Pokud je backend na Active24 (SSH)

Frontend už komunikuje přes `/api` (reverse proxy), nic nemusíš měnit.

### Pokud je backend na External hostingu

V `frontend/.env.production` změníš:
```
VITE_API_URL=https://tvuj-nodejs-backend.railway.app
```

Pak:
1. Znovu buildiš frontend: `npm run build`
2. Uploaduješ nový obsah `dist/` přes FTP

---

## Ověření funkčnosti

### Health checky

```bash
# Frontend OK?
curl https://rezervace.tt-denik.cz

# Backend OK?
curl https://rezervace.tt-denik.cz/api/health
# nebo pokud je external:
curl https://tvuj-nodejs-backend.railway.app/api/health

# Databáze OK?
curl https://rezervace.tt-denik.cz/api/health/db
```

Měly by vrátit JSON s OK.

### Manuální test

1. Jdeš na `https://rezervace.tt-denik.cz`
2. Klikneš na kategorii
3. Vybereš si datum a čas
4. Vyplníš kontakt
5. Potvrdíš

Mělo by to fungovat bez chyb.

---

## Produkční kontroly

Před go-live zkontroluj:

- [ ] HTTPS je zapnutý a certifikát je validní
- [ ] `ADMIN_AUTH_SECRET` není výchozí (`change-me`)
- [ ] `CORS_ORIGIN` obsahuje tvoji doménu
- [ ] Databáze je importovaná (tabulky existují)
- [ ] Frontend načítá bez erroru v konzoli
- [ ] API `/health` vrací OK
- [ ] Admin login funguje
- [ ] Rezervace se vytváří a ukládá do DB

---

## Co si ještě vyjasnit

Když máš informace níž, napíšu ti konkrétní skripty:

- [ ] Máš SSH přístup k Active24 nebo jen FTP?
- [ ] Node.js version na Active24 (pokud máš SSH: `node --version`)?
- [ ] Jaké databázové credentials si chceš vybrat?

Teď máš vše potřebné. Pokud by sis něco vyjasnit, dej vědět a jedu dál.



