import assert from "node:assert/strict";
import test from "node:test";
import { createOperationsHandler } from "../../supabase/functions/check-release-operations/handler";

const secret = "test-monitor-secret-with-more-than-32-characters";
const values: Record<string, string> = {
  OPERATIONS_MONITOR_SECRET: secret,
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "private-service-key",
};
const status = {
  checked_at: "2026-09-03T00:00:00.000Z", open_reports: 1,
  urgent_unreviewed_reports: 0, overdue_reports: 0, stale_deletions: 0,
  failed_deletions: 0, apple_manual_required: 0, stale_apple_revocations: 0,
  failed_push_events: 0, stale_push_events: 0, unhealthy_cron_jobs: 0, failed_worker_requests: 0,
};
const request = (key = secret) => new Request("https://monitor.example.test", {
  method: "POST", headers: { "x-operations-monitor-secret": key },
});

test("외부 점검은 전용 비밀키를 검증한 뒤에만 서버 집계를 읽는다", async () => {
  let calls = 0;
  const handler = createOperationsHandler({ env: (name) => values[name], fetchImpl: async () => {
    calls += 1;
    return Response.json(status);
  } });
  assert.equal((await handler(request("wrong-key"))).status, 401);
  assert.equal((await handler(new Request("https://monitor.example.test"))).status, 405);
  assert.equal(calls, 0);
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls, 1);
});

test("외부 점검 응답은 신고 본문·식별자·비밀값을 버리고 건수만 반환한다", async () => {
  const handler = createOperationsHandler({ env: (name) => values[name], fetchImpl: async (url, options) => {
    assert.equal(String(url), "https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/get_content_safety_operations_status_checked");
    assert.equal(options?.redirect, "error");
    return Response.json({ ...status, details: "private", token: values.SUPABASE_SERVICE_ROLE_KEY });
  } });
  const response = await handler(request());
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), status);
});

test("외부 점검은 잘못된 집계·통신 오류를 비식별 장애로 반환한다", async () => {
  for (const value of [{ ...status, failed_worker_requests: -1 }, { ...status, open_reports: "1" }, null]) {
    const handler = createOperationsHandler({ env: (name) => values[name], fetchImpl: async () => Response.json(value) });
    assert.equal((await handler(request())).status, 503);
  }
  const handler = createOperationsHandler({ env: (name) => values[name], fetchImpl: async () => {
    throw new Error("private upstream credentials");
  } });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "MONITOR_UNAVAILABLE" });
});

test("외부 점검의 누락·짧은 키와 다른 호스트 설정은 fail closed 한다", async () => {
  const cases: Record<string, string>[] = [{ OPERATIONS_MONITOR_SECRET: "short" }, { SUPABASE_URL: "https://attacker.example.test" }, { SUPABASE_SERVICE_ROLE_KEY: "" }];
  for (const overrides of cases) {
    const config = { ...values, ...overrides };
    const handler = createOperationsHandler({ env: (name) => config[name], fetchImpl: async () => {
      assert.fail("invalid configuration must not call upstream");
    } });
    assert.equal((await handler(request())).status, 503);
  }
});
