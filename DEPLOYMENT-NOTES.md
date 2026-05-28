# Deployment Notes — rezervace.tt-denik.cz

> Dokument popisuje všechny problémy které nastaly při nasazení a co je potřeba dělat při každém dalším uploadu.

---

## 🏗️ Architektura na serveru

```
Browser → https://rezervace.tt-denik.cz
              ↓
         Apache (.htaccess)
              ↓
    /api/*  →  api-proxy.php  →  Unix socket (rezervace.sock)  →  Node.js (PM2)
    /*      →  index.html (React SPA)
```

**Webový adresář:**
```
/data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/tt-denik.cz/sub/rezervace/
```

**Backend adresář (git clone):**
```
/data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/Rezervace/backend/
```

**Unix socket:**
```
/data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/rezervace.sock
```

---

## ⚠️ KRITICKÉ PROBLÉMY & ŘEŠENÍ

### 1. Varnish cache na Active24
**Problém:** Active24 má server-side Varnish cache. Po nahrání nového souboru přes FTP curl/browser stále vrací **starou verzi** souboru. `Cache-Control: no-cache` hlavičky Varnish ignoruje.

**Příznak:** `curl https://rezervace.tt-denik.cz/index.js` vrací starý obsah, ale `grep` přímo na souboru vrací nový.

**Řešení:** V `index.html` na serveru musí být verzovací parametr u `index.js` a `index.css`:
```html
<script type="module" crossorigin src="./index.js?v=YYYYMMDD"></script>
<link rel="stylesheet" crossorigin href="./index.css?v=YYYYMMDD">
```
Po každém uploadu nového `index.js` nutno změnit verzi! (viz sekce "Postup při uploadu")

---

### 2. VITE_API_URL musí být správně nastavena při buildu
**Problém:** Soubor `frontend/.env` obsahuje `VITE_API_URL=http://localhost:4000`. Pokud build nepoužije `.env.production`, vznikne soubor s `localhost:4000` místo správné URL.

**Soubory:**
- `frontend/.env` → `VITE_API_URL=http://localhost:4000` (lokální vývoj)
- `frontend/.env.production` → `VITE_API_URL=https://rezervace.tt-denik.cz` (PRODUKCE)

**Správný příkaz pro build:**
```powershell
cd C:\xampp\htdocs\Rezervace\frontend
npm run build:root
```
Tento příkaz spustí `vite build` (automaticky použije `.env.production`) + zkopíruje soubory do root složky.

**Ověření správného buildu:**
```powershell
$c = Get-Content "C:\xampp\htdocs\Rezervace\index.js" -Raw
$c.IndexOf('"https://rezervace.tt-denik.cz"')
# Musí vrátit číslo > 0 (ne -1)
```

---

### 3. api-proxy.php — Unix socket (ne TCP port!)
**Problém:** PHP na Active24 běží v izolovaném prostředí — nemůže se připojit na `127.0.0.1:4001` ani na IP serveru. Jediná funkční komunikace je přes **Unix socket**.

**Soubor:** `deploy/api-proxy.php`

**Klíčová konfigurace:**
```php
$socketPath = '/data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/rezervace.sock';
curl_setopt($ch, CURLOPT_UNIX_SOCKET_PATH, $socketPath);
```

**CORS OPTIONS musí být PRVNÍ** (před curl voláním!):
```php
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit; // ← okamžitě, NEVOLAT backend
}
```

---

### 4. Node.js backend — Unix socket místo TCP
**Soubor:** `backend/src/server.js`

Backend poslouchá na Unix socketu pokud je nastavena proměnná `SOCKET_PATH`:
```javascript
const SOCKET = process.env.SOCKET_PATH || null;
if (SOCKET) {
    if (fs.existsSync(SOCKET)) fs.unlinkSync(SOCKET);
    app.listen(SOCKET, () => {
        fs.chmodSync(SOCKET, "777");
    });
}
```

