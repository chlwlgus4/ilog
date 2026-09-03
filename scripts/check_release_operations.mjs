import { pathToFileURL } from "node:url";

export const operationCountKeys = Object.freeze([
  "open_reports", "urgent_unreviewed_reports", "overdue_reports",
  "stale_deletions", "failed_deletions", "apple_manual_required",
  "stale_apple_revocations", "failed_push_events", "stale_push_events",
]);

export function parseOperationsStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || typeof value.checked_at !== "string" || !Number.isFinite(Date.parse(value.checked_at))) {
    throw new Error("OPERATIONS_RESPONSE_INVALID");
  }
  const status = { checked_at: value.checked_at };
  for (const key of operationCountKeys) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
      throw new Error("OPERATIONS_RESPONSE_INVALID");
    }
    status[key] = value[key];
  }
  // An allowlist prevents accidental forwarding of new server PII fields.
  return status;
}

function secureUrl(value, allowLocal = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error("OPERATIONS_URL_INVALID"); }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash
      || (url.protocol !== "https:" && !(allowLocal && local && url.protocol === "http:"))) {
    throw new Error("OPERATIONS_URL_INVALID");
  }
  return url;
}

export async function checkOperations({ env = process.env, fetchImpl = fetch, notify = false } = {}) {
  const base = secureUrl(env.ILOG_OPERATIONS_SUPABASE_URL, true);
  const secret = env.ILOG_OPERATIONS_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("OPERATIONS_SERVICE_KEY_MISSING");
  const endpoint = new URL("/rest/v1/rpc/get_content_safety_operations_status_checked", base);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: "{}",
    });
  } catch { throw new Error("OPERATIONS_REQUEST_FAILED"); }
  if (!response.ok) throw new Error("OPERATIONS_REQUEST_FAILED");
  let data;
  try { data = await response.json(); } catch { throw new Error("OPERATIONS_RESPONSE_INVALID"); }
  const status = parseOperationsStatus(data);
  const actionable = operationCountKeys.some((key) => status[key] > 0);
  if (notify && actionable) {
    // Never forward the service key, identifiers, report details, or raw errors.
    const webhook = secureUrl(env.ILOG_OPERATIONS_ALERT_WEBHOOK_URL);
    let sent;
    try {
      sent = await fetchImpl(webhook, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "아이로그 운영 확인이 필요합니다.", service: "ilog", status }),
      });
    } catch { throw new Error("OPERATIONS_NOTIFICATION_FAILED"); }
    if (!sent.ok) throw new Error("OPERATIONS_NOTIFICATION_FAILED");
  }
  return { actionable, status };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("node scripts/check_release_operations.mjs [--notify]\n"
      + "Required server-only environment: ILOG_OPERATIONS_SUPABASE_URL, ILOG_OPERATIONS_SERVICE_ROLE_KEY\n"
      + "--notify additionally uses ILOG_OPERATIONS_ALERT_WEBHOOK_URL (HTTPS). No notification by default.\n"
      + "Exit: 0 healthy, 1 actionable items, 2 configuration/transport failure. Output contains counts only.");
  } else if (args.some((arg) => arg !== "--notify")) {
    console.error("OPERATIONS_ARGUMENT_INVALID");
    process.exitCode = 2;
  } else {
    try {
      const result = await checkOperations({ notify: args.includes("--notify") });
      console.log(JSON.stringify(result));
      process.exitCode = result.actionable ? 1 : 0;
    } catch (error) {
      const code = error instanceof Error && /^OPERATIONS_[A-Z_]+$/.test(error.message)
        ? error.message : "OPERATIONS_CHECK_FAILED";
      console.error(code);
      process.exitCode = 2;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
