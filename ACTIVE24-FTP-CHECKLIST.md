# === Co uploadovat přes FTP na Active24 ===

## Struktura na serveru

```
public_html/
├── sub/
│   └── rezervace/                  ← Sem uploaduješ FRONTEND
│       ├── index.html
│       ├── index.js
│       ├── index.css
│       └── .htaccess
```

## Kroki

### 1. Frontend build

Nejdřív doma buildiš frontend:

```bash
cd C:\xampp\htdocs\Rezervace\frontend
npm run build
```

Vytvoří se složka `frontend/dist/` obsahující:
- `index.html`
- `index.js`
- `index.css`
- další assets

### 2. FTP upload - Co uploadovat

Via FTP uploaduješ obsah `dist/` folderu:

```
public_html/sub/rezervace/
├── index.html                 ← z dist/index.html
├── index.js                   ← z dist/index.js
├── index.css                  ← z dist/index.css
├── .htaccess                  ← nový soubor (viz níž)
└── vite.svg                   ← pokud tam je v dist/
```

#### Konkrétně přes FTP:
1. Otevřeš FTP klienta (Filezilla, WinSCP apod.)
2. Připojíš se na Active24
3. Jdeš do `public_html/sub/`
4. Vytvoříš složku `rezervace` (pokud neexistuje)
5. Uploaduješ všechny soubory z `C:\xampp\htdocs\Rezervace\frontend\dist\` do `sub/rezervace/`

#### .htaccess soubor
Vytvoříš nový textový soubor `.htaccess` s tímto obsahem:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . index.html [L]
  
  Header set Cache-Control "max-age=31536000" "expr=%{REQUEST_URI} =~ /\.(js|css)$/"
  Header set Cache-Control "max-age=0" "expr=%{REQUEST_URI} =~ /\.html$/"
</IfModule>
```

Tento soubor uploaduješ taky do `sub/rezervace/`.

### 3. Backend

Backend máš dvě možnosti:

#### Varianta A: Node.js přes SSH/shell

Pokud máš na Active24 SSH přístup:

```bash
cd ~/
git clone https://github.com/your-user/rezervace.git
cd rezervace/backend
cp .env.production.example .env
npm install
npm start
```

#### Varianta B: Pronajmout si Node.js hosting

Pokud Active24 nemá Node.js, pronajmi si samostatný:
- Heroku
- Railway.app
- Render
- Fly.io

Pak v komunitě Active24 spustíš frontend a propojíš to na externí Node.js backend.

---

## FTP Checklist v pořadí

- [ ] Buildiš frontend: `npm run build`
- [ ] Otevřeš FTP
- [ ] Vytvoříš složku `public_html/sub/rezervace/` (pokud neexistuje)
- [ ] Uploaduješ `frontend/dist/index.html` (a všechny ostatní soubory z dist/)
- [ ] Uploaduješ `.htaccess` soubor (viz výše)
- [ ] Otestuješ přístup na `https://rezervace.tt-denik.cz`
- [ ] Buď:
  - Setupuješ backend na Active24 (SSH) nebo
  - Pronajímaš si Node.js hosting a propojíš se přes `CORS_ORIGIN`

---

## Otestování

Po uploadu zkusíš:

```bash
curl https://rezervace.tt-denik.cz
```

Měl by vrátit HTML obsah (`index.html`).

---

## Databáze

Pro databázi si vytoříš MySQL na Active24 (cPanel → MySQL databases):

- databáze: `rezervace_db`
- uživatel: `rezervace_user`
- heslo: *tvoje volba*
- host: `localhost` nebo `127.0.0.1`

Pak dluji SQL script pro import schématu — dej vědět a připravím ho.

