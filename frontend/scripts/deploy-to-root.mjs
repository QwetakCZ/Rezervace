import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const frontendDir = resolve(process.cwd());
const repoRoot = resolve(frontendDir, "..");
const distDir = resolve(frontendDir, "dist");

const indexHtml = readFileSync(resolve(distDir, "index.html"), "utf8");
const generatedAssets = Array.from(
  indexHtml.matchAll(/(?:src|href)="\.\/([^"?#]+)["?#]/g),
  (match) => match[1],
);
const filesToCopy = ["index.html", ...new Set(generatedAssets)];

for (const fileName of filesToCopy) {
  const source = resolve(distDir, fileName);
  const target = resolve(repoRoot, fileName);

  if (!existsSync(source)) {
    throw new Error(`Missing build artifact: ${source}`);
  }

  copyFileSync(source, target);
  console.log(`Copied ${fileName} -> ${target}`);
}

