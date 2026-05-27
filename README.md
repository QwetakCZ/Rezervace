# Rezervace - rekonstrukce (GitHub + localhost)

Repozitar obsahuje puvodni obnovene soubory i novou rekonstruovanou aplikaci:

- `dump_db.sql` - puvodni databazovy dump
- `backend/` - Node.js API nad stejnym DB modelem
- `frontend/` - React (Vite) klient
- `docker-compose.yml` - lokalni MySQL 8.0 s automatickym importem dumpu
- `api/`, `assets/`, `index.html` - puvodni obnovena varianta (ponechana beze zmen)

## GitHub a produkcni nasazeni

- `PRODUCTION-SERVER.md` - doporuceny postup pro GitHub Desktop, publikaci na GitHub a produkcni server
- `backend/.env.production.example` - produkcni sablona backend konfigurace
- `frontend/.env.production.example` - produkcni sablona frontend konfigurace
- `backend/ecosystem.config.cjs` - PM2 konfigurace pro backend proces

## Pozadavky

- Lokalni MySQL (port `3306`, databaze `stolni_tenis_rezervace`)
- Node.js 20+
- npm 10+

## 1) Priprav lokalni databazi

Pouzij lokalni MySQL bez Docker bridge; backend je nastaveny na `localhost:3306` a prihlaseni `root` bez hesla.

## 2) Spust backend API

```powershell
cd "C:\xampp\htdocs\Rezervace\backend"
Copy-Item .env.example .env
npm install
npm run dev
```

API bezi na `http://localhost:4000`.

Admin auth pouziva `ADMIN_AUTH_SECRET` (v produkci zmente na vlastni silnou hodnotu).

## 3) Spust frontend (React)

```powershell
cd "C:\xampp\htdocs\Rezervace\frontend"
Copy-Item .env.example .env
npm install
npm run dev
```

Frontend bezi na `http://localhost:5173`.

Admin vstup je na `http://localhost:5173/admin` (login), dashboard po prihlaseni na `http://localhost:5173/admin/dashboard`.

Pristup do dashboardu ma uzivatel s `role='admin'` nebo `role='superadmin'`. Jedna company muze mit vice admin uzivatelu (multitenant model pres `company_id`).

`superadmin` navic vidi a spravuje vsechny company i uzivatele napric systemem.

### Vytvoreni nebo zmena admin uzivatele

```powershell
cd "C:\xampp\htdocs\Rezervace\backend"
npm run admin:upsert -- --email=admin@pincarna.cz --password=SilneHeslo123 --companyId=1 --role=superadmin --firstName=Admin --lastName=Pincarna
```

## API endpointy (rekonstrukce)

- `GET /api/health`
- `GET /api/health/db`
- `GET /api/categories`
- `GET /api/resources?categoryId=1`
- `GET /api/availability?categoryId=1&date=2026-05-18`
- `POST /api/reservations`
- `POST /api/admin/login`
- `GET /api/admin/me`
- `GET /api/admin/companies`
- `POST /api/admin/companies`
- `PATCH /api/admin/companies/:id`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `GET /api/admin/reservations?status=confirmed&date=2026-05-18&limit=50`
- `PATCH /api/admin/reservations/:id/cancel`

Poznamka: `POST /api/reservations` se uklada transakcne (kontrola konfliktu + insert hlavicky + insert slotu), aby se omezily zavody pri soubehu.

### Priklad `POST /api/reservations`

```json
{
  "categoryId": 1,
  "resourceId": 1,
  "date": "2026-05-18",
  "slotStarts": ["12:00:00", "12:30:00"],
  "firstName": "Jan",
  "lastName": "Novak",
  "email": "jan.novak@example.com",
  "phone": "+420777123456",
  "note": "Prijdu o 10 minut drive"
}
```

## Rychly test backendu

```powershell
cd "C:\xampp\htdocs\Rezervace\backend"
npm test
```

## Lucide Ikony - Integrační Status ✅

Aplikace je již plně integrována s **Lucide React** ikonami:

### Instalované ikony

```bash
npm install lucide-react@^1.16.0
```

### Použitá místa

