import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
// @ts-ignore The operator script intentionally has no npm dependencies or build step.
import { buildOperationsEmail, emailCountLabels, notifyOperations, parseEmailOperationsStatus } from "../../scripts/notify_release_operations.mjs";

const now = new Date("2026-09-03T10:13:00.000Z");
const env = {
  NODE_ENV: "test" as const,
  ILOG_OPERATIONS_SUPABASE_URL: "https://operations-fixture.supabase.co",
  ILOG_OPERATIONS_MONITOR_SECRET: "fixture-monitor-secret",
  ILOG_OPERATIONS_RESEND_API_KEY: "fixture-resend-secret",
  ILOG_OPERATIONS_EMAIL_FROM: "아이로그 <sender@example.test>",
  ILOG_OPERATIONS_EMAIL_TO: "receiver@example.test, backup@example.test",
};
const healthy = () => ({ checked_at: now.toISOString(), ...Object.fromEntries(Object.keys(emailCountLabels).map((key) => [key, 0])) });
type Request = { url: string; options: RequestInit };
function transport(payload: unknown, firstError?: Error, responseStatus = 200) {
  const requests: Request[] = [];
  return {
    requests,
    fetchImpl: async (url: unknown, options?: RequestInit) => {
      requests.push({ url: String(url), options: options ?? {} });
      if (String(url) === "https://api.resend.com/emails") return Response.json({ id: "private-provider-id" });
      if (firstError) throw firstError;
      return Response.json(payload, { status: responseStatus });
    },
  };
}
const emailPayload = (request: Request) => JSON.parse(String(request.options.body));
const emailKey = (request: Request) => new Headers(request.options.headers).get("Idempotency-Key");

test("외부 점검은 전용 monitor secret만 HTTPS 고정 경로로 보내며 정상 상태는 무발송", async () => {
  const mock = transport({ ...healthy(), reporter_email: "private-data", raw_error: "private-error" });
  const result = await notifyOperations({ env, now, fetchImpl: mock.fetchImpl });
  assert.deepEqual(result, { status: "healthy", email: "not_needed" });
  assert.equal(mock.requests.length, 1);
  const request = mock.requests[0];
  assert.equal(request.url, `${env.ILOG_OPERATIONS_SUPABASE_URL}/functions/v1/check-release-operations`);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body, "{}");
  assert.equal(request.options.redirect, "error");
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.deepEqual(Object.fromEntries(new Headers(request.options.headers)), {
    "content-type": "application/json", "x-operations-monitor-secret": env.ILOG_OPERATIONS_MONITOR_SECRET,
  });
});

test("11개 집계 각각 알림을 활성화하며 본문·출력은 허용된 건수와 상태만 포함", async () => {
  for (const key of Object.keys(emailCountLabels)) {
    const mock = transport({ ...healthy(), [key]: 1, details: "private-report", id: "private-user-id" });
    const result = await notifyOperations({ env, now, fetchImpl: mock.fetchImpl });
    assert.deepEqual(result, { status: "attention", email: "accepted" });
    assert.equal(mock.requests.length, 2, key);
    const request = mock.requests[1];
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.options.redirect, "error");
    assert.ok(request.options.signal instanceof AbortSignal);
    const headers = new Headers(request.options.headers);
    assert.equal(headers.get("Authorization"), `Bearer ${env.ILOG_OPERATIONS_RESEND_API_KEY}`);
    assert.equal(headers.get("x-operations-monitor-secret"), null);
    const payload = emailPayload(request);
    assert.deepEqual(Object.keys(payload), ["from", "to", "subject", "text"]);
    assert.match(payload.text, new RegExp(`${emailCountLabels[key as keyof typeof emailCountLabels]}: 1건`));
    const visible = JSON.stringify([payload.subject, payload.text, result, emailKey(request)]);
    for (const privateValue of ["private-report", "private-user-id", "private-provider-id", "sender@example.test", "receiver@example.test", "fixture-monitor-secret", "fixture-resend-secret"]) {
      assert.equal(visible.includes(privateValue), false, privateValue);
    }
  }
});

