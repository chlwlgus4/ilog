import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const recordDir = join(root, "assets", "record-icons-svg");
const brandDir = join(root, "assets", "brand-icons-svg");
const mapFile = join(root, "src", "features", "shared", "recordIconSvgs.ts");

const common = `stroke-linecap="round" stroke-linejoin="round"`;
const icon = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;
const line = (stroke, fill = "none", width = 4.2) => `fill="${fill}" stroke="${stroke}" stroke-width="${width}" ${common}`;

const icons = {
  feeding: icon(`
  <g transform="rotate(16 32 32)">
    <rect x="24" y="15" width="17" height="34" rx="5" ${line("#4F7DFB", "#EAF1FF")} />
    <path d="M29 12h7M28 20h9M29 27h7M29 34h7" ${line("#4F7DFB", "none", 3.2)} />
    <path d="M26 49h13" ${line("#7CA0FF", "none", 3.2)} />
  </g>`),
  sleep: icon(`
  <path d="M43.5 42.6A18 18 0 0 1 21.4 20.5a15.8 15.8 0 1 0 22.1 22.1Z" fill="#EAF1FF" stroke="#5D7DFB" stroke-width="4.2" ${common} />
  <path d="M42 18l1.7 3.5 3.8.5-2.7 2.6.7 3.7-3.5-1.8-3.4 1.8.6-3.7-2.7-2.6 3.8-.5Z" fill="#7FA1FF" />`),
  diaper: icon(`
  <path d="M15 22c7 2.5 11.5 4 17 4s10-1.5 17-4v12.5c0 8.3-6.7 15-15 15h-4c-8.3 0-15-6.7-15-15Z" ${line("#20B879", "#EAFBF3")} />
  <path d="M15 22l8 14M49 22l-8 14M27 37h10" ${line("#20B879", "none", 3.6)} />
  <circle cx="25" cy="31" r="2" fill="#20B879" />
  <circle cx="39" cy="31" r="2" fill="#20B879" />`),
  temperature: icon(`
  <path d="M31 14a6 6 0 0 1 12 0v22a12 12 0 1 1-12 0Z" ${line("#EF4444", "#FFF0F0")} />
  <path d="M37 18v24" ${line("#EF4444", "none", 3.4)} />
  <circle cx="37" cy="46" r="5" fill="#EF4444" />
  <path d="M44 20h5M44 29h4" ${line("#FF8A8A", "none", 3)} />`),
  medicine: icon(`
  <rect x="20" y="18" width="24" height="34" rx="5" ${line("#8B5CF6", "#F1ECFF")} />
  <path d="M26 14h12v5H26z" ${line("#8B5CF6", "#E6DAFF", 3.4)} />
  <rect x="25" y="30" width="14" height="13" rx="3" fill="#FFFFFF" stroke="#C4B5FD" stroke-width="2.4" />
  <path d="M32 33v7M28.5 36.5h7" ${line("#FF9F1C", "none", 3)} />`),
  pump: icon(`
  <path d="M22 16h20l-3 13a8 8 0 0 1-14 0Z" ${line("#8B5CF6", "#F2ECFF")} />
  <path d="M26 18v-4h12v4M25 34h14M32 34v9" ${line("#8B5CF6", "none", 3.4)} />
  <rect x="24" y="43" width="16" height="8" rx="4" fill="#FFE8C5" stroke="#FF9F1C" stroke-width="3" />
  <circle cx="22" cy="30" r="3" fill="#FF9F1C" />`),
  memo: icon(`
  <rect x="19" y="13" width="28" height="38" rx="4" ${line("#D29A00", "#FFF6D8")} />
  <path d="M25 23h16M25 31h16M25 39h10" ${line("#D29A00", "none", 3)} />
  <path d="M42 13v8h5" fill="#FFE9A8" stroke="#D29A00" stroke-width="3" ${common} />`),
  wake: icon(`
  <circle cx="32" cy="32" r="10" fill="#FFF7D6" stroke="#FF9F1C" stroke-width="4.2" />
  <path d="M32 10v7M32 47v7M10 32h7M47 32h7M16.5 16.5l5 5M42.5 42.5l5 5M47.5 16.5l-5 5M21.5 42.5l-5 5" ${line("#FF9F1C", "none", 3.4)} />`),
  nap: icon(`
  <path d="M43.5 42.6A18 18 0 0 1 21.4 20.5a15.8 15.8 0 1 0 22.1 22.1Z" fill="#EAF1FF" stroke="#5D7DFB" stroke-width="4.2" ${common} />
  <path d="M44 18h7M44 24h5M44 30h8" ${line("#7FA1FF", "none", 3)} />`),
  bath: icon(`
  <path d="M14 34h37v4a13 13 0 0 1-13 13H27a13 13 0 0 1-13-13Z" ${line("#4F7DFB", "#EEF5FF")} />
  <path d="M19 34V23a7 7 0 0 1 7-7h2M20 51l-3 5M46 51l3 5" ${line("#4F7DFB", "none", 3.5)} />
  <circle cx="42" cy="20" r="3" fill="#8DB0FF" />
  <circle cx="49" cy="15" r="2.5" fill="#B9CAFF" />`),
  play: icon(`
  <path d="M23 20h18l8 9-5 6-4-3v17H24V32l-4 3-5-6Z" ${line("#8B5CF6", "#F3ECFF")} />
  <path d="M28 20a6 6 0 0 0 8 0" ${line("#8B5CF6", "none", 3)} />`),
  walk: icon(`
  <path d="M23 18c5 4 8 9 8 15 0 6-3 11-7 11-3 0-5-2-5-5 0-2 1-4 3-5" ${line("#20B879", "#EAFBF3")} />
  <path d="M41 22c4 4 6 8 6 13 0 5-3 9-7 9-3 0-5-2-5-5 0-2 1-4 3-5" ${line("#4F7DFB", "#EAF1FF")} />
  <circle cx="21" cy="50" r="2.2" fill="#20B879" />
  <circle cx="36" cy="50" r="2.2" fill="#4F7DFB" />`),
  vaccine: icon(`
  <g transform="rotate(-34 32 32)">
    <rect x="20" y="26" width="25" height="13" rx="5" ${line("#8B5CF6", "#F2ECFF")} />
    <path d="M14 32.5h6M45 32.5h7M52 28.5v8M26 26v13M33 26v13" ${line("#8B5CF6", "none", 3.2)} />
    <path d="M12 32.5h-4" ${line("#4F7DFB", "none", 3.2)} />
    <circle cx="39" cy="32.5" r="3" fill="#FFB84D" />
  </g>
  <path d="M45 44c2.8 2.8 2.8 6.2 0 8.4-2.8-2.2-2.8-5.6 0-8.4Z" fill="#FFE8C5" stroke="#FF9F1C" stroke-width="2.7" ${common} />`),
  hospital: icon(`
  <rect x="15" y="24" width="34" height="27" rx="7" ${line("#4F7DFB", "#EEF5FF")} />
  <path d="M24 24v-5.5h16V24" ${line("#4F7DFB", "none", 3.6)} />
  <rect x="25" y="31" width="14" height="14" rx="4" fill="#FFFFFF" stroke="#BBD0FF" stroke-width="2.6" />
  <path d="M32 34v8M28 38h8" ${line("#FF8A5C", "none", 3.2)} />
  <circle cx="45" cy="28" r="3" fill="#20B879" />
  <path d="M19 50h26" ${line("#7FA1FF", "none", 2.6)} />`),
  emergency: icon(`
  <circle cx="32" cy="32" r="20" fill="#FFF0F0" stroke="#EF4444" stroke-width="4.2" />
  <path d="M32 18v20" ${line("#EF4444", "none", 4)} />
  <circle cx="32" cy="46" r="2.8" fill="#EF4444" />`),
  growth: icon(`
  <path d="M17 49h32" ${line("#4F7DFB", "none", 3.4)} />
  <rect x="17" y="18" width="9" height="31" rx="4" fill="#FFF6D8" stroke="#FF9F1C" stroke-width="3.4" ${common} />
  <path d="M17 26h5M17 34h4M17 42h5" ${line("#FF9F1C", "none", 2.6)} />
  <path d="M28 43c5-8.5 9.5-14 19-18" ${line("#4F7DFB", "none", 4.2)} />
  <path d="M43 24h7v7" ${line("#4F7DFB", "none", 4.2)} />
  <circle cx="31" cy="39" r="3.2" fill="#20B879" />
  <circle cx="39" cy="31" r="3.2" fill="#8DB0FF" />
  <circle cx="48" cy="25" r="2.6" fill="#FF9F1C" />`),
  weight: icon(`
  <rect x="16" y="18" width="32" height="30" rx="8" ${line("#4F7DFB", "#EEF5FF")} />
  <path d="M24 30a9 9 0 0 1 16 0M32 29l5-5" ${line("#4F7DFB", "none", 3.4)} />
  <path d="M25 40h14" ${line("#7FA1FF", "none", 3)} />`),
  height: icon(`
  <rect x="24" y="12" width="16" height="40" rx="4" ${line("#20B879", "#EAFBF3")} />
  <path d="M24 20h7M24 28h5M24 36h7M24 44h5" ${line("#20B879", "none", 3)} />`),
  notification: icon(`
  <path d="M21 42h22l-3-5V28a8 8 0 0 0-16 0v9Z" ${line("#4F7DFB", "#EEF5FF")} />
  <path d="M29 47a4 4 0 0 0 6 0M32 16v-4" ${line("#4F7DFB", "none", 3.4)} />`),
  calendar: icon(`
  <rect x="16" y="18" width="32" height="30" rx="5" ${line("#4F7DFB", "#EEF5FF")} />
  <path d="M16 27h32M24 14v8M40 14v8M24 35h4M36 35h4M24 42h4" ${line("#4F7DFB", "none", 3)} />`),
  family: icon(`
  <circle cx="25" cy="24" r="7" fill="#EAF1FF" stroke="#4F7DFB" stroke-width="3.5" />
  <circle cx="41" cy="26" r="6" fill="#EAFBF3" stroke="#20B879" stroke-width="3.5" />
  <path d="M13 48c2.5-8 9-12 17-12s14 4 17 12M34 48c2-5 6-8 12-8 3 0 5.5.8 8 2.7" ${line("#4F7DFB", "none", 3.5)} />`),
  chat: icon(`
  <path d="M15 20h34v22H29l-10 8v-8h-4Z" ${line("#4F7DFB", "#EEF5FF")} />
  <path d="M24 29h16M24 36h10" ${line("#4F7DFB", "none", 3)} />`),
  settings: icon(`
  <circle cx="32" cy="32" r="6" fill="#EAF1FF" stroke="#4F7DFB" stroke-width="3.5" />
  <path d="M32 12v7M32 45v7M12 32h7M45 32h7M18 18l5 5M41 41l5 5M46 18l-5 5M23 41l-5 5" ${line("#4F7DFB", "none", 3.4)} />`),
  statistics: icon(`
  <rect x="17" y="34" width="7" height="14" rx="2" fill="#CFE0FF" stroke="#4F7DFB" stroke-width="3" />
  <rect x="29" y="24" width="7" height="24" rx="2" fill="#EAF1FF" stroke="#4F7DFB" stroke-width="3" />
  <rect x="41" y="16" width="7" height="32" rx="2" fill="#D9F8E9" stroke="#20B879" stroke-width="3" />
  <path d="M14 50h38" ${line("#64748B", "none", 3)} />`),
  dashboard: icon(`
  <path d="M14 31 32 16l18 15v19H38V38H26v12H14Z" fill="#EEF5FF" stroke="#4F7DFB" stroke-width="4" ${common} />`),
  profile: icon(`
  <circle cx="32" cy="24" r="9" fill="#FFE7D6" stroke="#D68A5C" stroke-width="3.5" />
  <path d="M16 50c3-10 9-15 16-15s13 5 16 15" fill="#EAF1FF" stroke="#4F7DFB" stroke-width="3.8" ${common} />`),
  timeline: icon(`
  <path d="M20 18v28M44 18v28" ${line("#64748B", "none", 3.2)} />
  <circle cx="20" cy="22" r="5" fill="#EEF5FF" stroke="#4F7DFB" stroke-width="3.2" />
  <circle cx="44" cy="32" r="5" fill="#EEF5FF" stroke="#4F7DFB" stroke-width="3.2" />
  <circle cx="20" cy="44" r="5" fill="#EEF5FF" stroke="#4F7DFB" stroke-width="3.2" />
  <path d="M25 22h12M25 44h12" ${line("#4F7DFB", "none", 3)} />`),
  more: icon(`
  <circle cx="20" cy="32" r="4" fill="#64748B" />
  <circle cx="32" cy="32" r="4" fill="#64748B" />
  <circle cx="44" cy="32" r="4" fill="#64748B" />`),
  etc: icon(`
  <path d="M12 32s7-12 20-12 20 12 20 12-7 12-20 12-20-12-20-12Z" ${line("#64748B", "#F8FAFC")} />
  <circle cx="32" cy="32" r="5" fill="#64748B" />`),
};

