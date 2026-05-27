# 🚀 Quick Reference - Multitenant iframe Nasazení

> Vše, co potřebujete vědět na jedné stránce

## 📋 Checklist Implementace

- ✅ Backend akceptuje `companyId` v POST /api/reservations
- ✅ Frontend automaticky detekuje `?companyId=X` z URL
- ✅ API automaticky posílá company ID v requestech
- ✅ Build prošel bez chyb
- ✅ Dokumentace je kompletní

## 🎯 3 Způsoby Vložení

### 1️⃣ Jednoduché (Pro 1 Company)

```html
<iframe 
  src="https://tvuj-server.cz/rezervace/?companyId=1" 
  width="100%" height="800" frameborder="0"
></iframe>
```

### 2️⃣ Dynamické (JavaScript)

```javascript
const companyId = 2; // Zjistěte z vašeho webu

const iframe = document.createElement('iframe');
iframe.src = `https://tvuj-server.cz/rezervace/?companyId=${companyId}`;
iframe.width = '100%';
iframe.height = '800';
iframe.frameborder = '0';

document.getElementById('container').appendChild(iframe);
```

### 3️⃣ Z HTML Atributu (Data Binding)

```html
<!-- V HTML -->
<div id="reservation" data-company-id="2"></div>

<!-- JavaScript -->
<script>
const container = document.getElementById('reservation');
const companyId = container.dataset.companyId;
container.innerHTML = `
  <iframe 
    src="https://tvuj-server.cz/rezervace/?companyId=${companyId}"
    ...
  ></iframe>
`;
</script>
```

## 🔍 Jak Ověřit, ŽE TO FUNGUJE?

### 1. Test Lokálně

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev

# Browser - Test URL
http://localhost:5173/?companyId=1
http://localhost:5173/?companyId=2

# Ověřit v Network tab
# POST /api/reservations by měl obsahovat "companyId": 1 (nebo 2)
```

### 2. Test Datové Izoláče

```bash
# Vytvořit reservaci pro company 1
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

# Vytvořit reservaci pro company 2
curl -X POST http://localhost:4000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": 1,
    "resourceId": 1,
    "date": "2026-05-20",
    "slotStarts": ["10:00:00"],
    "firstName": "Petr",
    "lastName": "Svoboda",
    "email": "petr@example.com",
    "companyId": 2
  }'

# V MySQL: SELECT * FROM reservations;
# Měli byste vidět 2 řádky s různými company_id
```

## 📊 Table Porovnání - Before vs After

| Aspekt | Před | Teď |
|--------|------|-----|
| **Company ID v DB** | Hardcoded = 1 | Dynamické z URL |
| **Multitenant** | ❌ Jen 1 company | ✅ N libovolných company |
| **URL Parametr** | Nepodporován | ✅ ?companyId=X |
| **API podpora** | Jen 1 company | ✅ Přijímá companyId |
| **Frontend detekce** | Žádná | ✅ Automatická z URL |
| **User dataisolace** | Společná | ✅ Per-company |

## 🔐 Bezpečnostní Poznámky

```javascript
// Backend - Vždy ověřit company ownership
if (req.admin.role !== "superadmin") {
  if (Number(req.admin.companyId) !== Number(userId.companyId)) {
    return res.status(403).json({ error: "Nemáte přístup" });
  }
}

// Frontend - Nelze ověřit na client-side (není bezpečné)
// Backend MUSÍ vždy ověřit company membership
```

## 🌐 Nasazení Scenáre

### Scénář 1: Jedna doména, Více Company

```
https://rezervace.cz/?companyId=1  → Klub Pincerna
https://rezervace.cz/?companyId=2  → Klub Vsetín
https://rezervace.cz/?companyId=3  → Klub Ostrava
```

### Scénář 2: Vlastní Subdomény

```
https://pincerna.rezervace.cz/     ← Měla by redirectovat na /?companyId=1
https://vsetin.rezervace.cz/       ← Měla by redirectovat na /?companyId=2
```

### Scénář 3: Vlastní Domény

```
https://rezervace.pincerna.cz/     ← Měla by redirectovat na app s companyId=1
https://rezervace.vsetin.cz/       ← Měla by redirectovat na app s companyId=2
```

## 📁 Soubory, Co se Změnily

| Soubor | Změna |
|--------|-------|
| `backend/src/app.js` | POST /api/reservations teď přijímá companyId |
| `frontend/src/api.js` | Detekuje company ID z URL, posílá v requestech |
| `MULTITENANT.md` | 📖 Nová - Kompletní dokumentace |
| `README.md` | ✏️ Updatováno - Nová sekce o multitenant |
| `frontend/public/multitenant-example.html` | 🆕 Nový - HTML příklad |

## 🎓 Příští Kroky

1. **Spustit frontend build**
   ```bash
   cd frontend && npm run build
   ```

2. **Testovat lokálně s různými company ID**
   ```
   http://localhost:5173/?companyId=1
   http://localhost:5173/?companyId=2
   ```

3. **Nasadit na produkci**
   ```bash
   # Kopírovat frontend/dist/ na web server
   # Backend běží s company ID supportem
   ```

4. **Vložit iframe na webs firem**
   ```html
   <iframe src="https://app.cz/?companyId=JEJICH_ID"></iframe>
   ```

## 💡 Pro Vývojáře

### Jak Detectovat Company ID v Komponentě?

```javascript
// App.jsx
import { api } from './api';

function MyComponent() {
  const companyId = api.getCompanyId();
  
  if (!companyId) {
    console.warn('Bez company ID - používám fallback (1)');
  }
  
  useEffect(() => {
    console.log('Pracuji s company #' + companyId);
  }, [companyId]);
  
  return <div>Company: {companyId || 'default (1)'}</div>;
}
```

### Jak Zjistit Company ID Backend-Side?

```javascript
// backend/src/app.js
app.post("/api/reservations", async (req, res) => {
  const companyId = req.body.companyId || req.query.companyId || 1;
  
  console.log(`Vytváření reservace pro company #${companyId}`);
  
  // ... rest of code
});
```

## 🐛 Debugging

```javascript
// V DevTools Console - Zkontroldit company ID
// (Pokud je aplikace načtená)

// Zjistit company ID z URL
new URLSearchParams(window.location.search).get('companyId')

// Zkontrollit Network requestů
// POST /api/reservations by měl obsahovat "companyId"
```

## 📞 Dokumentační Soubory

| Soubor | Obsah |
|--------|-------|
| `MULTITENANT.md` | 📖 Kompletní guide - 200+ řádků |
| `README.md` | Hlavní dokumentace - 250+ řádků |
| `EMBEDDING.md` | iframe nasazení |
| `SETUP.md` | Quick Start |
| `DEPLOYMENT-CHECKLIST.md` | Deployment guide |

---

**Status:** ✅ Aplikace je **PLNĚ MULTITENANT READY**

Můžete nyní vložit aplikaci na weby S jakékoliv firmy s jejich specifickým company ID!

