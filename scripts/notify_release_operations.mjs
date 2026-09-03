import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const emailCountLabels = Object.freeze({
  open_reports: "미처리 신고",
  urgent_unreviewed_reports: "긴급 미검토 신고",
  overdue_reports: "처리 기한 초과 신고",
  stale_deletions: "지연된 계정 삭제",
  failed_deletions: "실패한 계정 삭제",
  apple_manual_required: "Apple 수동 처리 필요",
  stale_apple_revocations: "지연된 Apple 토큰 해지",
  failed_push_events: "실패한 푸시",
  stale_push_events: "지연된 푸시",
  unhealthy_cron_jobs: "비정상 예약 작업",
  failed_worker_requests: "실패한 작업 요청",
});

const resendEndpoint = "https://api.resend.com/emails";
const requestTimeoutMs = 15_000;
const failure = (code) => new Error(code);

export function parseEmailOperationsStatus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || typeof value.checked_at !== "string" || !Number.isFinite(Date.parse(value.checked_at))) {
    throw failure("OPERATIONS_RESPONSE_INVALID");
  }
  const counts = {};
  for (const key of Object.keys(emailCountLabels)) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
      throw failure("OPERATIONS_RESPONSE_INVALID");
    }
    counts[key] = value[key];
  }
  // Do not forward server timestamps, additional fields, identifiers or error details.
  return counts;
}

function monitorEndpoint(env) {
  let base;
  try { base = new URL(env.ILOG_OPERATIONS_SUPABASE_URL); } catch {
    throw failure("OPERATIONS_MONITOR_CONFIG_INVALID");
  }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash
      || base.pathname !== "/" || (base.port && base.port !== "443")) {
    throw failure("OPERATIONS_MONITOR_CONFIG_INVALID");
  }
  const secret = env.ILOG_OPERATIONS_MONITOR_SECRET?.trim();
  if (!secret || /[\r\n]/.test(secret)) throw failure("OPERATIONS_MONITOR_CONFIG_INVALID");
  return { url: new URL("/functions/v1/check-release-operations", base), secret };
}

function emailConfiguration(env) {
  const from = env.ILOG_OPERATIONS_EMAIL_FROM?.trim();
  const recipientInput = env.ILOG_OPERATIONS_EMAIL_TO?.trim();
  const apiKey = env.ILOG_OPERATIONS_RESEND_API_KEY?.trim();
  const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,63}$/;
  const fromAddress = from?.match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? from;
  const to = recipientInput?.split(",").map((item) => item.trim()) ?? [];
  if (!from || from.length > 320 || /[\x00-\x1f\x7f]/.test(from)
      || !emailPattern.test(fromAddress ?? "") || !recipientInput || /[\x00-\x1f\x7f]/.test(recipientInput)
      || to.length > 10 || to.some((item) => item.length > 254 || !emailPattern.test(item))
      || !apiKey || /[\r\n]/.test(apiKey)) {
    throw failure("OPERATIONS_EMAIL_CONFIG_INVALID");
  }
  return { from, to: [...new Set(to)].sort(), apiKey };
}

async function boundedJson(response) {
  if (!response.body) throw failure("OPERATIONS_RESPONSE_INVALID");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw failure("OPERATIONS_RESPONSE_INVALID");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}

async function getCounts(env, fetchImpl) {
  const { url, secret } = monitorEndpoint(env);
  const response = await fetchImpl(url, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs),
    headers: { "Content-Type": "application/json", "x-operations-monitor-secret": secret },
    body: "{}",
  });
  if (!response.ok) throw failure("OPERATIONS_REQUEST_FAILED");
  return parseEmailOperationsStatus(await boundedJson(response));
}