**Backend `.env` na serveru** (`~/Rezervace/backend/.env`):
```
PORT=4001
DATABASE_URL=mysql://qwetakcz:...@db.r4.active24.cz:3306/stolni_tenis_rezervace
ADMIN_AUTH_SECRET=...
SOCKET_PATH=/data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/rezervace.sock
```
⚠️ **Tento soubor NENÍ v gitu** — nesmí se přepsat!

---

### 5. MySQL SSL na Active24
**Problém:** Active24 používá self-signed TLS certifikát pro MySQL. Bez `rejectUnauthorized: false` selže připojení.

**Soubor:** `backend/src/db.js` — místní verze na serveru má opravu:
```javascript
ssl: { rejectUnauthorized: false }
```
⚠️ **Tento soubor má lokální změny na serveru** — `git pull` ho přepíše! Viz sekce "git pull".

---

### 6. PM2 — spuštění bez sudo
PM2 je nainstalováno do `~/.npm-global/` (ne globálně):
```bash
~/.npm-global/bin/pm2 status
```
nebo pokud je v PATH:
```bash
pm2 status
```

**Restart backendu:**
```bash
cd ~/Rezervace/backend
pm2 restart rezervace-backend
# nebo
pm2 start ecosystem.config.cjs
```

**Watchdog cron job** (každých 5 minut kontroluje backend):
```
*/5 * * * * curl -s --unix-socket /data/.../rezervace.sock http://localhost/api/health > /dev/null 2>&1 || (cd ~/Rezervace/backend && ~/.npm-global/bin/pm2 restart rezervace-backend >> /tmp/pm2-watchdog.log 2>&1)
```

---

### 7. SPA routing — absolutní cesty v index.html
**Problém:** S `base: "./"` ve vite.config.js jsou cesty k JS/CSS relativní. Pokud je React router na `/admin`, prohlížeč hledá `/admin/index.js` místo `/index.js` → soubor neexistuje → `.htaccess` vrátí `index.html` (HTML místo JS) → MIME type error:
```
Failed to load module script: Expected a JavaScript module but server responded with "text/html"
```

**Řešení:** `vite.config.js` má `base: "/"` (absolutní cesty). Index.html musí mít:
```html
<script type="module" src="/index.js?v=..."></script>  <!-- "/" ne "./" -->
<link rel="stylesheet" href="/index.css?v=...">
```

Pokud se problém objeví znovu na serveru:
```bash
sed -i 's|src="./index.js|src="/index.js|g' ~/tt-denik.cz/sub/rezervace/index.html
sed -i 's|href="./index.css|href="/index.css|g' ~/tt-denik.cz/sub/rezervace/index.html
```

---

## 📋 POSTUP PŘI KAŽDÉM DALŠÍM UPLOADU

### A) Změny ve frontendu (React/JS)

1. **Lokálně zbuildovat:**
   ```powershell
   cd C:\xampp\htdocs\Rezervace\frontend
   npm run build:root
   ```

2. **Ověřit správnou URL v buildu:**
   ```powershell
   Select-String -Path "..\index.js" -Pattern "rezervace.tt-denik"
   # Musí najít výsledek
   ```

3. **Nahrát přes FTP** do `/sub/rezervace/`:
   - `C:\xampp\htdocs\Rezervace\index.html`
   - `C:\xampp\htdocs\Rezervace\index.js`
   - `C:\xampp\htdocs\Rezervace\index.css`

4. **Na serveru změnit verzi v index.html** (kvůli Varnish cache!):
   ```bash
   VERZE=$(date +%Y%m%d%H%M)
   sed -i "s|index.js?v=[^\"]*|index.js?v=$VERZE|g" ~/tt-denik.cz/sub/rezervace/index.html
   sed -i "s|index.css?v=[^\"]*|index.css?v=$VERZE|g" ~/tt-denik.cz/sub/rezervace/index.html
   cat ~/tt-denik.cz/sub/rezervace/index.html
   ```

