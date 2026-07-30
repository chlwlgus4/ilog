import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(mobileRoot, "dist", "public-web");

// Expo web export emits route.html files. Copy the public pages to route/index.html
// as well so conventional static hosts can serve a clean trailing-slash URL.
const publicRoutes = ["terms", "privacy", "privacy-policy", "support", "delete-account", "invite"];

for (const route of publicRoutes) {
  const source = join(outputDirectory, `${route}.html`);
  const destination = join(outputDirectory, route, "index.html");

  if (!existsSync(source)) {
    throw new Error(`Expected static route was not exported: ${source}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

console.log(`Prepared clean static routes: ${publicRoutes.join(", ")}`);