test("누락·음수·문자열·소수·초과 정수·잘못된 시각은 유효한 집계로 오인하지 않는다", () => {
  for (const value of [-1, "0", 0.5, Number.MAX_SAFE_INTEGER + 1, undefined, null]) {
    assert.throws(() => parseEmailOperationsStatus({ ...healthy(), unhealthy_cron_jobs: value }), /OPERATIONS_RESPONSE_INVALID/);
  }
  for (const value of [null, [], {}, { ...healthy(), checked_at: "private-invalid-date" }]) {
    assert.throws(() => parseEmailOperationsStatus(value), /OPERATIONS_RESPONSE_INVALID/);
  }
  assert.deepEqual(parseEmailOperationsStatus({ ...healthy(), email: "private" }),
    Object.fromEntries(Object.keys(emailCountLabels).map((key) => [key, 0])));
});

test("API 오류·timeout·잘못된 JSON/집계는 원문 없는 장애 메일을 전송", async () => {
  const variants = [
    transport({ secret: "private-api-error" }, undefined, 503),
    transport(healthy(), new DOMException("private-timeout-secret", "TimeoutError")),
    transport({ ...healthy(), stale_deletions: "1", details: "private-report" }),
    transport({ ...healthy(), checked_at: "invalid private timestamp" }),
  ];
  for (const mock of variants) {
    const result = await notifyOperations({ env, now, fetchImpl: mock.fetchImpl });
    assert.deepEqual(result, { status: "monitor_unavailable", email: "accepted" });
    const payload = emailPayload(mock.requests[1]);
    assert.match(payload.subject, /운영 상태 확인 실패/);
    assert.match(payload.text, /현재 운영 건수는 확인할 수 없습니다/);
    assert.doesNotMatch(payload.text, /private|secret|복구|정상|: 0건/);
  }
  for (const invalidBody of ["not JSON private error", JSON.stringify({ ...healthy(), extra: "x".repeat(17_000) })]) {
    const requests: Request[] = [];
    const result = await notifyOperations({ env, now, fetchImpl: async (url: unknown, options?: RequestInit) => {
      requests.push({ url: String(url), options: options ?? {} });
      return requests.length === 1 ? new Response(invalidBody) : Response.json({ id: "accepted" });
    } });
    assert.equal(result.status, "monitor_unavailable");
    assert.equal(requests.length, 2);
  }
});

test("잘못된 monitor URL이나 누락 secret은 secret을 전송하지 않고 장애 메일로 알린다", async () => {
  for (const value of ["http://operations-fixture.supabase.co", "https://user:secret@example.test", "https://example.test/?secret=x", "https://example.test/#x", "https://example.test/wrong", "not a URL"]) {
    const mock = transport(healthy());
    const result = await notifyOperations({ env: { ...env, ILOG_OPERATIONS_SUPABASE_URL: value }, now, fetchImpl: mock.fetchImpl });
    assert.equal(result.status, "monitor_unavailable");
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].url, "https://api.resend.com/emails");
  }
  const mock = transport(healthy());
  await notifyOperations({ env: { ...env, ILOG_OPERATIONS_MONITOR_SECRET: "" }, now, fetchImpl: mock.fetchImpl });
  assert.equal(mock.requests.length, 1);
});

test("동일 시간대·상태는 checked_at 변화에도 같은 body/key이고 상태·시간·수신·발신 변경은 새 key", async () => {
  const run = async (time: Date, counts = { open_reports: 1 }, overrides = {}) => {
    const mock = transport({ ...healthy(), checked_at: time.toISOString(), ...counts });
    await notifyOperations({ env: { ...env, ...overrides }, now: time, fetchImpl: mock.fetchImpl });
    return mock.requests[1];
  };
  const first = await run(now);
  const sameHour = await run(new Date("2026-09-03T10:58:00Z"));
  assert.equal(emailKey(first), emailKey(sameHour));
  assert.equal(first.options.body, sameHour.options.body);
  assert.match(emailPayload(first).text, /2026-09-03T10:00:00.000Z/);
  assert.match(emailKey(first) ?? "", /^ilog-operations\/[a-f0-9]{64}$/);
  for (const changed of [
    await run(new Date("2026-09-03T11:01:00Z")),
    await run(now, { open_reports: 2 }),
    await run(now, undefined, { ILOG_OPERATIONS_EMAIL_TO: "other@example.test" }),
    await run(now, undefined, { ILOG_OPERATIONS_EMAIL_FROM: "other@example.test" }),
    await run(now, undefined, { ILOG_OPERATIONS_SUPABASE_URL: "https://another-fixture.supabase.co" }),
  ]) assert.notEqual(emailKey(first), emailKey(changed));
  const reordered = await run(now, undefined, { ILOG_OPERATIONS_EMAIL_TO: "backup@example.test,receiver@example.test" });
  assert.equal(emailKey(first), emailKey(reordered));
  assert.equal(first.options.body, reordered.options.body);
});

