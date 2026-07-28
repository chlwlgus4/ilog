#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase", "migrations");
const appApiPath = join(root, "mobile", "src", "serverless", "babyBossSupabaseApi.ts");
const appSourceRoots = [
  join(root, "mobile", "app"),
  join(root, "mobile", "src"),
];

const requiredMigrations = {
  standardAuth: "20260723043852_standard_email_auth_caregiver.sql",
  restrictConsentHelper: "20260724065000_restrict_legal_consent_helper.sql",
  hardenExport: "20260724065117_harden_export_surface_and_function_search_path.sql",
  revokeLegacyAuth: "20260724065502_revoke_legacy_auth_rpc_execute.sql",
  restrictLegacyHashes: "20260724080000_restrict_legacy_caregiver_hash_access.sql",
  hardenCaregiverGrants: "20260724103000_harden_caregiver_client_grants.sql",
};

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readMigration(name) {
  return readFileSync(join(migrationsDir, name), "utf8");
}

function listSourceFiles(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        pending.push(path);
      } else if (/\.(?:[cm]?js|tsx?|json)$/i.test(name)) {
        files.push(path);
      }
    }
  }
  return files;
}

function check(label, condition, detail) {
  return { label, pass: Boolean(condition), detail };
}

function matchesAll(source, patterns) {
  return patterns.every((pattern) => pattern.test(source));
}

function listMigrationNames() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function isGitTracked(relativePath) {
  try {
    gitOutput(["ls-files", "--error-unmatch", "--", relativePath]);
    return true;
  } catch {
    return false;
  }
}

function sha256(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

const migrationSources = Object.fromEntries(
  Object.entries(requiredMigrations).map(([key, name]) => [key, existsSync(join(migrationsDir, name)) ? readMigration(name) : ""]),
);
const apiSource = read("mobile/src/serverless/babyBossSupabaseApi.ts");
const migrationNames = listMigrationNames();
const migrationVersions = migrationNames.map((name) => name.match(/^(\d{14})_[a-z0-9_]+\.sql$/i)?.[1] ?? null);
const duplicateMigrationVersions = migrationVersions
  .filter(Boolean)
  .filter((version, index, versions) => versions.indexOf(version) !== index);
const malformedMigrationNames = migrationNames.filter((name) => !/^\d{14}_[a-z0-9_]+\.sql$/i.test(name));
const emptyMigrationNames = migrationNames.filter((name) => readMigration(name).trim().length === 0);
const migrationInventory = migrationNames.map((name) => {
  const relativePath = join("supabase", "migrations", name);
  const source = readMigration(name);
  return {
    name,
    gitTracked: isGitTracked(relativePath),
    sha256: sha256(source),
  };
});
const untrackedMigrationNames = migrationInventory.filter((entry) => !entry.gitTracked).map((entry) => entry.name);
const allAppSource = appSourceRoots
  .flatMap((directory) => listSourceFiles(directory))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const expectedCaregiverFields = [
  "id",
  "family_id",
  "auth_user_id",
  "email",
  "name",
  "role",
  "availability_score",
  "fatigue_score",
  "image_url",
  "contact_phone",
  "push_notifications_enabled",
  "chat_notifications_enabled",
];
const selectedCaregiverFields = apiSource.match(/const caregiverSelectFields\s*=\s*\n?\s*"([^"]+)"/)?.[1].split(",") ?? [];

