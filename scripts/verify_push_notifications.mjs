import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd, exit } from "node:process";

const root = cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertIncludes(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label}: expected to include ${expected}`);
  }
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label}: expected pattern ${pattern}`);
  }
}

function allMigrationSql() {
  return readdirSync(join(root, "supabase", "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => read(join("supabase", "migrations", file)))
    .join("\n\n");
}

try {
  const migrations = allMigrationSql();
  const api = read("mobile/src/serverless/babyBossSupabaseApi.ts");
  const edgeFunction = read("supabase/functions/send-push-notifications/index.ts");
  const recordSourceMigration = read(
    "supabase/migrations/20260817090000_add_record_share_notification_source.sql",
  );
  const appConfig = read("mobile/app.config.ts");
  const supabaseConfig = read("supabase/config.toml");

  for (const eventType of ["FAMILY_CHAT", "RECORD_ALARM"]) {
    assertIncludes(migrations, `'${eventType}'`, `push event type ${eventType}`);
  }

  assertMatches(
    migrations,
    /create\s+or\s+replace\s+function\s+public\.enqueue_due_record_alarm_pushes\(/i,
    "due record alarm queueing function",
  );
  assertMatches(
    migrations,
    /create\s+or\s+replace\s+function\s+public\.create_family_chat_message_checked\([\s\S]+?'FAMILY_CHAT'/i,
    "family chat push event generation",
  );
  for (const expected of [
    "update_current_push_notification_settings",
    "push_notifications_enabled = family.push_notifications_enabled",
    "c.chat_notifications_enabled",
    "familyChatMessageId",
  ]) {
    assertIncludes(migrations, expected, `personal chat push preference ${expected}`);
  }
  assertIncludes(
    edgeFunction,
    "enqueue_due_record_alarm_pushes",
    "send-push-notifications must enqueue due record alarms before sending",
  );
  assertMatches(
    recordSourceMigration,
    /create policy push_notification_events_insert_actor[\s\S]+?recipient\.family_id = public\.push_notification_events\.family_id/i,
    "push event recipients must belong to the event family",
  );
  assertMatches(
    recordSourceMigration,
    /where caregiver\.family_id = p_family_id\s+and caregiver\.id <> p_actor_caregiver_id/i,
    "record share notifications must not be delivered to their author",
  );
  assertMatches(
    supabaseConfig,
    /\[functions\.send-push-notifications\]\s+verify_jwt = false/,
    "push worker DB calls require verify_jwt=false",
  );
  assertMatches(
    edgeFunction,
    /let tokenQuery = serviceClient\s+\.from\("push_device_tokens"\)\s+\.select\("family_id,caregiver_id,expo_push_token"\)\s+\.eq\("enabled", true\)\s+\.in\("caregiver_id", recipientIds\);\s+let recipientPreferenceQuery = serviceClient\s+\.from\("caregivers"\)\s+\.select\("id,family_id,push_notifications_enabled,chat_notifications_enabled"\)\s+\.in\("id", recipientIds\);\s+if \(familyId != null\)/,
    "push worker global queries must not compare family_id with a null familyId",
  );
  assertMatches(
    edgeFunction,
    /if \(familyId != null\) \{\s*tokenQuery = tokenQuery\.eq\("family_id", familyId\);\s*recipientPreferenceQuery = recipientPreferenceQuery\.eq\("family_id", familyId\);\s*\} else \{\s*tokenQuery = tokenQuery\.in\("family_id", claimedFamilyIds\);\s*recipientPreferenceQuery = recipientPreferenceQuery\.in\("family_id", claimedFamilyIds\);\s*\}/,
    "push worker must scope family requests and include every claimed family for global requests",
  );
  for (const expected of [
    "new Set(pendingEvents.map((event) => event.family_id))",
    ".select(\"id,family_id,push_notifications_enabled,chat_notifications_enabled\")",
    "recipientFamilyKey(token.family_id, token.caregiver_id)",
    "recipientFamilyKey(preference.family_id, preference.id)",
    "recipientFamilyKey(event.family_id, event.recipient_caregiver_id)",
    "preferencesByRecipient.get(recipientKey)",
    "tokensByRecipient.get(recipientKey)",
    "Recipient caregiver does not belong to the event family",
  ]) {
    assertIncludes(edgeFunction, expected, `push worker family-recipient guard ${expected}`);
  }
  for (const expected of [
    "function sendExpoPush(",
    "for (const token of eventTokens)",
    "DeviceNotRegistered",
    ".select(\"id,family_id,push_notifications_enabled,chat_notifications_enabled\")",
  ]) {
    assertIncludes(edgeFunction, expected, `push worker delivery guard ${expected}`);
  }
  assertMatches(
    api,
    /export async function createFamilyChatMessage[\s\S]+?flushPendingPushNotifications\(supabase, familyId\);/i,
    "createFamilyChatMessage must trigger push delivery",
  );
  assertMatches(
    api,
    /export async function createLog[\s\S]+?flushPendingPushNotifications\(supabase, familyId\);/i,
    "createLog must trigger push delivery",
  );
  assertIncludes(appConfig, "\"expo-notifications\"", "Expo notifications config plugin");
  assertIncludes(api, "update_current_push_notification_settings", "personal push settings RPC");

  console.log("push notification delivery checks passed");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exit(1);
}
