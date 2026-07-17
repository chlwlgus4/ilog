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
  const appConfig = read("mobile/app.config.ts");

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
  for (const expected of [
    "function sendExpoPush(",
    "for (const token of eventTokens)",
    "DeviceNotRegistered",
    ".select(\"id,push_notifications_enabled,chat_notifications_enabled\")",
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
