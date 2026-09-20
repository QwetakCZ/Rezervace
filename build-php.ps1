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
Write-Host "`n[1/4] Builduji React frontend..." -ForegroundColor Yellow

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
Write-Host "`n[2/4] Připravuji deploy složku..." -ForegroundColor Yellow

$deployDir = Join-Path $root "deploy"
$distDir = Join-Path $root "frontend\dist"

if (-not (Test-Path $distDir)) {
    Write-Host "CHYBA: Složka frontend/dist/ nenalezena! Spusť nejdřív build." -ForegroundColor Red
    exit 1
}

# Vyčistit starý frontend, ale zachovat API konfiguraci a SQL migrace.
Write-Host "Čistím staré soubory..." -ForegroundColor Gray
Get-ChildItem -Path $deployDir -File | Where-Object {
    $_.Name -ne ".htaccess" -and $_.Extension -ne ".sql"
} | Remove-Item -Force -ErrorAction SilentlyContinue

# Odstranit staré složky kromě api
Get-ChildItem -Path $deployDir -Directory -Exclude "api" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Zkopírovat build výstup
Write-Host "Kopíruji soubory z dist/..." -ForegroundColor Gray
Copy-Item -Path "$distDir\*" -Destination $deployDir -Recurse -Force

# --- 3. Synchronizovat PHP API ---
Write-Host "`n[3/4] Synchronizuji PHP API..." -ForegroundColor Yellow
$apiSource = Join-Path $root "api"
$apiDeploy = Join-Path $deployDir "api"
New-Item -ItemType Directory -Path (Join-Path $apiDeploy "routes") -Force | Out-Null

@("index.php", "db.php", "auth.php", "mail.php", "sms.php", "slots.php", ".htaccess") | ForEach-Object {
    Copy-Item -LiteralPath (Join-Path $apiSource $_) -Destination (Join-Path $apiDeploy $_) -Force
}
Copy-Item -Path (Join-Path $apiSource "routes\*.php") -Destination (Join-Path $apiDeploy "routes") -Force
Write-Host "Lokální api/config.php nebyl kopírován; deploy konfigurace zůstala zachována." -ForegroundColor Gray

# --- 4. Hotovo ---
Write-Host "`n[4/4] Hotovo!" -ForegroundColor Yellow
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
