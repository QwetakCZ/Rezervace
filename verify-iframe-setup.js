#!/usr/bin/env node
/**
 * iframe Nasazení - Ověřovací skript
 *
 * Ověřuje, že frontend i backend je správně nakonfigurován
 * pro vložení jako iframe na Web.
 *
 * Spuštění:
 *   node verify-iframe-setup.js
 */

const fs = require("fs");
const path = require("path");

const checks = [];
let passedCount = 0;
let failedCount = 0;

function check(name, condition, details = "") {
  const status = condition ? "✅" : "❌";
  console.log(`${status} ${name}${details ? " - " + details : ""}`);

  if (condition) {
    passedCount++;
  } else {
    failedCount++;
  }

  checks.push({ name, condition, details });
}

console.log("🔍 Ověřování iframe nasazení...\n");

// ==================== Frontend Checks ====================
console.log("📦 FRONTEND KONTROLY:");
console.log("─".repeat(50));

const frontendDir = path.join(__dirname, "frontend");
const distDir = path.join(frontendDir, "dist");
const packageJsonPath = path.join(frontendDir, "package.json");
const viteConfigPath = path.join(frontendDir, "vite.config.js");
const appJsxPath = path.join(frontendDir, "src", "App.jsx");

// 1. Struktura adresářů
check(
  "Frontend adresář existuje",
  fs.existsSync(frontendDir),
  frontendDir
);

// 2. package.json
check(
  "Frontend package.json existuje",
  fs.existsSync(packageJsonPath),
  packageJsonPath
);

// 3. Lucide React instalován
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  check(
    "lucide-react je v dependencies",
    packageJson.dependencies && packageJson.dependencies["lucide-react"],
    packageJson.dependencies?.["lucide-react"] || "CHYBÍ"
  );
}

// 4. Vite config
check(
  "Vite config existuje",
  fs.existsSync(viteConfigPath),
  viteConfigPath
);

if (fs.existsSync(viteConfigPath)) {
  const viteConfig = fs.readFileSync(viteConfigPath, "utf-8");
  check(
    "Vite config má rollupOptions",
    viteConfig.includes("rollupOptions"),
    "Pro deterministické jména souborů"
  );
  check(
    "Vite config má CORS nastavení",
    viteConfig.includes("cors"),
    "V dev serveru"
  );
}

// 5. App.jsx s Lucide ikonami
check(
  "App.jsx existuje",
  fs.existsSync(appJsxPath),
  appJsxPath
);

if (fs.existsSync(appJsxPath)) {
  const appJsx = fs.readFileSync(appJsxPath, "utf-8");
  check(
    "App.jsx importuje lucide-react ikony",
    appJsx.includes("from \"lucide-react\""),
    "Alespoň 1 ikona"
  );
  check(
    "App.jsx používá Trophy ikonu",
    appJsx.includes("Trophy"),
    "V hero sekci"
  );
  check(
    "App.jsx používá Admin ikony",
    appJsx.includes("BarChart3") && appJsx.includes("ClipboardList"),
    "V admin sidebaru"
  );
}

// 6. Build existuje
check(
  "Frontend dist adresář existuje",
  fs.existsSync(distDir),
  "Spusťte: npm run build"
);

if (fs.existsSync(distDir)) {
  const distFiles = fs.readdirSync(distDir);
  check(
    "dist/index.html existuje",
    distFiles.includes("index.html"),
    `${distFiles.join(", ")}`
  );
  check(
    "dist/index.js existuje",
    distFiles.includes("index.js"),
    ".js bundle"
  );
  check(
    "dist/index.css existuje",
    distFiles.includes("index.css"),
    ".css stylesheet"
  );
}

// ==================== Backend Checks ====================
console.log("\n🔌 BACKEND KONTROLY:");
console.log("─".repeat(50));

const backendDir = path.join(__dirname, "backend");
const backendPackageJsonPath = path.join(backendDir, "package.json");
const appJsPath = path.join(backendDir, "src", "app.js");
const configJsPath = path.join(backendDir, "src", "config.js");
const envExamplePath = path.join(backendDir, ".env.example");

// 1. Struktura
check(
  "Backend adresář existuje",
  fs.existsSync(backendDir),
  backendDir
);

check(
  "Backend package.json existuje",
  fs.existsSync(backendPackageJsonPath),
  "Server dependencies"
);

// 2. CORS
check(
  "Backend app.js existuje",
  fs.existsSync(appJsPath),
  appJsPath
);

if (fs.existsSync(appJsPath)) {
  const appJs = fs.readFileSync(appJsPath, "utf-8");
  check(
    "Backend importuje CORS middleware",
    appJs.includes("cors"),
    "cors modul"
  );
  check(
    "Backend má cors() nakonfigurován",
    appJs.includes("cors({"),
    "Middleware"
  );
  check(
    "Backend CORS má origin callback",
    appJs.includes("origin(origin, callback)"),
    "Konfigurovatelné origins"
  );
}