test("장애 원인 원문이 달라도 동일 시간의 같은 장애 알림 payload와 key는 안정적", () => {
  const first = buildOperationsEmail({ from: "sender@example.test", to: ["receiver@example.test"], counts: undefined, kind: "monitor_unavailable", now });
  const second = buildOperationsEmail({ from: "sender@example.test", to: ["receiver@example.test"], counts: undefined, kind: "monitor_unavailable", now: new Date("2026-09-03T10:59:59Z") });
  assert.deepEqual(first, second);
});

test("--test-email 동작은 가짜 신고와 API 조회 없이 명확한 검증 메일만 제출", async () => {
  const mock = transport(healthy());
  const result = await notifyOperations({ env: { ...env, ILOG_OPERATIONS_MONITOR_SECRET: "" }, now, testEmail: true, fetchImpl: mock.fetchImpl });
  assert.deepEqual(result, { status: "test", email: "accepted" });
  assert.equal(mock.requests.length, 1);
  const payload = emailPayload(mock.requests[0]);
  assert.match(payload.subject, /검증 메일/);
  assert.match(payload.text, /운영 상태를 조회하지 않으며/);
  assert.match(payload.text, /실제 신고나 장애가 발생했다는 뜻이 아닙니다/);
});

test("메일 설정·전송 실패는 수신자·secret·응답 원문을 노출하지 않고 실패", async () => {
  for (const overrides of [
    { ILOG_OPERATIONS_EMAIL_TO: "private-invalid-recipient" },
    { ILOG_OPERATIONS_EMAIL_TO: "receiver@example.test\r\nBcc:other@example.test" },
    { ILOG_OPERATIONS_EMAIL_FROM: "sender@example.test\nprivate" },
    { ILOG_OPERATIONS_RESEND_API_KEY: "" },
  ]) {
    let requests = 0;
    await assert.rejects(() => notifyOperations({ env: { ...env, ...overrides }, now, fetchImpl: async () => { requests += 1; return Response.json({}); } }), /^Error: OPERATIONS_EMAIL_CONFIG_INVALID$/);
    assert.equal(requests, 0);
  }
  for (const response of [new Response("private-provider-secret", { status: 500 }), Response.json({}), new Response("private-invalid-json")]) {
    await assert.rejects(() => notifyOperations({ env, now, testEmail: true, fetchImpl: async () => response }), /^Error: OPERATIONS_EMAIL_FAILED$/);
  }
  await assert.rejects(() => notifyOperations({ env, now, testEmail: true, fetchImpl: async () => { throw new Error("private-secret network error"); } }), /^Error: OPERATIONS_EMAIL_FAILED$/);
});

test("CLI는 기본 알림을 활성화하고 configuration/argument 오류는 고정 코드만 출력", () => {
  const script = fileURLToPath(new URL("../../scripts/notify_release_operations.mjs", import.meta.url));
  for (const args of [[], ["--private-invalid-secret"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { NODE_ENV: "test" } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^OPERATIONS_(EMAIL_CONFIG|ARGUMENT)_INVALID\n$/);
    assert.equal(result.stdout, "");
  }
});

test("Actions는5분·수동 전용이며 SHA pin·읽기 권한·비밀값 격리·시간 제한을 유지", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/release-operations.yml", import.meta.url), "utf8");
  assert.match(workflow, /cron: '3-58\/5 \* \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /type: boolean/);
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|^\s+push:|SERVICE_ROLE|npm (?:install|ci)|continue-on-error|write-all/m);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /if: vars\.ILOG_OPERATIONS_MONITOR_ENABLED == 'true'/);
  assert.match(workflow, /node-version: '24\.14\.1'/);
  assert.match(workflow, /package-manager-cache: false/);
  const actions = [...workflow.matchAll(/uses: (actions\/[a-z-]+)@([^\s]+)/g)];
  assert.equal(actions.length, 2);
  for (const [, , sha] of actions) assert.match(sha, /^[a-f0-9]{40}$/);
  for (const key of Object.keys(env).filter((key) => key.startsWith("ILOG_"))) assert.ok(workflow.includes(`secrets.${key}`));
  assert.match(workflow, /node scripts\/notify_release_operations\.mjs --test-email/);
});
