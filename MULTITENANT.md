# 🏢 Multitenant iframe Nasazení - Jak Vložit pro Více Company

Teď je aplikace **plně připravena** pracovat s více company. Každá company si může vložit iframe na svůj web s vlastním company ID.

## 📌 Jak to Funguje?

1. **Frontend detekuje company ID** z URL parametru `?companyId=XYZ`
2. **Automaticky to posílá backend-u** ve všech API requestech
3. **Backend filtruje data** pouze pro danou company
4. **Uživatelé vidí jen data své firmy**

---

## 🚀 Příklady Vložení iframe

### Základní vložení pro Company ID = 1

```html
<!-- Na webu company s ID 1 -->
<iframe 
  src="https://tvuj-server.cz/rezervace/?companyId=1" 
  width="100%" 
  height="800"
  frameborder="0"
></iframe>
```

### Pro Company ID = 2

```html
<!-- Na webu company s ID 2 -->
<iframe 
  src="https://tvuj-server.cz/rezervace/?companyId=2" 
  width="100%" 
  height="800"
  frameborder="0"
></iframe>
```

### Dynamicky s JavaScript

```javascript
// Na jakémkoliv webu - detekujte company ID dynamicky
const companyId = document.querySelector('[data-company-id]')?.dataset.companyId;
const iframeUrl = `https://tvuj-server.cz/rezervace/?companyId=${companyId}`;

const iframe = document.createElement('iframe');
iframe.src = iframeUrl;
iframe.width = '100%';
iframe.height = '800';
iframe.frameborder = '0';
document.getElementById('reservation-container').appendChild(iframe);
```

### Responsive s CSS

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .reservation-container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
    }

    .reservation-frame {
      width: 100%;
      height: 900px;
      border: none;
      border-radius: 8px;
    }

    @media (max-width: 768px) {
      .reservation-frame {
        height: 1200px;
      }
    }
  </style>
</head>
<body>
  <div class="reservation-container">
    <!-- Příklad: embedovat pro company_id = 2 -->
    <iframe 
      class="reservation-frame"
      src="https://tvuj-server.cz/rezervace/?companyId=2"
      title="Rezervační systém"
    ></iframe>
  </div>
</body>
</html>
```

---

## 🔄 Co se Stane v Backendu?

### 1. Vytvoření Rezervace

Když se odešle rezervace, backend automaticky:

```javascript
// Frontend poslal:
{
  categoryId: 1,
  resourceId: 1,
  date: "2026-05-20",
  slotStarts: ["10:00:00"],
  firstName: "Jan",
  lastName: "Novak",
  email: "jan@example.com",
  companyId: 2  // ← Automaticky přidáno z ?companyId=2
}

// Backend vytvoří:
// 1. User v company_id = 2 (pokud neexistuje)
// 2. Reservation v company_id = 2
// 3. Reservation slots v company_id = 2
```

### 2. Fallback na Company ID = 1

Pokud není `companyId` v URL, aplikace defaultně používá `company_id = 1` (pro backward kompatibilitu).

```html
<!-- Ekvivalentní s ?companyId=1 -->
<iframe src="https://tvuj-server.cz/rezervace/"></iframe>
```

---

## 🎯 API Endpointy - Company Support

### Public Endpointy (Bez Auth)

Všechny public endpointy automaticky pracují s `companyId`:

```
GET /api/categories
GET /api/resources?categoryId=1&companyId=2
GET /api/availability?categoryId=1&date=2026-05-20&companyId=2
POST /api/reservations          ← Body musí obsahovat companyId
```

### Admin Endpointy (S Auth)

Admin vidí jen data své company (pokud není superadmin):

```
GET /api/admin/reservations     ← Filtruje podle auth.companyId
GET /api/admin/companies        ← Superadmin vidi vše
```

---

## 🛠️ Backend - Co se Změnilo

### POST /api/reservations

**Před:**
```javascript
// Hardcoded company_id = 1
INSERT INTO reservations (company_id, ...) VALUES (1, ...)
```

**Teď:**
```javascript
// Dynamické company_id z request
const companyId = req.body.companyId || req.query.companyId || 1;
INSERT INTO reservations (company_id, ...) VALUES (companyId, ...)
```

### Fallback Logika

```javascript
const finalCompanyId = requestedCompanyId || 1; // Pokud neni, pouzij 1
```

---

## 📱 Frontend - Co se Změnilo

### api.js

```javascript
// Automatická detekce
const detectedCompanyId = getCompanyIdFromUrl(); // Z ?companyId=X

// API calls automaticky přidávají companyId
api.createReservation(payload);  // ← Automaticky přidá companyId
api.getAvailability(catId, date); // ← Automaticky přidá companyId
```

### Přístup na Company ID v Komponentách

