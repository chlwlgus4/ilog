const countKeys = [
  "open_reports", "urgent_unreviewed_reports", "overdue_reports",
  "stale_deletions", "failed_deletions", "apple_manual_required",
  "stale_apple_revocations", "failed_push_events", "stale_push_events",
  "unhealthy_cron_jobs", "failed_worker_requests",
] as const;

type Dependencies = {
  env: (name: string) => string | undefined;
  fetchImpl?: typeof fetch;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function secureEquals(left: string, right: string) {
  if (left.length !== right.length || !left) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

// The external scheduler receives only a dedicated monitor secret, never the
// service-role key. This endpoint cannot read reports or mutate user data.
export function createOperationsHandler({ env, fetchImpl = fetch }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const monitorSecret = env("OPERATIONS_MONITOR_SECRET");
    if (!monitorSecret || monitorSecret.length < 32) return json({ error: "MONITOR_UNAVAILABLE" }, 503);
    if (!secureEquals(request.headers.get("x-operations-monitor-secret") ?? "", monitorSecret)) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }

    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const baseUrl = env("SUPABASE_URL");
    if (!serviceKey || !baseUrl || !/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(baseUrl)) {
      return json({ error: "MONITOR_UNAVAILABLE" }, 503);
    }
    try {
      const response = await fetchImpl(new URL("/rest/v1/rpc/get_content_safety_operations_status_checked", baseUrl), {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(12_000),
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) return json({ error: "MONITOR_UNAVAILABLE" }, 503);
      const value = await response.json();
      if (!value || typeof value !== "object" || Array.isArray(value)
          || typeof value.checked_at !== "string" || !Number.isFinite(Date.parse(value.checked_at))) {
        return json({ error: "MONITOR_UNAVAILABLE" }, 503);
      }
      const result: Record<string, unknown> = { checked_at: value.checked_at };
      for (const key of countKeys) {
        if (!Number.isSafeInteger(value[key]) || value[key] < 0) return json({ error: "MONITOR_UNAVAILABLE" }, 503);
        result[key] = value[key];
      }
      return json(result);
    } catch {
      // Do not log provider responses, request headers, or potentially private errors.
      return json({ error: "MONITOR_UNAVAILABLE" }, 503);
    }
  };
}