| Položka | Komponenta | Ikony |
|---------|-----------|-------|
| **Sidebar admin** | AdminDashboardPage | BarChart3, ClipboardList, Users, Package, DollarSign |
| **Hero sekce** | ReservationPage | Trophy |
| **Kategorie** | IconForCategory | Trophy, Cpu, Dumbbell |
| **Statistiky** | overviewStats | Calendar, DollarSign, TrendingUp, Users |
| **Navigace** | adminNav | Dynamicky podle item.Icon |
| **Ostatní** | App.jsx | Menu, LogOut, Settings, Home |

### Implementace

Ikony jsou importovány přímo v `frontend/src/App.jsx`:

```javascript
import {
  Trophy, Calendar, DollarSign, User, Users, BarChart3,
  ClipboardList, Package, TrendingUp, Cpu, Dumbbell,
  Menu, LogOut, Settings, Home
} from "lucide-react";
```

## iframe Nasazení a Vložení na Web 📱

Aplikace je připravena k nasazení jako **embeddovaná iframe** na libovolný web.

### Quick Start - Vložení

```html
<iframe 
  src="https://tvuj-server.cz/rezervace/" 
  width="100%" 
  height="800"
  frameborder="0"
></iframe>
```

### Kompletní dokumentace

Viz `EMBEDDING.md` pro:
- Detailní setup a konfiguraci
- CORS nastavení
- Environment proměnné
- Bezpečnost a sandbox atributy
- Řešení běžných problémů
- Performance optimalizace

### Build pro produkci

```powershell
cd "C:\xampp\htdocs\Rezervace\frontend"
npm run build
# Výstup: frontend/dist/ (nasadit na web server)
```

### Test vložení lokálně

```powershell
# 1. Backend běží na http://localhost:4000
# 2. Frontend dev běží na http://localhost:5173
# 3. Otevřete frontend/public/iframe-example.html v prohlížeči
```

## 🏢 Multitenant - Podpora Pro Více Company

Aplikace je **plně připravena** pro multitenant nasazení s podporou více firem.

### Jak to Funguje?

Každá firma se vloží iframe s vlastním **company ID**:

```html
<!-- Klub Pincerna - Company ID = 1 -->
<iframe src="https://tvuj-server.cz/rezervace/?companyId=1"></iframe>

<!-- Klub Vsetín - Company ID = 2 -->
<iframe src="https://tvuj-server.cz/rezervace/?companyId=2"></iframe>
```

### Co se Stane?

1. Frontend detekuje `?companyId=X` z URL automaticky
2. Posílá company ID ve všech API requestech
3. Backend filtruje data jen pro danou company
4. Uživatelé vidí jen data své firmy

### Příklad API Request

```bash
# Frontend automaticky pošle:
POST /api/reservations
{
  "categoryId": 1,
  "resourceId": 1,
  "date": "2026-05-20",
  "slotStarts": ["10:00:00"],
  "firstName": "Jan",
  "lastName": "Novak",
  "email": "jan@example.com",
  "companyId": 2  # ← Automaticky z URL parametru
}

# Backend vytvoří reservaci POUZE v company_id = 2
```

### Dynamická Detekce

```javascript
// Přístup na company ID v komponentách
import { api } from './api';

const companyId = api.getCompanyId(); // Vrátí číslo nebo null
```

### Fallback Chování

Pokud není `?companyId` v URL, aplikace defaultně používá `company_id = 1`:

```html
<!-- Ekvivalentní s ?companyId=1 -->
<iframe src="https://tvuj-server.cz/rezervace/"></iframe>
```

### Bezpečnost

- ✅ Server-side filtrování (data v DB)
- ✅ Admin vidí jen svou company (pokud není superadmin)  
- ✅ Uživatelé nemohou vidět data jiné company

### Kompletní Dokumentace

Viz `MULTITENANT.md` pro:
- Detailní příklady vložení
- Schéma databáze
- Testing script
- Nasazení multitenant
- Odpovědi na časté otázky

## CI (GitHub Actions)

Workflow je v `\.github/workflows/ci.yml` a na push/PR spousti:

- backend: `npm install` + `npm test`
- frontend: `npm install` + `npm run build`




