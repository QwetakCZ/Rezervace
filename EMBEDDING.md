# Vložení aplikace Rezervace jako iframe

Tato dokumentace popisuje, jak vložit rezervační systém jako iframe na libovolný web.

## Příklad základního vložení

```html
<iframe 
  src="https://tvuj-server.cz/rezervace/" 
  width="100%" 
  height="800"
  frameborder="0"
  title="Rezervační systém"
></iframe>
```

## Nastavení URL

Aplikace se nasazuje na jedné URL (např. `https://tvuj-server.cz/rezervace/`).

### Konfigurační proměnné

Pro správné fungování aplikace jak v development, tak v production, jsou důležité tyto environment proměnné:

#### Backend (.env)
```
PORT=4000
DATABASE_URL=mysql://user:password@host:3306/database
CORS_ORIGIN=https://tvuj-server.cz,https://www.tvuj-server.cz,http://localhost:5173
ADMIN_AUTH_SECRET=super-tajne-heslo-pro-jwt
ADMIN_TOKEN_TTL_SECONDS=43200
```

#### Frontend (.env)
```
VITE_API_URL=https://tvuj-server.cz/api
```

Pokud `VITE_API_URL` není definován, aplikace se pokusí automaticky najít API na:
1. Relativní cestě (stejný host)
2. `http://localhost:4000`
3. `http://127.0.0.1:4000`

## Build a nasazení

### Frontend build
```bash
cd frontend
npm install
npm run build
```

Build vytváří tyto soubory v `frontend/dist/`:
- `index.html` - Main HTML
- `index.js` - JavaScript bundle
- `index.css` - CSS stylesheet

### Servování static souborů

Frontend je standardní SPA aplikace. Nasaďte obsah `frontend/dist/` na svůj web server.

#### Apache
```apache
<Directory /var/www/rezervace>
  RewriteEngine On
  RewriteBase /rezervace/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . index.html [L]
</Directory>
```

#### Nginx
```nginx
location /rezervace/ {
  root /var/www;
  try_files $uri $uri/ /rezervace/index.html;
}
```

## CORS konfigurace

Backend aplikace vyžaduje CORS povolení pro komunikaci z iframe.

### Nastavení CORS_ORIGIN

Nastavte `CORS_ORIGIN` environment proměnnou obsahující všechny domény, ze kterých chcete přístup:

```bash
export CORS_ORIGIN="https://tvuj-server.cz,https://www.tvuj-server.cz,https://jiny-server.cz"
```

### Development s iframe

Pro testování v development módu nastavte:
```bash
export CORS_ORIGIN="http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
```

## Integrační příklady

### Jednoduchý příklad
```html
<!DOCTYPE html>
<html>
<head>
  <title>Moje webová stránka</title>
</head>
<body>
  <h1>Reservujte si čas</h1>
  
  <iframe 
    src="https://tvuj-server.cz/rezervace/" 
    width="100%" 
    height="800"
    frameborder="0"
    allowTransparency="true"
  ></iframe>
</body>
</html>
```

### Responsivní příklad
```html
<!DOCTYPE html>
<html>
<head>
  <title>Moje webová stránka</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    .reservation-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
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
    <h1>Rezervujte si čas</h1>
    <iframe 
      class="reservation-frame"
      src="https://tvuj-server.cz/rezervace/" 
      title="Rezervační systém"
    ></iframe>
  </div>
</body>
</html>
```

### Příklad s vlastní API URL

Pokud máte API na jiné doméně:

```bash
# Backend běží na
export VITE_API_URL="https://api.tvuj-server.cz"
```

Poté bude aplikace komunikovat s tímto API z iframe bez problémů.

## Sandbox atributy

Pokud chcete zvýšit bezpečnost, můžete nastavit sandbox atributy:

```html
<iframe 
  src="https://tvuj-server.cz/rezervace/" 
  width="100%" 
  height="800"
  frameborder="0"
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
></iframe>
```

**Pozor:** Budete muset povolit:
- `allow-same-origin` - Pro přístup k localStorage (admin funkce)
- `allow-scripts` - Pro React/JavaScript
- `allow-forms` - Pro formuláře
- `allow-popups` - Pro admin přihlášení

## Autentifikace v iframe

Rezervační systém automaticky uklady admin token do `localStorage`. V iframe kontextu to vyžaduje `allow-same-origin` sandbox atribut.

Veřejné rezervace (Step 1-4) fungují bez problémů vždy.

## Řešení běžných problémů

### "Failed to fetch" chyba
Zkontrolujte:
1. Je backend spuštěný?
2. Je správně nastavena `VITE_API_URL`?
3. Je server IP/doména v `CORS_ORIGIN`?

### API chyby v iframe
1. Ověřte, že frontend v `dist/` je správně servován
2. Zkontrolujte Network tab v DevTools
3. Verifyjte CORS headers v response

### Admin přihlášení nefunguje
1. Ověřte, že iframe má `allow-same-origin` atribut
2. Zkontrolujte, že token se ukládá do localStorage
3. Zkuste vymazat localStorage a přihlaste se znovu

## Performance optimalizace

### Caching

Servujte static soubory s dlouhým cache-control headerem:

```apache
<FilesMatch "^[^.]+\.(js|css)$">
  Header set Cache-Control "max-age=31536000"
</FilesMatch>

<FilesMatch "\.html$">
  Header set Cache-Control "max-age=0"
</FilesMatch>
```

### Komprese

Povolte gzip kompresi:

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

## Monitoring

Aplikace logguje chyby do:
- Frontend: Browser console
- Backend: `api/log/` složka

V production přeorientujte logy na centrální logging systém (ELK, Sentry, atd.)

## Support

Pro problémy nebo dotazy se obraťte na vývojový tým.

