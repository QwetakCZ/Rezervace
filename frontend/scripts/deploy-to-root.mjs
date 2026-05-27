import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const frontendDir = resolve(process.cwd());
const repoRoot = resolve(frontendDir, "..");
const distDir = resolve(frontendDir, "dist");

const filesToCopy = ["index.html", "index.js", "index.css"];

for (const fileName of filesToCopy) {
  const source = resolve(distDir, fileName);
  const target = resolve(repoRoot, fileName);

  if (!existsSync(source)) {
    throw new Error(`Missing build artifact: ${source}`);
  }

  copyFileSync(source, target);
  console.log(`Copied ${fileName} -> ${target}`);
}

