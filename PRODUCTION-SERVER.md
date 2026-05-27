# GitHub + produkční server příprava

Tento návod navazuje na aktuální stav projektu a řeší dvě věci:

1. jak projekt připravit pro **GitHub Desktop / GitHub**,
2. jak ho bezpečně nasadit na **produkční server**.

---

## 1. GitHub Desktop / GitHub

### Co je v repozitáři připravené

- `.gitignore` chrání lokální `.env` soubory, logy a `node_modules/`
- `.github/workflows/ci.yml` spouští backend testy a frontend build
- `backend/.env.production.example` a `frontend/.env.production.example` jsou připravené jako produkční šablony
- `backend/ecosystem.config.cjs` je připraven pro PM2

### Doporučený postup v GitHub Desktop

1. Otevřete GitHub Desktop.
2. Zvolte **File -> Add local repository...**
3. Vyberte složku:
   - `C:\xampp\htdocs\Rezervace`
4. Pokud ještě nebude publikovaný remote, klikněte na **Publish repository**.
5. Nastavte:
   - Name: `rezervace`
   - Local path: `C:\xampp\htdocs\Rezervace`
   - Branch: `main`
   - Private/Public podle potřeby
6. Potvrďte publikování.

### Co NEcommitovat

Nesdílejte do GitHubu:

- `backend/.env`
- `frontend/.env`
- databázová hesla
- produkční tokeny / secrets
- runtime logy

---

## 2. Produkční architektura

Doporučené rozdělení:

- **Frontend**: statické soubory z `frontend/dist/`
- **Backend**: Node.js Express aplikace na portu `4000`
- **Databáze**: MySQL / MariaDB
- **Web server**: Nginx nebo Apache
- **HTTPS**: povinně
- **Process manager**: PM2

Doporučená URL struktura:

- frontend: `https://rezervace.example.cz/`
- backend přes reverse proxy: `https://rezervace.example.cz/api`

To je nejjednodušší varianta i pro iframe.

---

## 3. Produkční soubory

### Backend

Zkopírujte:

- `backend/.env.production.example` -> `backend/.env`
- upravte hodnoty pro produkci

### Frontend

Zkopírujte:

- `frontend/.env.production.example` -> `frontend/.env.production`

Doporučená hodnota:

```dotenv
VITE_API_URL=/api
```

---

## 4. První nasazení na server

### 4.1 Klon / kopie projektu

Na serveru potřebujete projekt dostat například do:

```text
/var/www/rezervace
```

### 4.2 Backend install

```bash
cd /var/www/rezervace/backend
cp .env.production.example .env
npm install
```

Pak upravte `backend/.env`.

### 4.3 Frontend build

```bash
cd /var/www/rezervace/frontend
cp .env.production.example .env.production
npm install
npm run build
```

### 4.4 Nasazení frontend souborů

Obsah `frontend/dist/` nasaďte do veřejného web rootu, například:

```text
/var/www/public/rezervace
```

Pokud chcete servovat frontend z kořene domény, zkopírujte obsah `dist/` do příslušného document rootu.

---

## 5. PM2 spuštění backendu

Použijte připravený soubor `backend/ecosystem.config.cjs`.

### Instalace PM2

```bash
npm install -g pm2
```

### Start aplikace

```bash
cd /var/www/rezervace/backend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### Užitečné příkazy

```bash
pm2 list
pm2 logs rezervace-backend
pm2 restart rezervace-backend
pm2 stop rezervace-backend
```

---

## 6. Nginx konfigurace

Příklad pro jednu doménu, kde:

- frontend běží z `/`
- backend je dostupný přes `/api`

```nginx
server {
    listen 80;
    server_name rezervace.example.cz www.rezervace.example.cz;

    root /var/www/public/rezervace;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Poté doplňte HTTPS třeba přes Let's Encrypt.

---

## 7. Apache konfigurace

Pokud frontend servujete přes Apache a backend běží zvlášť na portu `4000`, použijte:

### SPA rewrite

Soubor `.htaccess` na rootu už je připraven pro fallback na `index.html`.

### Reverse proxy pro API

Je potřeba zapnout moduly:

- `proxy`
- `proxy_http`
- `rewrite`
- `headers`

Příklad VirtualHost:

```apache
<VirtualHost *:80>
    ServerName rezervace.example.cz
    DocumentRoot /var/www/public/rezervace

    <Directory /var/www/public/rezervace>
        AllowOverride All
        Require all granted
    </Directory>

    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:4000/api
    ProxyPassReverse /api http://127.0.0.1:4000/api
</VirtualHost>
```

---

## 8. Databáze

Máte dvě možnosti:

### Varianta A: import z dumpu

```bash
mysql -u root -p stolni_tenis_rezervace < /var/www/rezervace/dump_db.sql
```

### Varianta B: schéma + vlastní data

Použijte `api/schema.sql` a následně vložte vlastní data.

---

## 9. Povinné produkční kontroly

Před spuštěním ověřte:

- `ADMIN_AUTH_SECRET` není výchozí
- `CORS_ORIGIN` obsahuje produkční domény
- databázový uživatel nemá zbytečně široká práva
- backend port `4000` není veřejně otevřený do internetu
- HTTPS je zapnuté
- funguje `GET /api/health`
- funguje `GET /api/health/db`
- frontend komunikuje s `/api`

### Health checky

```bash
curl https://rezervace.example.cz/api/health
curl https://rezervace.example.cz/api/health/db
```

---

## 10. Doporučený release postup

### Po každé změně

```bash
cd /var/www/rezervace/backend
npm install

cd /var/www/rezervace/frontend
npm install
npm run build

cd /var/www/rezervace/backend
pm2 restart rezervace-backend
```

Pokud frontend build kopírujete do jiného document rootu, zkopírujte znovu obsah `frontend/dist/`.

---

## 11. Co je nejlepší udělat teď hned

1. Publikovat repozitář přes GitHub Desktop
2. Na serveru připravit Node.js 20+, MySQL/MariaDB, Nginx/Apache
3. Nastavit `backend/.env`
4. Nastavit `frontend/.env.production`
5. Udělat první build
6. Zapnout PM2
7. Otestovat `/api/health`, admin login a vytvoření rezervace