icons.pumping = icons.pump;
icons.sun = icons.wake;
icons.stats = icons.statistics;
icons.home = icons.dashboard;

const brand = {
  babyboss: icon(`
  <circle cx="32" cy="32" r="19" fill="#FDFEFF" stroke="#4F7DFB" stroke-width="4" />
  <path d="M32 10v7M17 23l-6-4M47 23l6-4" ${line("#4F7DFB", "none", 3.4)} />
  <circle cx="25" cy="31" r="2.6" fill="#4F7DFB" />
  <circle cx="39" cy="31" r="2.6" fill="#4F7DFB" />
  <path d="M25 40c4 4 10 4 14 0" ${line("#4F7DFB", "none", 3.4)} />
  <path d="M31 16c2.5 0 4 1.5 4 3.5 0 2.5-2.3 4-5.5 4" ${line("#4F7DFB", "none", 3.2)} />`),
};

mkdirSync(recordDir, { recursive: true });
mkdirSync(brandDir, { recursive: true });
mkdirSync(dirname(mapFile), { recursive: true });

for (const [name, svg] of Object.entries(icons)) {
  writeFileSync(join(recordDir, `${name}.svg`), `${svg}\n`, "utf8");
}

for (const [name, svg] of Object.entries(brand)) {
  writeFileSync(join(brandDir, `${name}.svg`), `${svg}\n`, "utf8");
}

const allSvgs = { ...icons, ...brand };
const entries = Object.entries(allSvgs)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, svg]) => `  ${JSON.stringify(name)}: ${JSON.stringify(svg)},`)
  .join("\n");

writeFileSync(
  mapFile,
  `// Generated by scripts/generate_record_svgs.mjs. Do not edit by hand.\n\nexport const recordIconSvgs = {\n${entries}\n} as const;\n\nexport type GeneratedRecordIconName = keyof typeof recordIconSvgs;\n`,
  "utf8",
);

console.log(`Generated ${Object.keys(icons).length} record SVGs and ${Object.keys(brand).length} brand SVG.`);
