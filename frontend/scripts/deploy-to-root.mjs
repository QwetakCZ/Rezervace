import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const frontendDir = resolve(process.cwd());
const repoRoot = resolve(frontendDir, "..");
const distDir = resolve(frontendDir, "dist");

const indexHtml = readFileSync(resolve(distDir, "index.html"), "utf8");
const generatedAssets = Array.from(
  indexHtml.matchAll(/(?:src|href)="\.\/([^"?#]+)["?#]/g),
  (match) => match[1],
);
// Imported SVG logos are referenced by the JS bundle rather than index.html.
const svgAssets = readdirSync(distDir).filter((fileName) => fileName.endsWith(".svg"));
const filesToCopy = ["index.html", ...new Set([...generatedAssets, ...svgAssets])];

for (const fileName of filesToCopy) {
  const source = resolve(distDir, fileName);
  const target = resolve(repoRoot, fileName);

  if (!existsSync(source)) {
    throw new Error(`Missing build artifact: ${source}`);
  }

  copyFileSync(source, target);
  console.log(`Copied ${fileName} -> ${target}`);
}

