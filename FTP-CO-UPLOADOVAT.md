# === SHRNUTÍ: CO DAT PŘES FTP ===

## 1️⃣ Frontend (co uploaduješ přes FTP)

Z `C:\xampp\htdocs\Rezervace\frontend\dist\` uploaduješ **všechno** do `public_html/sub/rezervace/`:

```
frontend/dist/              →  public_html/sub/rezervace/
├── index.html            →  index.html
├── index.js              →  index.js
├── index.css             →  index.css
├── vite.svg              →  vite.svg
└── (ostatní soubory)     →  (ostatní soubory)
```

**Plus:**
- `.htaccess` (nový soubor — obsah z `APACHE-HTACCESS.txt`)

Skrze všechny soubory nahraješ jako:
```
ftp://tvoje-active24-url.cz/public_html/sub/rezervace/
```

---

## 2️⃣ Backend (.env — NEUPLOADUJEŠ!)

**Soubor `.env` NEUPLOADUJEŠ** přes FTP (obsahuje hesla).

Na serveru si ho vytvoříš:

### Pokud máš SSH
```bash
ssh user@tt-denik.cz
cd /home/user/backend  # nebo kdekoli je backend
nano .env
```

Pak zkopíruješ obsah z `C:\xampp\htdocs\Rezervace\backend\.env.production.tt-denik` **a upravíš**:
- `DATABASE_URL` — tvoje MySQL credentials
- `ADMIN_AUTH_SECRET` — silné heslo

### Pokud máš jen FTP
1. Uploaduješ jenSourceCode backendu (src/, package.json apod.)
2. Server admina prosíš, aby ti na serveru spustil:
   ```bash
   cp .env.production.example .env
   npm install
   npm start
   ```

---

## 3️⃣ Databáze (MySQL)

Vytvoříš v cPanelu na Active24:

1. **MySQL Databases**: vytvoř databázi `stolni_tenis_rezervace`
2. **MySQL Uživatelé**: vytvoř uživatele `rezervace_user` s heslem
3. **Udělení práv**: dej mu práva na `stolni_tenis_rezervace.*`
4. **phpMyAdmin**: importuj `dump_db.sql` z repozitáře

---

## 🎯 FTP CHECKLIST

```
PŘED PRVNÍM UPLOADEM:

Doma:
  [ ] npm run build (frontend)
  [ ] frontend/dist/ existuje a má 3 soubory (index.html, index.js, index.css)
  [ ] .htaccess jsem si připravil (přepíšu text z APACHE-HTACCESS.txt)

Na Active24:
  [ ] Vytvořil jsem databázi "stolni_tenis_rezervace"
  [ ] Vytvořil jsem uživatele "rezervace_user" s heslem
  [ ] Importoval jsem dump_db.sql (v phpMyAdmin)

FTP Upload:
  [ ] Připojil jsem se na FTP (Filezilla, WinSCP)
  [ ] Posoutval jsem do public_html/sub/
  [ ] Vytvořil jsem složku "rezervace" (pokud neexistuje)
  [ ] Uploadovalem všechny soubory z frontend/dist/ do sub/rezervace/
  [ ] Uploadoval jsem .htaccess do sub/rezervace/
  [ ] Ověřil jsem, že si tam jsou všechny soubory

Testování:
  [ ] https://rezervace.tt-denik.cz se načte bez chyby
  [ ] Vidím "Nastavení klubu" a ostatní texty česky
  [ ] Kliknutí na kategorii je funkční (bez JS erroru v konzoli)

Backend:
  Buď:
    [ ] SSH a spustil jsem "npm start" v backend adresáři
    Nebo:
    [ ] Pronajal jsem si Node.js hosting a nastavil CORS_ORIGIN
```

---

## 📋 SOUBORY K REFERENCIAS

V repozitáři máš připraveno:

- **`ACTIVE24-NASAZENI-POSTUP.md`** — Detailní postup (přečti!)
- **`ACTIVE24-FTP-CHECKLIST.md`** — FTP + databáze setup
- **`ACTIVE24-SETUP.md`** — Apache konfigurace
- **`APACHE-HTACCESS.txt`** — Obsah .htaccess souboru
- **`ACTIVE24-MySQL-SETUP.sql`** — SQL pro vytvoření DB/uživatele
- **`backend/.env.production.tt-denik`** — Template pro backend .env
- **`frontend/.env.production.tt-denik`** — Template pro frontend .env

---

## 🚀 PRÁVĚ TEĎKA

1. Edituj si `.env` soubory:
   - `backend/.env.production.tt-denik`
   - `frontend/.env.production.tt-denik`

2. Postup dál:
   ```bash
   cd C:\xampp\htdocs\Rezervace\frontend
   npm run build
   ```

3. Po buildu je obsah `frontend/dist/` připravený k uploadu přes FTP.

---

## ❓ CO SI VYJASNIT

Abych ti dal úplně konkrétníript pro DB:

- [ ] Jaké budeš používat MySQL credentials? (`user`, `password`, `host`)
- [ ] Máš SSH přístup na Active24 nebo jen FTP?
- [ ] Jaké silné heslo si zvolíš pro `ADMIN_AUTH_SECRET`?

Na základě těchto informací ti připravím finální skripty a si je jen musíš spustit.

---

**Co máš teď**:

✅ Frontend připravený k buildu  
✅ Backend připravený k nasazení  
✅ MySQL setup  
✅ Apache config  
✅ FTP návod  

Jakmile si připravíš prostředí na Active24 (DB, SSH pokud chceš), řekni mi a dám ti přesné spouštěcí skripty.



