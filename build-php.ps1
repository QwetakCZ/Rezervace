# ============================================
# Build & Deploy skript pro Rezervace (PHP verze)
# Sestaví React frontend a připraví vše do složky deploy/
# ============================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  REZERVACE - Build & Deploy (PHP)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 1. Build frontend ---
Write-Host "`n[1/3] Builduji React frontend..." -ForegroundColor Yellow

$frontendDir = Join-Path $root "frontend"
if (-not (Test-Path $frontendDir)) {
    Write-Host "CHYBA: Složka frontend/ nenalezena!" -ForegroundColor Red
    exit 1
}

Push-Location $frontendDir

if (-not (Test-Path "node_modules")) {
    Write-Host "Instaluji závislosti..." -ForegroundColor Gray
    cmd /c "npm install"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CHYBA: npm install selhal!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
}

Write-Host "Spouštím vite build..." -ForegroundColor Gray
cmd /c "npm run build"
if ($LASTEXITCODE -ne 0) {
    Write-Host "CHYBA: Build selhal!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location
Write-Host "Build dokončen." -ForegroundColor Green

# --- 2. Připravit deploy složku ---
Write-Host "`n[2/3] Připravuji deploy složku..." -ForegroundColor Yellow

$deployDir = Join-Path $root "deploy"
$distDir = Join-Path $root "frontend\dist"

if (-not (Test-Path $distDir)) {
    Write-Host "CHYBA: Složka frontend/dist/ nenalezena! Spusť nejdřív build." -ForegroundColor Red
    exit 1
}

# Vyčistit staré soubory (kromě api/ složky a .htaccess)
Write-Host "Čistím staré soubory..." -ForegroundColor Gray
Get-ChildItem -Path $deployDir -File -Exclude ".htaccess" | Remove-Item -Force -ErrorAction SilentlyContinue

# Odstranit staré složky kromě api
Get-ChildItem -Path $deployDir -Directory -Exclude "api" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Zkopírovat build výstup
Write-Host "Kopíruji soubory z dist/..." -ForegroundColor Gray
Copy-Item -Path "$distDir\*" -Destination $deployDir -Recurse -Force

# --- 3. Hotovo ---
Write-Host "`n[3/3] Hotovo!" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploy složka je připravena: $deployDir" -ForegroundColor Green
Write-Host ""
Write-Host "Struktura deploy/:"
Get-ChildItem -Path $deployDir | ForEach-Object {
    if ($_.PSIsContainer) {
        Write-Host "  [$($_.Name)/]" -ForegroundColor Gray
    } else {
        Write-Host "  $($_.Name)" -ForegroundColor White
    }
}
Write-Host ""
Write-Host "Pro nasazení na Active24:" -ForegroundColor Cyan
Write-Host "  1. Nahraj obsah složky deploy/ na subdoménu" -ForegroundColor White
Write-Host "  2. Uprav deploy/api/config.php - změň DB přístupy" -ForegroundColor White
Write-Host "  3. Ujisti se, že .htaccess je na serveru povolen" -ForegroundColor White
Write-Host "  4. Na serveru: chmod 755 na api/ složku" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