// 3. Config
check(
  "Backend config.js existuje",
  fs.existsSync(configJsPath),
  configJsPath
);

if (fs.existsSync(configJsPath)) {
  const configJs = fs.readFileSync(configJsPath, "utf-8");
  check(
    "Config má corsOrigins",
    configJs.includes("corsOrigins"),
    "Dynamicky konfigurované"
  );
}

// 4. .env.example
check(
  "Backend .env.example existuje",
  fs.existsSync(envExamplePath),
  envExamplePath
);

if (fs.existsSync(envExamplePath)) {
  const envExample = fs.readFileSync(envExamplePath, "utf-8");
  check(
    ".env.example má CORS_ORIGIN",
    envExample.includes("CORS_ORIGIN"),
    "Environment proměnná"
  );
  check(
    ".env.example má DATABASE_URL",
    envExample.includes("DATABASE_URL"),
    "DB konfigurace"
  );
}

// ==================== Dokumentace Checks ====================
console.log("\n📚 DOKUMENTACE:");
console.log("─".repeat(50));

const embeddingMdPath = path.join(__dirname, "EMBEDDING.md");
const deploymentChecklistPath = path.join(__dirname, "DEPLOYMENT-CHECKLIST.md");
const readmePath = path.join(__dirname, "README.md");

check(
  "EMBEDDING.md existuje",
  fs.existsSync(embeddingMdPath),
  "Průvodby vložením jako iframe"
);

if (fs.existsSync(embeddingMdPath)) {
  const embeddingMd = fs.readFileSync(embeddingMdPath, "utf-8");
  check(
    "EMBEDDING.md má CORS sekci",
    embeddingMd.includes("CORS konfigurace"),
    "Setup instrukce"
  );
  check(
    "EMBEDDING.md má příklady HTML",
    embeddingMd.includes("<iframe"),
    "iframe příklady"
  );
}

check(
  "DEPLOYMENT-CHECKLIST.md existuje",
  fs.existsSync(deploymentChecklistPath),
  "Deployment checklist"
);

check(
  "README.md je aktualizován",
  fs.existsSync(readmePath),
  "Hlavní dokumentace"
);

if (fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, "utf-8");
  check(
    "README má sekci o ikonách",
    readme.includes("Lucide Ikony"),
    "Integrační status"
  );
  check(
    "README má sekci o iframe",
    readme.includes("iframe"),
    "Nasazení a vložení"
  );
}

// ==================== Výstup ====================
console.log("\n" + "═".repeat(50));
console.log("📊 VÝSLEDKY:");
console.log("═".repeat(50));

const total = passedCount + failedCount;
const percentage = Math.round((passedCount / total) * 100);

console.log(`
✅ Prošlo:    ${passedCount}/${total} (${percentage}%)
❌ Selhalo:   ${failedCount}/${total}

${failedCount === 0 ? "🎉 VEŠKERÉ KONTROLY PROŠLY!" : "⚠️  Prosím opravte chyby výše."}
`);

// Summary
console.log("📋 SHRNUTÍONFIGRUACE IFRAME NASAZENÍ:");
console.log("─".repeat(50));
console.log(`
Frontend:
  • Lucide React kony: ${passedCount >= 5 && failedCount < 3 ? "✅" : "❌"}
  • Production build: ${fs.existsSync(distDir) ? "✅" : "❌"}
  • CORS povolený: ${passedCount >= 8 ? "✅" : "❌"}

Backend:
  • CORS middleware: ${passedCount >= 12 ? "✅" : "❌"}
  • Konfigurovatelné origins: ${passedCount >= 13 ? "✅" : "❌"}
  • Environment setup: ${fs.existsSync(envExamplePath) ? "✅" : "❌"}

Dokumentace:
  • Průvodce vložením: ${fs.existsSync(embeddingMdPath) ? "✅" : "❌"}
  • Deployment checklist: ${fs.existsSync(deploymentChecklistPath) ? "✅" : "❌"}
  • README aktualizován: ${fs.existsSync(readmePath) ? "✅" : "❌"}
`);

if (failedCount === 0) {
  console.log("✨ Aplikace je PŘIPRAVENA NA IFRAME NASAZENÍ!");
  console.log("\nDalší kroky:");
  console.log("1. Přečtěte si EMBEDDING.md pro detailní instrukce");
  console.log("2. Spusťte frontend build: npm run build");
  console.log("3. Zkonfigurujte backend .env (CORS_ORIGIN)");
  console.log("4. Nasaďte frontend/dist/ na web server");
  console.log("5. Spusťte backend Node.js aplikaci");
  console.log("\nPříklad vložení:");
  console.log('  <iframe src="https://tvuj-server.cz/rezervace/"></iframe>');
}

process.exit(failedCount === 0 ? 0 : 1);

