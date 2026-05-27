#!/usr/bin/env powershell
# Deploy script for iframe nasazení
#
# Použití:
#   .\deploy.ps1 -Environment production -ApiUrl https://api.example.com
#   .\deploy.ps1 -Environment development

param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "development",

    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "http://localhost:4000",

    [Parameter(Mandatory=$false)]
    [string]$OutputDir = "C:\xampp\htdocs\Rezervace\dist_output"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Rezervační Systém - Deploy Script (iframe)" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "Konfigurace:
  Environment: $Environment
  API URL: $ApiUrl
  Výstupní dir: $OutputDir
" -ForegroundColor Green

# 1. Frontend build
Write-Host "📦 Budování frontendu..." -ForegroundColor Yellow
Push-Location frontend

Write-Host "  → Instalace závislostí..." -ForegroundColor Gray
npm install

Write-Host "  → Build..." -ForegroundColor Gray
$env:VITE_API_URL = $ApiUrl
npm run build

if (-not $?) {
    Write-Host "  ❌ Build selhal!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "  ✅ Frontend build hotov" -ForegroundColor Green

# Kopírování do výstupního adresáře
if (Test-Path $OutputDir) {
    Remove-Item $OutputDir -Recurse -Force
}
Copy-Item dist $OutputDir -Recurse

Pop-Location

# 2. Backend kontrola
Write-Host ""
Write-Host "🔌 Kontrola backendu..." -ForegroundColor Yellow
Push-Location backend

if (-not (Test-Path .env)) {
    Write-Host "  ⚠️  .env neexistuje, kopíruji .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "  ℹ️  Prosím editujte .env a nastavte CORS_ORIGIN a DATABASE_URL" -ForegroundColor Yellow
}

Write-Host "  → Instalace závislostí..." -ForegroundColor Gray
npm install

Write-Host "  ✅ Backend připraven" -ForegroundColor Green

Pop-Location

# 3. Ověření
Write-Host ""
Write-Host "✅ Ověřování..." -ForegroundColor Yellow
node verify-iframe-setup.js

if (-not $?) {
    Write-Host ""
    Write-Host "  ⚠️  Některé kontroly selhaly. Prosím opravte problémy výše." -ForegroundColor Yellow
}

# 4. Shrnutí
Write-Host ""
Write-Host "═════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 Deploy Shrnutí" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════════" -ForegroundColor Cyan

$distSize = (Get-ChildItem -Path dist_output -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB
$distFiles = (Get-ChildItem -Path dist_output -Recurse -File).Count

Write-Host ""
Write-Host "Frontend:
  • Vytvořeno v: dist_output/
  • Počet souborů: $distFiles
  • Velikost: $([math]::Round($distSize, 2)) KB

Backend:
  • Konfigurační soubor: backend/.env
  • Dependencies: Připraveny
" -ForegroundColor Green

# 5. Instrukce
Write-Host ""
Write-Host "Další kroky:" -ForegroundColor Cyan
Write-Host "1. Poskytnout frontend soubory na web server:
   cp dist_output/* /váš/web/server/cesta/rezervace/" -ForegroundColor Gray

Write-Host "2. Spustit backend Node.js:
   cd backend && npm run dev" -ForegroundColor Gray

Write-Host "3. Vložit iframe na web:
   <iframe src='https://váš-server.cz/rezervace/' ...></iframe>" -ForegroundColor Gray

Write-Host "4. Přečíst dokumentaci:
   cat EMBEDDING.md" -ForegroundColor Gray

Write-Host ""
Write-Host "✨ Deploy hotov!" -ForegroundColor Green

