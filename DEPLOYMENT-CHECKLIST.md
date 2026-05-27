# Checklist: Příprava Rezervační Aplikace pro iframe Nasazení

## ✅ Hotovo - Integrační Úkoly

### Lucide Ikony
- [x] Nainstalovat `lucide-react@^1.16.0`
- [x] Importovat ikony do App.jsx
- [x] Ikony v hero sekci (Trophy)
- [x] Ikony v kategoriích (Trophy, Cpu, Dumbbell)
- [x] Ikony v admin sidebaru (BarChart3, ClipboardList, Users, Package, DollarSign, Menu, LogOut, Settings)
- [x] Ikony v statistických kartách (Calendar, DollarSign, TrendingUp, Users)
- [x] Všechny komponenty používají `className="w-8 h-8"` nebo `className="w-6 h-6"` pro rozměry
- [x] Verifikace build bez chyb

### Frontend Build
- [x] Vite konfigurace optimalizována pro iframe
  - [x] Vypnutý hash v názvech souborů (`entryFileNames`, `chunkFileNames`, `assetFileNames`)
  - [x] CORS povolení v dev server
- [x] Production build vytvářen bez chyb
  - [x] `dist/index.html` (0.38 kB)
  - [x] `dist/index.css` (13.38 kB)
  - [x] `dist/index.js` (181.60 kB)
- [x] Frontend je SPA - funguje s router na root path

### Backend Konfigurace
- [x] CORS je správně nastaven (`cors` middleware)
- [x] CORS_ORIGIN je konfigurovatelný přes environment proměnné
- [x] API automaticky se pokouší komunikovat přes relativní cestu
- [x] API fallback mechanismus pro localhost (4000 port)

### Dokumentace
- [x] EMBEDDING.md - Kompletní průvodka vložením jako iframe
- [x] EMBEDDING.md - CORS konfigurace
- [x] EMBEDDING.md - Environment proměnné
- [x] EMBEDDING.md - Příklady HTML
- [x] EMBEDDING.md - Troubleshooting
- [x] README.md - Aktualizován o integraci ikon a iframe
- [x] .env.example oba (frontend i backend) - Aktualizovány s dokumentací
- [x] iframe-example.html - Příklad HTML pro testování

---

## 📋 Ověření Funkcionalit

### Ověřte Lokálně (Pre-nasazení Check)

```powershell
# 1. Start backend
cd C:\xampp\htdocs\Rezervace\backend
npm install
npm run dev
# Backend běží na http://localhost:4000

# 2. Start frontend (dev)
cd C:\xampp\htdocs\Rezervace\frontend
npm install
npm run dev
# Frontend běží na http://localhost:5173
```

### Testy
- [ ] Stránka načte bez chyb (Console bez error)
- [ ] Rezervace funguje (Step 1-4)
- [ ] Admin login funguje (localhost:5173/admin)
- [ ] Admin dashboard vidí data
- [ ] Network tab: API requesty jsou úspěšné (200, 201, 204)

### Build Test
```powershell
cd C:\xampp\htdocs\Rezervace\frontend
npm run build
# Ověřit: frontend/dist/ existuje a je < 200 KB
```

---

## 🚀 Nasazení na Produkci - Checklist

### 1. Infrastruktura
- [ ] Web server (Apache, Nginx, IIS)
- [ ] MySQL databáze
- [ ] Node.js runtime pro backend
- [ ] HTTPS certificate
- [ ] Static file serving (frontend/dist/)

### 2. Backend Setup
- [ ] `cp .env.example .env`
- [ ] Nastavit `DATABASE_URL` na produkční DB
- [ ] Nastavit `CORS_ORIGIN` na všechny vaše domény
- [ ] Nastavit `ADMIN_AUTH_SECRET` na silné náhodné heslo
- [ ] `npm install`
- [ ] Spustit jako daemon/service (PM2, systemd, atd.)
- [ ] Ověřit `GET http://server:4000/api/health` vrací `{"ok": true}`

### 3. Frontend Setup
- [ ] `npm run build`
- [ ] Obsah `dist/` nasadit na web server root nebo subdir
- [ ] Ověřit `.env` (nebo vynechat pro výchozí chování relativní cesty)
- [ ] Web server nakonfigurovat pro SPA (rewrite na index.html)

### 4. Web Server Konfigurace

#### Apache
```apache
<Directory /var/www/rezervace>
  RewriteEngine On
  RewriteBase /rezervace/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . index.html [L]
  
  Header set Cache-Control "max-age=0" env=REDIRECT_STATUS
  Header set Cache-Control "max-age=31536000" "expr=%{REQUEST_URI} =~ /\.(js|css)$/"
</Directory>
```

#### Nginx
```nginx
location /rezervace/ {
  root /var/www;
  try_files $uri $uri/ /rezervace/index.html;
  
  # Cache static assets
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
  
  # No cache for HTML
  location ~* \.html$ {
    expires -1;
    add_header Cache-Control "public, must-revalidate";
  }
}
```

### 5. Bezpečnost
- [ ] HTTPS povinný
- [ ] CORS_ORIGIN ověřit pro všechny domény
- [ ] Admin token secret je strong password (> 32 chars)
- [ ] Database backup je nastavený
- [ ] Monitoring/logging je nakonfigurký
- [ ] Firewall na backend portu (4000) - přístup jen z web serveru

### 6. Testování
- [ ] Ověřit iframe vložení funguje
- [ ] Ověřit CORS headery v response
- [ ] Ověřit admin login funguje
- [ ] Ověřit rezervační process
- [ ] Ověřit localStorage pro admin token

### 7. Monitoring
- [ ] Backend logs jsou dostupné (api/log/)
- [ ] Frontend errors jsou logované
- [ ] Databáze backup je nastavený
- [ ] Health check endpoint monitored

---

## 🐛 Troubleshooting

### Frontend se nenačte
1. Ověřte, že `index.html` je servován z `dist/`
2. Zkontrolujte, že SPA rewrite je nakonfigurován (všechny requesty → index.html)
3. Zkontrolujte browser console pro chyby

### API Chyby
1. Ověřte backend běží (`curl http://localhost:4000/api/health`)
2. Ověřte CORS_ORIGIN obsahuje vaši doménu
3. Zkontrolujte Network tab: jsou CORS headery v response?
4. Ověřte firewall povolí komunikaci

### Admin login nefunguje
1. Ověřte `/api/admin/login` endpoint vrací token
2. Ověřte iframe má `allow-same-origin` atribut
3. Zkontrolujte localStorage pro token

---

## 📦 Finální Delivery

Při nasazení budete potřebovat:

- `frontend/dist/` - Všechny soubory (index.html, index.js, index.css, atd.)
- `backend/` - Zdrojový kód a package.json
- `.env` - Backend konfigurační soubor (NEDODÁVEJTE v repo!)
- databázi `stolni_tenis_rezervace` s schematem

### Struktura Nasazení
```
/var/www/html/
├── index.html              (z frontend/dist/)
├── index.js                (z frontend/dist/)
├── index.css               (z frontend/dist/)
└── backend/                (Node.js API)
    ├── src/
    ├── package.json
    └── .env                (produkční konfigurace)
```

---

## 🟢 Status: PŘIPRAVENO NA NASAZENÍ

Všechny integrace Lucide ikon a iframe konfigurace je **HOTOVO**. 

Aplikace je připravena k:
- ✅ Vložení jako iframe na libovolný web
- ✅ Nasazení na produkční server
- ✅ Konfiguraci s environment proměnnými
- ✅ Spuštění multitenant režimu (company_id)

Zkontrolujte body v "Nasazení na Produkci" sekci před go-live.

