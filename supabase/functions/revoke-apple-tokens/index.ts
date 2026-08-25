import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";

import {
  appleRevocationErrorCode,
  revokeAppleRefreshToken,
} from "../_shared/appleSignIn.ts";

type ClaimedToken = {
  auth_user_id: string;
  refresh_token: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function secureEquals(left: string, right: string) {
  if (!left || left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const workerSecret = requiredEnv("PUSH_WORKER_CRON_SECRET");
    const providedSecret = req.headers.get("x-apple-revoke-worker-secret")?.trim() ?? "";
    if (!secureEquals(providedSecret, workerSecret)) {
      return jsonResponse({ error: "INVALID_WORKER_SECRET" }, 401);
    }

    const requestBody = await req.json().catch(() => ({})) as Record<string, unknown>;
    const requestedLimit = Number(requestBody.limit ?? 25);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
      : 25;
    const serviceClient = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data, error: claimError } = await serviceClient.rpc(
      "claim_due_apple_token_revocations",
      { p_limit: limit },
    );
    if (claimError) {
      return jsonResponse({ error: "APPLE_TOKEN_CLAIM_FAILED" }, 503);
    }

    const claimedTokens = (data ?? []) as ClaimedToken[];
    let revoked = 0;
    let failed = 0;

    for (const claimed of claimedTokens) {
      let revocationError: string | null = null;
      try {
        await revokeAppleRefreshToken(claimed.refresh_token);
      } catch (error) {
        revocationError = appleRevocationErrorCode(error);
      }

      const { error: completionError } = await serviceClient.rpc(
        "complete_apple_token_revocation",
        {
          p_auth_user_id: claimed.auth_user_id,
          p_error: revocationError,
        },
      );

      if (completionError || revocationError) {
        failed += 1;
      } else {
        revoked += 1;
      }
    }

    return jsonResponse({ processed: claimedTokens.length, revoked, failed });
  } catch {
    return jsonResponse({ error: "APPLE_REVOCATION_WORKER_UNAVAILABLE" }, 503);
  }
});
