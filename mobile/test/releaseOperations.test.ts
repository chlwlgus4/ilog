import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore The operator CLI is intentionally a dependency-free Node module.
import { checkOperations, operationCountKeys, parseOperationsStatus } from "../../scripts/check_release_operations.mjs";

const healthy = () => ({ checked_at: "2026-09-03T00:00:00.000Z", ...Object.fromEntries(operationCountKeys.map((key: string) => [key, 0])) });
const env = { NODE_ENV: "test" as const, ILOG_OPERATIONS_SUPABASE_URL: "http://127.0.0.1:54321", ILOG_OPERATIONS_SERVICE_ROLE_KEY: "test-only-secret", ILOG_OPERATIONS_ALERT_WEBHOOK_URL: "https://alerts.example.test/ilog" };

test("운영 집계는 허용된 정수만 남기고 개인정보와 오류 원문을 버린다", () => {
  assert.deepEqual(parseOperationsStatus({ ...healthy(), details: "private", auth_user_id: "private" }), healthy());
  assert.throws(() => parseOperationsStatus({ ...healthy(), open_reports: -1 }), /RESPONSE_INVALID/);
  assert.throws(() => parseOperationsStatus({ ...healthy(), stale_deletions: "0" }), /RESPONSE_INVALID/);
});

test("운영 점검은 기본 조회만 하고 미처리 신고도 조치 대상으로 반환한다", async () => {
  let calls = 0;
  const result = await checkOperations({ env, fetchImpl: async () => {
    calls += 1;
    return Response.json({ ...healthy(), open_reports: 1 });
  } });
  assert.equal(result.actionable, true);
  assert.equal(calls, 1);
});

test("운영 웹훅 알림은 명시 옵션에서만 집계를 보내고 비밀키를 전달하지 않는다", async () => {
  const requests: { url: string; options: RequestInit }[] = [];
  await checkOperations({ env, notify: true, fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options: options ?? {} });
    return requests.length === 1 ? Response.json({ ...healthy(), stale_deletions: 1, details: "private" }) : new Response("ok");
  } });
  assert.equal(requests.length, 2);
  const notification = JSON.stringify(requests[1]);
  assert.equal(notification.includes("test-only-secret"), false);
  assert.equal(notification.includes("private"), false);
  assert.equal(requests[1].options.redirect, "error");
});

test("운영 점검·알림 오류는 비밀값이나 응답 본문을 노출하지 않는다", async () => {
  await assert.rejects(() => checkOperations({ env, fetchImpl: async () => { throw new Error("private secret"); } }), /^Error: OPERATIONS_REQUEST_FAILED$/);
  await assert.rejects(() => checkOperations({ env: { ...env, ILOG_OPERATIONS_SUPABASE_URL: "http://public.example.test" } }), /OPERATIONS_URL_INVALID/);
  await assert.rejects(() => checkOperations({ env, fetchImpl: async () => new Response("private secret", { status: 500 }) }), /^Error: OPERATIONS_REQUEST_FAILED$/);
});
