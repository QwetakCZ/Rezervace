# Rezervace TT — Rezervační systém pro stolní tenis

Webová aplikace pro rezervaci stolů na stolní tenis. Podporuje multitenancy (více klubů), admin správu, hráčské účty a veřejnou rezervaci.

## Architektura

```
frontend/          React SPA (Vite)
deploy/            Produkční build + PHP API (nasazuje se na server)
  index.html       Statický React build
  index-*.js       JS bundle (hashovaný název)
  index-*.css      CSS bundle
  api/             PHP API (čisté PHP 8.x, bez frameworku)
    index.php      Hlavní router
    config.php     DB konfigurace (localhost)
    config.production.php  Produkční DB šablona
    db.php         PDO databáze (SSL pro vzdálené servery)
    auth.php       JWT autentizace (HMAC-SHA256)
    slots.php      Slotová logika
    routes/        API endpointy (public, player, admin, admin2)
backend/           Původní Node.js backend (nepoužívaný)
```

## Vývoj — localhost

**Požadavky:** Node.js 18+, PHP 8.0+, MySQL (XAMPP)

```powershell
# 1. Spustit XAMPP (Apache + MySQL)

# 2. React dev server
cd frontend
npm install
npm run dev
# → http://localhost:5173/
```

**Přihlášení:** `radek.vala@seznam.cz` / `admin123`
**Admin:** http://localhost:5173/admin

Dev server volá API na `http://localhost/Rezervace/deploy/api/` (XAMPP).

## Nasazení na server (Active24)

### 1. Build
```powershell
cd frontend
npm run build
```

### 2. Příprava deploy
```powershell
.\build-php.ps1
```

### 3. Konfigurace
Uprav `deploy/api/config.production.php`:
- `$DB_HOST` — DB host (např. `db.r4.active24.cz`)
- `$DB_NAME` — název databáze
- `$DB_USER` — DB uživatel
- `$DB_PASS` — DB heslo
- `$AUTH_SECRET` — náhodný řetězec (aspoň 32 znaků)

Na serveru přejmenuj: `config.production.php` → `config.php`

### 4. Upload (FTP)
Nahraj celou složku `deploy/` na server.

### 5. Databáze
V phpMyAdmin importuj `schema.sql`.

## API Endpointy

| Metoda | URL | Auth |
|--------|-----|------|
| GET | `/api/health` | — |
| GET | `/api/categories` | — |
| GET | `/api/availability?categoryId=1&date=YYYY-MM-DD` | — |
| POST | `/api/reservations` | — |
| POST | `/api/player/register` | — |
| POST | `/api/player/login` | — |
| GET | `/api/player/me` | Player |
| POST | `/api/admin/login` | — |
| GET | `/api/admin/me` | Admin |
| CRUD | `/api/admin/companies` | Admin |
| CRUD | `/api/admin/users` | Admin |
| CRUD | `/api/admin/categories` | Admin |
| CRUD | `/api/admin/resources` | Admin |
| CRUD | `/api/admin/pricing-windows` | Admin |
| GET/PATCH | `/api/admin/booking-settings` | Admin |
| GET | `/api/admin/reservations` | Admin |
| PATCH | `/api/admin/reservations/:id/approve` | Admin |
| PATCH | `/api/admin/reservations/:id/cancel` | Admin |

## Řešené problémy (Active24 / nginx)

| Problém | Řešení |
|---------|--------|
| nginx maže `Authorization` header | PHP hledá token v 5 zdrojích (včetně `?_token=` query parametru) |
| `detectApiBase()` vracel `/admin` | `VITE_API_URL=/` — API vždy od kořene |
| Cache starého JS v prohlížeči | Hash v názvech (`index-[hash].js`) |
| SPA routing (`/admin/dashboard`) | `<base href="/">` v `index.html` |
| PHP 8.5 deprecated konstanty | `Pdo\Mysql::ATTR_SSL_VERIFY_SERVER_CERT` s fallbackem |
| PHP output před JSON | `ob_start()` + `ob_end_clean()` |
| SSL pro Active24 DB | Automaticky pro vzdálené hosty |

## Server info
- **Hosting:** Active24 (OpenResty/nginx, PHP 8.5)
- **Doména:** `rezervace.tt-denik.cz`
- **DB:** `stolni_tenis_rezervace`
