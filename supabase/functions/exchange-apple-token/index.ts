import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";

import {
  AppleOAuthError,
  exchangeAppleAuthorizationCode,
  verifiedAppleSubjectFromIdToken,
} from "../_shared/appleSignIn.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function appleIdentitySubject(user: { identities?: Array<Record<string, unknown>> | null }) {
  const identity = user.identities?.find((candidate) => candidate.provider === "apple");
  if (!identity) {
    return null;
  }

  const identityData = identity.identity_data;
  if (identityData && typeof identityData === "object" && !Array.isArray(identityData)) {
    const subject = (identityData as Record<string, unknown>).sub;
    if (typeof subject === "string" && subject.length > 0) {
      return subject;
    }
  }

  return typeof identity.identity_id === "string" && identity.identity_id.length > 0
    ? identity.identity_id
    : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization")?.trim() ?? "";
    if (!authorization) {
      return jsonResponse({ error: "AUTHORIZATION_REQUIRED" }, 401);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: userPayload, error: userError } = await userClient.auth.getUser();
    if (userError || !userPayload.user) {
      return jsonResponse({ error: "INVALID_SESSION" }, 401);
    }

    const expectedSubject = appleIdentitySubject(userPayload.user);
    if (!expectedSubject) {
      return jsonResponse({ error: "APPLE_IDENTITY_NOT_FOUND" }, 403);
    }

    const requestBody = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (requestBody?.action === "status") {
      const { data: stored, error: statusError } = await serviceClient.rpc(
        "has_apple_sign_in_refresh_token",
        { p_auth_user_id: userPayload.user.id },
      );
      if (statusError) {
        return jsonResponse({ error: "APPLE_TOKEN_STATUS_FAILED" }, 503);
      }
      return jsonResponse({ stored: stored === true });
    }

    const authorizationCode = typeof requestBody?.authorizationCode === "string"
      ? requestBody.authorizationCode.trim()
      : "";
    if (authorizationCode.length < 8 || authorizationCode.length > 4096) {
      return jsonResponse({ error: "APPLE_AUTHORIZATION_CODE_REQUIRED" }, 400);
    }

    const exchanged = await exchangeAppleAuthorizationCode(authorizationCode);
    if (await verifiedAppleSubjectFromIdToken(exchanged.idToken) !== expectedSubject) {
      return jsonResponse({ error: "APPLE_ACCOUNT_MISMATCH" }, 403);
    }

    const { error: storeError } = await serviceClient.rpc(
      "store_apple_sign_in_refresh_token",
      {
        p_auth_user_id: userPayload.user.id,
        p_refresh_token: exchanged.refreshToken,
      },
    );
    if (storeError) {
      return jsonResponse({ error: "APPLE_TOKEN_STORAGE_FAILED" }, 503);
    }

    return jsonResponse({ stored: true });
  } catch (error) {
    if (error instanceof AppleOAuthError) {
      const status = error.appleCode === "invalid_grant" ? 400 : 503;
      return jsonResponse({ error: "APPLE_TOKEN_EXCHANGE_FAILED" }, status);
    }
    return jsonResponse({ error: "APPLE_TOKEN_EXCHANGE_UNAVAILABLE" }, 503);
  }
});