5. **Ověřit přes curl:**
   ```bash
   VERZE=$(grep -o 'v=[0-9]*' ~/tt-denik.cz/sub/rezervace/index.html | head -1 | cut -d= -f2)
   curl -s "https://rezervace.tt-denik.cz/index.js?v=$VERZE" | grep -o '"https://rezervace\.tt-denik\.cz"' && echo "OK!"
   ```

---

### B) Změny v backendu (Node.js)

1. **Nahrát změněné soubory přes FTP** do `~/Rezervace/backend/src/`

2. **POZOR na `db.js`** — má lokální opravu SSL na serveru:
   ```bash
   # Zkontrolujte zda je oprava stále přítomna:
   grep "rejectUnauthorized" ~/Rezervace/backend/src/db.js
   # Musí vrátit: ssl: { rejectUnauthorized: false }
   ```
   Pokud chybí, přidejte znovu (viz problém #5 výše).

3. **Restartovat backend:**
   ```bash
   cd ~/Rezervace/backend
   pm2 restart rezervace-backend
   sleep 2
   curl --unix-socket /data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/rezervace.sock http://localhost/api/health
   # Musí vrátit: {"ok":true,"service":"rezervace-backend"}
   ```

---

### C) Git pull na serveru

⚠️ **`git pull` přepíše `backend/src/db.js`** (lokální SSL oprava se ztratí)!

Bezpečný postup:
```bash
cd ~/Rezervace

# 1. Uložit db.js změny
git stash

# 2. Pullnout
git pull

# 3. Obnovit db.js
git stash pop

# 4. Pokud stash pop selže, ručně opravit db.js:
# přidat ssl: { rejectUnauthorized: false } do pool konfigurace

# 5. Restartovat backend
pm2 restart rezervace-backend
```

---

### D) Změny v api-proxy.php nebo .htaccess

Nahrát přes FTP do `/sub/rezervace/`:
- `C:\xampp\htdocs\Rezervace\deploy\api-proxy.php` → `api-proxy.php`
- `C:\xampp\htdocs\Rezervace\deploy\htaccess-rezervace.txt` → `.htaccess`

---

## 🔍 DIAGNOSTICKÉ PŘÍKAZY

```bash
# Backend běží?
pm2 status
curl --unix-socket /data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/rezervace.sock http://localhost/api/health

# Socket existuje?
ls -la /data/c/7/c764ba13-897c-4f1f-8815-8089a472d993/rezervace.sock

# PHP proxy funguje?
curl https://rezervace.tt-denik.cz/api/health
curl "https://rezervace.tt-denik.cz/api/company?companyId=1"

# CORS OPTIONS funguje?
curl -X OPTIONS "https://rezervace.tt-denik.cz/api/health" -v 2>&1 | grep -iE "< HTTP|access-control"

# Správný index.js na serveru?
grep -o '"https://rezervace\.tt-denik\.cz"' ~/tt-denik.cz/sub/rezervace/index.js

# Co Varnish skutečně servíruje?
curl -s https://rezervace.tt-denik.cz/index.js | grep -o '"https://rezervace\.tt-denik\.cz"' || echo "VARNISH SERVUJE STARY SOUBOR"

# PM2 logy (chyby backendu):
pm2 logs rezervace-backend --lines 50
```

---

## 📁 Klíčové soubory (lokální)

| Soubor | Popis |
|--------|-------|
| `frontend/.env.production` | Produkční VITE_API_URL |
| `frontend/src/api.js` | API klient s fallback logikou |
| `deploy/api-proxy.php` | PHP proxy (Unix socket + CORS) |
| `deploy/htaccess-rezervace.txt` | .htaccess šablona |
| `backend/src/server.js` | Unix socket podpora |
| `backend/src/db.js` | MySQL SSL oprava (lokální změna na serveru!) |
| `backend/ecosystem.config.cjs` | PM2 konfigurace |