const checks = [
  check(
    "migration filenames are unique, ordered, and contain SQL",
    malformedMigrationNames.length === 0
      && duplicateMigrationVersions.length === 0
      && emptyMigrationNames.length === 0
      && migrationVersions.every((version, index) => index === 0 || version >= migrationVersions[index - 1]),
    malformedMigrationNames.length || duplicateMigrationVersions.length || emptyMigrationNames.length
      ? `Malformed: ${malformedMigrationNames.join(", ") || "none"}; duplicate versions: ${[...new Set(duplicateMigrationVersions)].join(", ") || "none"}; empty: ${emptyMigrationNames.join(", ") || "none"}`
      : `${migrationNames.length} SQL migrations are versioned and non-empty.`,
  ),
  check(
    "required P0-5 hardening migrations exist",
    Object.values(requiredMigrations).every((name) => existsSync(join(migrationsDir, name))),
    Object.values(requiredMigrations).join(", "),
  ),
  check(
    "required P0-5 hardening migrations are tracked by Git",
    Object.values(requiredMigrations).every((name) => isGitTracked(join("supabase", "migrations", name))),
    Object.values(requiredMigrations)
      .filter((name) => !isGitTracked(join("supabase", "migrations", name)))
      .join(", ") || "All required hardening migrations are tracked.",
  ),
  check(
    "legacy broad caregiver grant is superseded by a later revoke-all migration",
    existsSync(join(migrationsDir, "20260717124500_restore_caregiver_client_grants.sql"))
      && requiredMigrations.hardenCaregiverGrants > "20260717124500_restore_caregiver_client_grants.sql"
      && /revoke all privileges on table public\.caregivers from authenticated;/i.test(migrationSources.hardenCaregiverGrants),
    "The local migration chain preserves the historical broad grant but finishes with a revoke-all reset.",
  ),
  check(
    "caregiver SELECT grant excludes legacy credential hashes",
    matchesAll(migrationSources.hardenCaregiverGrants, [
      /grant select \([\s\S]*?chat_notifications_enabled,[\s\S]*?updated_at[\s\S]*?\) on table public\.caregivers to authenticated;/i,
    ])
      && !/grant select \([\s\S]*?\b(?:password_hash|pin_hash)\b[\s\S]*?\) on table public\.caregivers to authenticated;/i.test(migrationSources.hardenCaregiverGrants),
    "Only the client profile projection is granted after the revoke-all reset.",
  ),
  check(
    "caregiver direct UPDATE grant is limited to profile name and image",
    /grant update \(\s*name,\s*image_url\s*\) on table public\.caregivers to authenticated;/i.test(migrationSources.hardenCaregiverGrants),
    "Role, phone, notification preferences, and legacy hashes require checked RPC or Auth paths.",
  ),
  check(
    "push preferences RPC clears legacy hashes before returning a composite caregiver row",
    matchesAll(migrationSources.hardenCaregiverGrants, [
      /security definer\s+set search_path = public/i,
      /v_updated\.pin_hash := '';/,
      /v_updated\.password_hash := '';/,
      /revoke all on function public\.update_current_push_notification_settings\(boolean, boolean\) from public, anon;/i,
    ]),
    "The only retained composite-row push RPC explicitly redacts both legacy hash fields.",
  ),
  check(
    "standard profile RPC rejects legacy password mutation",
    matchesAll(migrationSources.standardAuth, [
      /set search_path = ''/i,
      /Password changes must use Supabase Auth/,
      /revoke all on function public\.update_caregiver_personal_info_checked\(bigint, text, text, text, text, text\) from public, anon;/i,
    ]),
    "The newest definition replaces the historical password_hash update branch.",
  ),
  check(
    "legacy authentication and invitation RPC execution is revoked",
    matchesAll(migrationSources.revokeLegacyAuth, [
      /login_caregiver_by_email/i,
      /register_caregiver/i,
      /join_family_by_invite/i,
      /from anon, authenticated/i,
    ]),
    "The old direct-auth entry points are no longer client executable in the local migration chain.",
  ),
  check(
    "legal-consent and export helpers are removed from the public client surface",
    matchesAll(migrationSources.restrictConsentHelper, [
      /record_current_caregiver_legal_consents/i,
      /from authenticated/i,
    ])
      && /revoke all on function public\.request_data_export_checked/i.test(migrationSources.hardenExport)
      && /revoke all on table public\.export_jobs/i.test(migrationSources.hardenExport),
    "Internal helpers stay callable only from their owning server-side flows.",
  ),
  check(
    "mobile caregiver projection matches the restricted SELECT grant",
    JSON.stringify(selectedCaregiverFields) === JSON.stringify(expectedCaregiverFields),
    `Selected fields: ${selectedCaregiverFields.join(", ") || "not found"}`,
  ),
  check(
    "mobile source contains no anonymous sign-in call",
    !/signInAnonymously\s*\(/.test(allAppSource),
    "Dashboard Anonymous Sign-ins can be disabled without breaking a source-level call path.",
  ),
  check(
    "mobile source contains no service-role credential reference",
    !/(?:SUPABASE_SERVICE_ROLE|service_role)/i.test(allAppSource),
    "This checks app source only; it intentionally does not inspect ignored local environment files.",
  ),
];

const operatorRequired = [
  "Create a production backup and restore it into an isolated project, then verify recovery.",
  "Resolve migration history only after the full chain succeeds in a new blank validation project.",
  "Run family A/B API and Storage isolation attempts using separate real Auth users in a non-production project.",
  "In a non-production project, verify Anonymous Sign-ins are rejected and protected API access remains denied.",
  "Use Supabase Pro to enable Prevent use of leaked passwords, or record and approve the Free-plan risk before public release.",
  "Re-run Security Advisor and record any approved exceptions after the final production migration deployment.",
];

const report = {
  scope: "P0-5 local static controls only; no network, database, or environment secrets are read. Git is queried read-only for file tracking status.",
  localChecks: checks,
  migrationInventory,
  untrackedMigrationNames,
  operatorRequired,
  passed: checks.filter((entry) => entry.pass).length,
  failed: checks.filter((entry) => !entry.pass).length,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("P0-5 local control verification");
  console.log("Scope: static source and migration inspection only. No Supabase commands are executed.\n");
  for (const entry of checks) {
    console.log(`${entry.pass ? "PASS" : "FAIL"}  ${entry.label}`);
    console.log(`      ${entry.detail}`);
  }
  console.log("\nMigration inventory:");
  for (const entry of migrationInventory) {
    console.log(`- ${entry.gitTracked ? "tracked" : "UNTRACKED"}  ${entry.name}  ${entry.sha256}`);
  }
  console.log("\nOperator-required evidence (not represented as PASS):");
  for (const item of operatorRequired) console.log(`- ${item}`);
  console.log(`\nResult: ${report.passed}/${checks.length} local checks passed.`);
}

if (report.failed > 0) process.exitCode = 1;
