# === Konfigurace pro Apache na Active24 ===

## Struktura na Active24

```
public_html/
├── sub/
│   └── rezervace/              ← Frontend (dist/)
│       ├── index.html
│       ├── index.js
│       ├── index.css
│       ├── .htaccess          ← Pro SPA rewrite
│       └── api/               ← Reverse proxy → Node.js backend
│
└── backend/                    ← Backend (mimo veřejný kořen)
    ├── src/
    ├── package.json
    └── .env                    ← Produkční konfigurace (LOCAL, ne v FTP!)
```

## Apache VirtualHost / konfigurace

Pokud ovládáš Apache config na Active24, nastav:

```apache
<VirtualHost *:443>
    ServerName rezervace.tt-denik.cz
    ServerAlias www.rezervace.tt-denik.cz
    
    DocumentRoot /home/your-user/public_html/sub/rezervace

    # SSL (pokud ještě není nastaven)
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
    
    <Directory /home/your-user/public_html/sub/rezervace>
        AllowOverride All
        Require all granted
    </Directory>

    # Reverse proxy pro Node.js backend
    ProxyPreserveHost On
    ProxyPass /api http://127.0.0.1:4000/api
    ProxyPassReverse /api http://127.0.0.1:4000/api
    
    # Pro production, zapni proxy moduly:
    # a2enmod proxy
    # a2enmod proxy_http
</VirtualHost>
```

## Na Active24 (host bez SSH přístupu)

Pokud nemáš SSH pro editování Apache config, stačí:

1. Uploaduj frontend do `sub/rezervace/` (obsah `dist/` folderu)
2. Dej tam `.htaccess` (přiložený soubor)
3. Backend pusť z kdekoliv, kde máš Node.js (nebo požádej Active24 support)

## Pro aktivaci Proxy modulů

Na Active24 s cPanel to jde přes:
- cPanel → PHP Configuration → Extensions
- Nebo požádej support

Nebo překontroluj, zda jsou moduly již aktivní: `apache2ctl -M | grep proxy`