export function buildOperationsEmail({ from, to, counts, kind, now, scope = "" }) {
  // Same hour + state must produce the exact same payload for Resend idempotency.
  const hour = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
  const lines = ["아이로그 운영 알림", `알림 기준 시간(UTC): ${hour}`];
  let subject;
  if (kind === "test") {
    subject = "[아이로그] 운영 알림 검증 메일";
    lines.push("상태: 검증 메일", "메일 발송 경로 확인용입니다. 실제 신고나 장애가 발생했다는 뜻이 아닙니다.",
      "이 검증은 운영 상태를 조회하지 않으며 정상 또는 복구 여부를 확인하지 않습니다.");
  } else if (kind === "monitor_unavailable") {
    subject = "[아이로그] 운영 상태 확인 실패";
    lines.push("상태: 운영 상태 확인 실패", "점검 API 또는 점검 설정을 확인해 주세요. 현재 운영 건수는 확인할 수 없습니다.");
  } else {
    subject = "[아이로그] 운영 확인 필요";
    lines.push("상태: 운영 확인 필요");
    for (const [key, label] of Object.entries(emailCountLabels)) lines.push(`${label}: ${counts[key]}건`);
  }
  lines.push("", "동일 상태의 알림은 시간 단위로 중복을 제한하며, 미해결 상태는 다음 시간대에 다시 알립니다.");
  const body = JSON.stringify({ from, to: [...to].sort(), subject, text: lines.join("\n") });
  const fingerprint = createHash("sha256").update(JSON.stringify(["ilog-operations-v1", scope, body])).digest("hex");
  return { body, idempotencyKey: `ilog-operations/${fingerprint}` };
}

export async function notifyOperations({ env = process.env, fetchImpl = fetch, now = new Date(), testEmail = false } = {}) {
  // Validate mail settings even when healthy so an unusable alarm path fails visibly.
  const { from, to, apiKey } = emailConfiguration(env);
  let counts;
  let kind = testEmail ? "test" : "attention";
  if (!testEmail) {
    try { counts = await getCounts(env, fetchImpl); } catch { kind = "monitor_unavailable"; }
    if (counts && Object.values(counts).every((count) => count === 0)) {
      return { status: "healthy", email: "not_needed" };
    }
  }
  const { body, idempotencyKey } = buildOperationsEmail({
    from, to, counts, kind, now, scope: env.ILOG_OPERATIONS_SUPABASE_URL ?? "",
  });
  try {
    const response = await fetchImpl(resendEndpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body,
    });
    if (!response.ok) throw failure("OPERATIONS_EMAIL_FAILED");
    const accepted = await boundedJson(response);
    if (typeof accepted?.id !== "string" || !accepted.id.trim()) throw failure("OPERATIONS_EMAIL_FAILED");
  } catch { throw failure("OPERATIONS_EMAIL_FAILED"); }
  // Accepted by the provider is not proof of inbox delivery; never print provider IDs.
  return { status: kind, email: "accepted" };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("node scripts/notify_release_operations.mjs [--test-email]\n"
      + "Default: check operations and send attention/failure email; healthy checks are silent.\n"
      + "Server-only environment: ILOG_OPERATIONS_SUPABASE_URL, ILOG_OPERATIONS_MONITOR_SECRET,\n"
      + "ILOG_OPERATIONS_RESEND_API_KEY, ILOG_OPERATIONS_EMAIL_FROM, ILOG_OPERATIONS_EMAIL_TO.\n"
      + "--test-email only verifies email submission; no operations query or synthetic report.\n"
      + "Exit: 0 healthy/email accepted, 1 monitor unavailable (email accepted), 2 mail/configuration failure.");
    return;
  }
  if (args.length > 1 || args.some((arg) => arg !== "--test-email")) {
    console.error("OPERATIONS_ARGUMENT_INVALID");
    process.exitCode = 2;
    return;
  }
  try {
    const result = await notifyOperations({ testEmail: args.includes("--test-email") });
    console.log(JSON.stringify(result));
    process.exitCode = result.status === "monitor_unavailable" ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error && error.message === "OPERATIONS_EMAIL_CONFIG_INVALID"
      ? "OPERATIONS_EMAIL_CONFIG_INVALID" : "OPERATIONS_EMAIL_FAILED");
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