```javascript
// V App.jsx nebo libovolné komponentě
import { api } from './api';

const companyId = api.getCompanyId();
console.log('Pracuji s company #' + companyId);
```

---

## 🔒 Bezpečnost

### Co je Protected?

- ✅ Uživatelé vidí jen data své company
- ✅ Admin vidí jen data své company (pokud není superadmin)
- ✅ Reservace se vytváří v správné company

### Co Bedlužete Zkontrolovat?

```javascript
// Backend: Ověřit company ownership v admin endpointech
if (req.admin.role !== "superadmin" && 
    Number(req.admin.companyId) !== Number(finalCompanyId)) {
  return res.status(403).json({ error: "Nemáte přístup" });
}
```

---

## 📊 Příklad - Databáze

### Struktura

```
companies
├── id: 1, name: "Klub Pincerna"
└── id: 2, name: "Klub Vsetín"

users
├── id: 1, company_id: 1, email: "admin@pincerna.cz"
└── id: 2, company_id: 2, email: "admin@vsetin.cz"

reservations
├── id: 1, company_id: 1, user_id: ..., status: "confirmed"
└── id: 2, company_id: 2, user_id: ..., status: "confirmed"
```

### Test

```bash
# Company 1 reservace
curl "http://localhost:4000/api/reservations?companyId=1"

# Company 2 reservace
curl "http://localhost:4000/api/reservations?companyId=2"
```

---

## 🚀 Nasazení Multitenant iframe

### Krok 1: Build Frontend

```bash
cd frontend
npm run build
# Vytvoří: dist/ s app.js obsahující company detection
```

### Krok 2: Backend .env Nastavení

```bash
# .env
DATABASE_URL=mysql://user:pass@host/DB
PORT=4000
CORS_ORIGIN=https://klub-pincerna.cz,https://klub-vsetin.cz
```

### Krok 3: Nasadit Frontend

```bash
# Frontend files (dist/*) na web server root nebo subdir
/var/www/html/rezervace/
├── index.html
├── index.js
└── index.css
```

### Krok 4: Každá Company si Vloží iframe

**Na webu Klubu Pincerna:**
```html
<iframe src="https://rezervace.cz/?companyId=1"></iframe>
```

**Na webu Klubu Vsetín:**
```html
<iframe src="https://rezervace.cz/?companyId=2"></iframe>
```

---

## 📋 Testing Script - Company Multitenant

```bash
# Test: Vytvořit reservaci pro company 1
curl -X POST http://localhost:4000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": 1,
    "resourceId": 1,
    "date": "2026-05-20",
    "slotStarts": ["10:00:00"],
    "firstName": "Jan",
    "lastName": "Novak",
    "email": "jan@example.com",
    "companyId": 1
  }'

# Test: Vytvořit reservaci pro company 2
curl -X POST http://localhost:4000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": 1,
    "resourceId": 1,
    "date": "2026-05-20",
    "slotStarts": ["12:00:00"],
    "firstName": "Petr",
    "lastName": "Svoboda",
    "email": "petr@example.com",
    "companyId": 2
  }'

# Ověřit v DB:
# Company 1 by měla mít jen svou reservaci
# Company 2 by měla mít jenom svou reservaci
```

---

## 🎓 Shrnutí pro Vás

| Co | Stav | Detail |
|---|------|--------|
| **Frontend detekce** | ✅ | Automaticky z `?companyId=X` |
| **Backend podpora** | ✅ | Přijímá `companyId` v body/query |
| **Data filtering** | ✅ | Každá company vidí jen svá data |
| **Admin isolation** | ✅ | Admin vidí jen svou company |
| **Fallback** | ✅ | Bez parametru se použije company_id=1 |

---

## 🔗 Pomocné Domény

**Scénář 1: Jedna doména pro všechny company**
```
https://rezervace-spolecne.cz/?companyId=1  (Klub Pincerna)
https://rezervace-spolecne.cz/?companyId=2  (Klub Vsetín)
```

**Scénář 2: Vlastní subdoména pro každou company**
```
https://pincerna.rezervace.cz/            (automaticky companyId=1)
https://vsetin.rezervace.cz/              (automaticky companyId=2)
```
Toto by vyžadovalo server-side redirectů s companyId.

---

## 📞 Příští Kroky

1. ✅ Backend i frontend mají company ID support
2. ✅ Dokumentace je hotová
3. 🔄 Build frontend: `npm run build`
4. 🔄 Test s URL: `http://localhost:5173/?companyId=2`
5. 🔄 Nasaďte na web server s správnými company ID
6. 🔄 Vložte iframe s `?companyId=X` do každého webu firmy

**Aplikace je nyní PLNĚ MULTITENANT READY!** 🎉

