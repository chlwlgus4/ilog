import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = resolve(mobileRoot, "dist", "public-web");
const expectedRoutes = [
  { route: "terms", marker: "screen-terms" },
  { route: "privacy-policy", marker: "screen-privacy-policy" },
  { route: "support", marker: "screen-support" },
  { route: "delete-account", marker: "screen-delete-account-request" },
  { route: "invite", marker: "screen-family-invite-link" },
];
const expectedAppleAppId = "37A43S5GYQ.com.ilog.mobile";
const expectedAndroidPackage = "com.ilog.mobile";
const expectedAndroidSha256 = "21:83:F1:34:39:26:91:73:31:95:1F:2A:60:AE:93:46:78:D5:7E:C9:1B:BF:07:84:D8:92:B0:0E:5D:25:5B:A4";

function outputPath(...segments) {
  return resolve(outputDirectory, ...segments);
}

function readRequired(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing exported file: ${relative(mobileRoot, path)}`);
  }

  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyRoute({ route, marker }) {
  const htmlPath = outputPath(`${route}.html`);
  const cleanRoutePath = outputPath(route, "index.html");
  const html = readRequired(htmlPath);
  const cleanRouteHtml = readRequired(cleanRoutePath);

  assert(html === cleanRouteHtml, `Clean route content differs: /${route}/`);
  assert(html.includes(marker), `Expected page marker is missing: /${route}`);

  for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
    const assetPath = match[1];
    const resolvedAssetPath = outputPath(assetPath.replace(/^\/+/, ""));
    assert(existsSync(resolvedAssetPath), `Missing exported asset for /${route}: ${assetPath}`);
  }
}

function verifyRedirects() {
  const redirects = readRequired(outputPath("_redirects"));

  for (const { route } of expectedRoutes) {
    const expectedRule = `/${route} /${route}/ 301`;
    assert(redirects.split(/\r?\n/).includes(expectedRule), `Missing clean URL redirect rule: ${expectedRule}`);
  }
}

function verifyAppleAssociation() {
  const association = JSON.parse(readRequired(outputPath(".well-known", "apple-app-site-association")));
  const details = association?.applinks?.details;
  assert(Array.isArray(details), "apple-app-site-association must contain applinks.details");

  const app = details.find((detail) => detail?.appID === expectedAppleAppId);
  assert(app, `apple-app-site-association is missing ${expectedAppleAppId}`);
  assert(app.paths?.includes("/invite") && app.paths?.includes("/invite/*"), "apple-app-site-association must cover /invite paths");
}

function verifyAndroidAssociation() {
  const statements = JSON.parse(readRequired(outputPath(".well-known", "assetlinks.json")));
  assert(Array.isArray(statements), "assetlinks.json must be a JSON array");

  const statement = statements.find(
    (item) =>
      item?.target?.namespace === "android_app" &&
      item.target.package_name === expectedAndroidPackage &&
      item.target.sha256_cert_fingerprints?.includes(expectedAndroidSha256),
  );
  assert(statement, "assetlinks.json is missing the current Android release signing certificate");
  assert(
    statement.relation?.includes("delegate_permission/common.handle_all_urls"),
    "assetlinks.json must delegate URL handling to the Android app",
  );
}

assert(existsSync(outputDirectory), `Export directory is missing: ${relative(mobileRoot, outputDirectory)}`);
for (const route of expectedRoutes) {
  verifyRoute(route);
}
verifyRedirects();
verifyAppleAssociation();
verifyAndroidAssociation();

console.log(`Verified static launch artifacts: ${expectedRoutes.map(({ route }) => `/${route}`).join(", ")}`);
