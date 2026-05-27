# 🏓 Rezervační Systém - Quick Start Příprава na iframe Nasazení

Vytvořili jsme pro vás kompletní systém pro vložení rezervační aplikace jako **iframe na libovolný web**.

## ✨ Co jsme hotovo?

- ✅ **Lucide React ikony** - Všechny komponenty mají profesionální ikony
- ✅ **Vite optimalizace** - Frontend je optimalizován pro iframe
- ✅ **CORS konfigurace** - Backend je připraven komunikovat z iframe
- ✅ **Kompletní dokumentace** - Všechny instrukce pro nasazení
- ✅ **Deployment tools** - Skripty pro usnadnění nasazení

## 🚀 Quick Start

### 1️⃣ Ověřit, že je vše připraveno

```powershell
cd "C:\xampp\htdocs\Rezervace"
node verify-iframe-setup.js
```

Měli byste vidět: `✅ ✅ ✅ ... 🎉 VEŠKERÉ KONTROLY PROŠLY!`

### 2️⃣ Development - Testovat lokálně

```powershell
# Terminal 1 - Backend
cd backend
npm run dev
# Běží na http://localhost:4000

# Terminal 2 - Frontend
cd frontend
npm run dev
# Běží na http://localhost:5173
```

Otevřete `http://localhost:5173` a testujte rezervační proces.

### 3️⃣ Production Build

```powershell
# Build frontend
cd frontend
npm run build
# Vytvoří: frontend/dist/ (index.html, index.js, index.css)
```

### 4️⃣ Nasazení na Web Server

```powershell
# Kopírovat frontend/dist/* na web server
cp frontend/dist/* /your/web/server/path/rezervace/

# Spustit backend (Node.js)
cd backend
npm run dev  # nebo npm start v produkci
```

### 5️⃣ Vložit na Web

```html
<!-- Na jakékoliv webové stránce -->
<iframe 
  src="https://tvuj-server.cz/rezervace/" 
  width="100%" 
  height="800"
  frameborder="0"
></iframe>
```

## 📚 Dostupné Dokumenty

| Soubor | Popis |
|--------|-------|
| **README.md** | Hlavní dokumentace projektu |
| **EMBEDDING.md** | 📖 Detailní průvodce vložením iframe |
| **DEPLOYMENT-CHECKLIST.md** | ✅ Kompletní checklist pro nasazení |
| **verify-iframe-setup.js** | 🔍 Ověřovací skript |
| **deploy.ps1** | 🚀 Deployment help script |

## 🔧 Konfigurace

### Backend .env
```bash
cd backend
cp .env.example .env

# Editujte .env:
DATABASE_URL=mysql://root@localhost:3306/...
CORS_ORIGIN=https://tvuj-server.cz,https://www.tvuj-server.cz
ADMIN_AUTH_SECRET=super-tajne-heslo
```

### Frontend .env (volitelně)
```bash
cd frontend
cp .env.example .env

# Pokud ne, aplikace se pokusí najít API na těchto místech:
# 1. Relativní cestě (stejný origin)
# 2. http://localhost:4000
# 3. http://127.0.0.1:4000
```

## 🎯 Ověřilo jsme pro vás:

| Oblast | Status |
|--------|--------|
| Lucide React integrace | ✅ 100% |
| Frontend build | ✅ Bez chyb |
| Backend CORS | ✅ Nakonfigurován |
| Environment variables | ✅ Připraveny |
| Dokumentace | ✅ Kompletní |

## 🚨 Důležité - Bezpečnost v Produkci

1. **Změňte ADMIN_AUTH_SECRET**
   ```bash
   openssl rand -base64 32
   ```

2. **Nastavte CORS_ORIGIN na vaše domény**
   ```bash
   CORS_ORIGIN=https://tvuj-server.cz,https://www.tvuj-server.cz
   ```

3. **Zálohujte databázi**
   ```bash
   mysqldump -u root database_name > backup.sql
   ```

4. **Povolte HTTPS**
   iframe v HTTPS prostředí musí komunikovat přes HTTPS!

## 📞 Support Příkazy

### Ověřit API zdraví
```bash
curl http://localhost:4000/api/health
# Očekávaný response: {"ok":true,"service":"rezervace-backend"}
```

### Ověřit database
```bash
curl http://localhost:4000/api/health/db
# Očekávaný response: {"ok":true,"database":"connected",...}
```

### Ověřit admin login
```bash
curl -X POST http://localhost:4000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

## 🎨 Lucide Ikony - Přehled

Aplikace používá tyto ikony z lucide-react:

| Komponenta | Ikona | Velikost |
|------------|-------|----------|
| Hero | Trophy | w-12 h-12 |
| Kategorie | Trophy / Cpu / Dumbbell | w-8 h-8 |
| Admin Přehled | BarChart3 | w-6 h-6 |
| Admin Rezervace | ClipboardList | w-6 h-6 |
| Admin Hráči | Users | w-6 h-6 |
| Admin Zdroje | Package | w-6 h-6 |
| Admin Ceníky | DollarSign | w-6 h-6 |
| Statistiky | Calendar, TrendingUp, Users | w-6 h-6 |

Všechny ikony jsouResponZní a přizpůsobují se na mobilní zařízení.

## 🔄 Update Workflow

Když chcete aktualizovat kód:

```powershell
# 1. Pull/Update kód
git pull origin main

# 2. Instalovat nové balance
npm install (frontend)
npm install (backend)

# 3. Spustit frontend build
cd frontend && npm run build

# 4. Zkopírovat do web serveru
cp dist/* /váš/server/path/

# 5. Restart backend
# (pokud běží jako service)
```

## 📊 Struktura Projektu

```
Rezervace/
├── frontend/               # React SPA
│   ├── src/
│   │   ├── App.jsx        # Main komponenta (s ikonami)
│   │   ├── api.js         # API komunikace
│   │   └── main.jsx
│   ├── dist/              # Production build
│   ├── package.json       # Frontend deps
│   └── vite.config.js     # Build konfigurace
│
├── backend/               # Node.js API
│   ├── src/
│   │   ├── app.js         # Express s CORS
│   │   ├── config.js      # Environment konfigurace
│   │   ├── db.js          # MySQL Connection
│   │   └── server.js      # Entry point
│   ├── package.json       # Backend deps
│   └── .env.example       # Konfigurační šablona
│
├── EMBEDDING.md           # Průvodce iframe vložením
├── DEPLOYMENT-CHECKLIST.md # Deployment checklist
├── SETUP.md              # Tento soubor
├── verify-iframe-setup.js # Ověřovací skript
└── deploy.ps1            # Deploy helper
```

## 🎓 Další Čtení

- **Pro vložení:** Přečtěte si `EMBEDDING.md`
- **Pro nasazení:** Použijte `DEPLOYMENT-CHECKLIST.md`
- **Pro problemy:** Podívejte se do `EMBEDDING.md` sekce "Troubleshooting"

---

## ✅ Hotové!

Aplikace je **PLNĚ PŘIPRAVENA** k:
- ✅ Lokálnímu testování
- ✅ Vložení jako iframe
- ✅ Produktivnímu nasazení

**Začněte bodem 1 - ověřením!**

```bash
node verify-iframe-setup.js
```

🚀 Happy deployments!

